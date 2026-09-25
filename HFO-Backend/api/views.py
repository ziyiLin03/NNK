from django.http import HttpResponse, JsonResponse
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
import cloudinary.uploader
from rest_framework import generics, parsers, filters, status
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.response import Response
from rest_framework_simplejwt.authentication import JWTAuthentication
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.permissions import BasePermission, IsAuthenticated
import re
from .permissions import IsAdmin, IsAnalyst, IsVolunteer
import os  
import csv
import logging
from groq import Groq
from .media_uploads import save_audio, storage_unavailable
from django.shortcuts import get_object_or_404

from core.models import ChatRoom, ChatMessage
from .serializers import ChatMessageSerializer, ChatRoomSerializer
from django.utils import timezone
from datetime import timedelta

from .serializers import (
    UserCreateSerializer,
    FieldReportCreateSerializer,    
    FieldReportReadSerializer,
    UserManagementSerializer,
    UserResetPasswordSerializer,
)
from .filters import FieldReportFilter
from core.models import FieldReport, ReportPosition, ReportPhoto, ReportAudio

User = get_user_model()

# ─── Simple in-memory rate limiter ───────────────────────────────────────────
# Tracks per-user send timestamps without needing django-ratelimit installed.
# Allows max 30 messages per 60 seconds per user.
 
from collections import defaultdict
import threading
 
_rate_lock   = threading.Lock()
_send_log    = defaultdict(list)   # { user_id: [datetime, ...] }
RATE_LIMIT   = 30                  # max messages
RATE_WINDOW  = 60                  # seconds
 
def _is_rate_limited(user_id):
    now    = timezone.now()
    cutoff = now - timedelta(seconds=RATE_WINDOW)
    with _rate_lock:
        _send_log[user_id] = [t for t in _send_log[user_id] if t > cutoff]
        if len(_send_log[user_id]) >= RATE_LIMIT:
            return True
        _send_log[user_id].append(now)
        return False
 
 
# ─── GET or CREATE the global room (singleton) ───────────────────────────────
 
def get_or_create_global_room():
    room, _ = ChatRoom.objects.get_or_create(room_type='global')
    return room

# ─── Usuarios: Crear ──────────────────────────────────────────────────────────

class UserCreateView(generics.CreateAPIView):
    serializer_class   = UserCreateSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAdmin]


# ─── FieldReport: Crear ───────────────────────────────────────────────────────

class ReportCreateView(generics.CreateAPIView):
    serializer_class   = FieldReportCreateSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsVolunteer]
    parser_classes     = [parsers.MultiPartParser, parsers.FormParser, parsers.JSONParser]

    def get_serializer_context(self):
        return {'request': self.request}

    def create(self, request, *args, **kwargs):
        write_serializer = FieldReportCreateSerializer(
            data=request.data,
            context={'request': request}
        )
        write_serializer.is_valid(raise_exception=True)
        report = write_serializer.save()
        read_serializer = FieldReportReadSerializer(report, context={'request': request})
        return Response(read_serializer.data, status=status.HTTP_201_CREATED)


# ─── FieldReport: Solo mi lista ───────────────────────────────────────────────

class MyReportsListView(generics.ListAPIView):
    serializer_class = FieldReportReadSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FieldReport.objects.prefetch_related('positions', 'photos', 'audios').filter(
            submitted_by=self.request.user,
            is_submitted=False
        )
        
        # NUEVO: Escuchar el parámetro group_id de la URL
        group_id = self.request.query_params.get('group_id')
        if group_id and group_id != "null":
            qs = qs.filter(group_id=group_id)
            
        return qs.order_by('-timestamp')

# ─── FieldReport: Mis detalles ────────────────────────────────────────────────

class MyReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = FieldReport.objects.prefetch_related('positions', 'photos', 'audios').filter(
            submitted_by=self.request.user
        )
        if self.request.method in ['PATCH', 'PUT', 'DELETE']:
            qs = qs.filter(is_submitted=False)
        return qs

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return FieldReportCreateSerializer
        return FieldReportReadSerializer

# ─── FieldReport: Listar ──────────────────────────────────────────────────────

class ReportListView(generics.ListAPIView):
    serializer_class       = FieldReportReadSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes = [IsAnalyst]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_class = FieldReportFilter
    ordering_fields = ['timestamp', 'people_count']

    def get_queryset(self):
        qs = FieldReport.objects.prefetch_related('positions', 'photos', 'audios').filter(is_submitted=True)
        
        # NUEVO: Escuchar el parámetro group_id de la URL
        group_id = self.request.query_params.get('group_id')
        if group_id and group_id != "null":
            qs = qs.filter(group_id=group_id)
            
        return qs
    

class ReportGroupMembersView(generics.ListAPIView):
    """
    GET /api/reports/group/<group_id>/
    Returns all reports sharing a group_id, regardless of who submitted them
    or whether they're submitted. Auth required, no role restriction beyond that.
    """
    serializer_class       = FieldReportReadSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAuthenticated]

    def get_queryset(self):
        group_id = self.kwargs.get('group_id')
        return (
            FieldReport.objects
            .prefetch_related('positions', 'photos', 'audios')
            .filter(group_id=group_id)
        )

# ─── FieldReport: Detalle ─────────────────────────────────────────────────────

class ReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    authentication_classes = [JWTAuthentication]

    def get_permissions(self):
        if self.request.method in ['PATCH', 'PUT', 'DELETE']:
            return [IsAdmin()]
        return [IsAnalyst()]

    def get_queryset(self):
        return FieldReport.objects.prefetch_related('positions', 'photos', 'audios').all()

    def get_serializer_class(self):
        if self.request.method in ['PUT', 'PATCH']:
            return FieldReportCreateSerializer
        return FieldReportReadSerializer


# ─── FieldReport: Actualizar borrador ────────────────────────────────────────

class ReportUpdateView(generics.UpdateAPIView):
    serializer_class       = FieldReportCreateSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsVolunteer]
    parser_classes         = [parsers.MultiPartParser, parsers.FormParser]
    http_method_names      = ['put', 'patch']

    def get_queryset(self):
        return FieldReport.objects.filter(
            submitted_by=self.request.user,
            status='draft'
        )


# ─── FieldReport: Enviar borrador ────────────────────────────────────────────

@api_view(['POST'])
@permission_classes([IsVolunteer])
def submit_report(request, pk):
    try:
        report = FieldReport.objects.get(pk=pk, submitted_by=request.user, status='draft')
    except FieldReport.DoesNotExist:
        return Response({"detail": "Reporte no encontrado o ya enviado."}, status=status.HTTP_404_NOT_FOUND)
    report.status = 'submitted'
    report.save()
    return Response({"detail": "Reporte enviado correctamente."}, status=status.HTTP_200_OK)


# ─── Data Export ─────────────────────────────────────────────────────────────

class DataExportView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAnalyst]

    def get(self, request, *args, **kwargs):
        reports = FieldReport.objects.filter(
            status='submitted'
        ).select_related('submitted_by').prefetch_related('positions', 'photos', 'audios').all()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="hfo_export.csv"'
        writer = csv.writer(response)
        writer.writerow([
            'id_unico', 'hora_evento', 'hora_registro', 'timezone',
            'lat', 'long', 'tipo_punto', 'category', 'description',
            'interview_type', 'people_count'
        ])
        counter = 1
        for report in reports:
            for position in report.positions.all():
                writer.writerow([
                    f'P{counter:04d}', report.hora_evento, report.timestamp,
                    report.timezone, position.latitude, position.longitude,
                    report.tipo_punto, position.category, position.description,
                    report.interview_type, report.people_count,
                ])
                counter += 1
        return response


# ─── Usuarios: Listar, Editar, Eliminar ──────────────────────────────────────

class UserListView(generics.ListAPIView):
    serializer_class       = UserManagementSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAdmin]
    queryset               = User.objects.all().order_by('id')


class UserUpdateView(generics.UpdateAPIView):
    serializer_class       = UserManagementSerializer
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAdmin]
    queryset               = User.objects.all()
    http_method_names      = ['put', 'patch']


class UserDeleteView(generics.DestroyAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAdmin]
    queryset               = User.objects.all()

    def destroy(self, request, *args, **kwargs):
        user_to_delete = self.get_object()
        if user_to_delete == request.user:
            return Response({"detail": "No puedes eliminarte a ti mismo."}, status=status.HTTP_400_BAD_REQUEST)
        user_to_delete.delete()
        return Response({"detail": "Usuario eliminado correctamente."}, status=status.HTTP_204_NO_CONTENT)


# ─── Stats ────────────────────────────────────────────────────────────────────

class StatsView(generics.GenericAPIView):
    authentication_classes = [JWTAuthentication]
    permission_classes     = [IsAnalyst]

    def get(self, request, *args, **kwargs):
        base_qs = FieldReport.objects.filter(is_submitted=True)
        total_reportes = base_qs.count()
        media_personas = base_qs.aggregate(media=Avg('people_count'))['media']
        distribucion_tipo = (
            base_qs.values('tipo_punto').annotate(total=Count('id')).order_by('-total')
        )
        return Response({
            'total_reportes':          total_reportes,
            'media_personas':          round(media_personas, 2) if media_personas else 0,
            'distribucion_tipo_punto': list(distribucion_tipo),
        })


# ─── UPLOADS: Photo ───────────────────────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsVolunteer])
def upload_photo(request):
    """POST /api/upload-photo/ — uploads to Cloudinary, returns secure_url"""
    try:
        image_data = request.data.get('image')
        if not image_data:
            return Response({'error': 'No image data provided'}, status=status.HTTP_400_BAD_REQUEST)
        unavailable = storage_unavailable()
        if unavailable is not None:
            return unavailable
        upload_result = cloudinary.uploader.upload(image_data, folder="hfo_photos")
        return Response({'url': upload_result.get('secure_url')}, status=status.HTTP_201_CREATED)
    except Exception as e:
        print(f"🚨 ERROR EN UPLOAD_PHOTO: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['DELETE'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsVolunteer])
def delete_photo(request):
    """
    DELETE /api/delete-photo/
    Deletes a photo from Cloudinary by URL.
    Also removes the ReportPhoto DB row if one exists (optional — signal handles
    it when a FieldReport is deleted, but here we delete standalone rows too).
    """
    try:
        url = request.data.get('url')
        if not url:
            return Response({'error': 'URL not provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Extract Cloudinary public_id from URL
        match = re.search(r'/upload/(?:v\d+/)?(.+?)\.[^.]+$', url)
        if not match:
            return Response({'error': 'Invalid Cloudinary URL format'}, status=status.HTTP_400_BAD_REQUEST)

        public_id = match.group(1)
        cloudinary.uploader.destroy(public_id)

        # Also remove the DB row if it exists (won't fail if not found)
        ReportPhoto.objects.filter(image=url).delete()

        return Response({'status': 'deleted', 'id': public_id}, status=status.HTTP_200_OK)
    except Exception as e:
        print(f"🚨 ERROR EN DELETE_PHOTO: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ─── UPLOADS: Audio ───────────────────────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsVolunteer])
def upload_audio(request):
    return save_audio(request.data)


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsVolunteer])
def translate_corrected_text(request):
    """POST /api/translate-text/"""
    text = request.data.get('text')
    if not text:
        return Response({'error': 'No text provided'}, status=status.HTTP_400_BAD_REQUEST)
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return Response(
            {'error': 'Automatic translation is not configured.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )
    try:
        client = Groq(api_key=api_key, timeout=20, max_retries=0)
        completion = client.chat.completions.create(
            model=os.environ.get("GROQ_TRANSLATION_MODEL", "openai/gpt-oss-20b"),
            messages=[
                {"role": "system", "content": "You are a professional translator for No Name Kitchen NGO. Translate the following text to English accurately. Return ONLY the translated text, without quotes, explanations, or extra words."},
                {"role": "user", "content": text}
            ],
            temperature=0.3,
        )
        translation = completion.choices[0].message.content.strip()
        return Response({'translation': translation}, status=status.HTTP_200_OK)
    except Exception:
        logging.getLogger(__name__).exception("Text translation failed")
        return Response(
            {'error': 'Automatic translation is temporarily unavailable.'},
            status=status.HTTP_502_BAD_GATEWAY,
        )


@api_view(['DELETE'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsVolunteer])
def delete_audio(request):
    """DELETE /api/delete-audio/"""
    try:
        url = request.data.get('url')
        if url:
            match = re.search(r'/upload/(?:v\d+/)?(.+?)\.[^.]+$', url)
            if match:
                public_id = match.group(1)
                print(f"🗑️ Deleting audio from Cloudinary: {public_id}")
                cloudinary.uploader.destroy(public_id, resource_type="video")
                return Response({'status': 'deleted', 'id': public_id}, status=status.HTTP_200_OK)
            else:
                return Response({'error': 'URL format not recognized'}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'error': 'URL not provided'}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        print(f"🚨 Error en delete_audio: {str(e)}")
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

def get_or_create_global_room():
    room, _ = ChatRoom.objects.get_or_create(room_type='global')
    return room
 
 
# ─── Global chat ─────────────────────────────────────────────────────────────
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def global_chat_messages(request):
    """
    GET /api/chat/global/?since=<message_id>
    Returns messages after a given ID (for polling).
    Omit 'since' to get the last 50 messages on first load.
    """
    room = get_or_create_global_room()
    since_id = request.query_params.get('since')
 
    if since_id:
        messages = room.messages.filter(id__gt=since_id).select_related('sender')
    else:
        messages = room.messages.order_by('-timestamp')[:50]
        messages = reversed(list(messages))
 
    # Mark received messages as read
    room.messages.exclude(sender=request.user).update(is_read=True)
 
    serializer = ChatMessageSerializer(messages, many=True)
    return Response({'messages': serializer.data, 'room_id': room.id})
 
 
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def send_global_message(request):
    """POST /api/chat/global/"""
    content = request.data.get('content', '').strip()
    if not content:
        return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 1000:
        return Response({'error': 'Message too long (max 1000 chars)'}, status=status.HTTP_400_BAD_REQUEST)
 
    room = get_or_create_global_room()
    msg  = ChatMessage.objects.create(room=room, sender=request.user, content=content)
    serializer = ChatMessageSerializer(msg)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
 
 
# ─── Private chat ─────────────────────────────────────────────────────────────
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def private_chat_messages(request, user_id):
    """
    GET /api/chat/private/<user_id>/?since=<message_id>
    Gets or creates a DM room between request.user and user_id.
    """
    try:
        other_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
 
    if other_user == request.user:
        return Response({'error': 'Cannot chat with yourself'}, status=status.HTTP_400_BAD_REQUEST)
 
    # Find existing private room between these two users
    room = ChatRoom.objects.filter(
        room_type='private',
        participants=request.user
    ).filter(
        participants=other_user
    ).first()
 
    if not room:
        room = ChatRoom.objects.create(room_type='private')
        room.participants.add(request.user, other_user)
 
    since_id = request.query_params.get('since')
    if since_id:
        messages = room.messages.filter(id__gt=since_id).select_related('sender')
    else:
        messages = room.messages.order_by('-timestamp')[:50]
        messages = reversed(list(messages))
 
    room.messages.filter(sender=other_user, is_read=False).update(is_read=True)
 
    serializer = ChatMessageSerializer(messages, many=True)
    return Response({
        'messages': serializer.data,
        'room_id':  room.id,
        'other_user': {'id': other_user.id, 'username': other_user.username, 'role': other_user.role}
    })
 
 
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def send_private_message(request, user_id):
    """POST /api/chat/private/<user_id>/"""
    content = request.data.get('content', '').strip()
    if not content:
        return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 1000:
        return Response({'error': 'Message too long (max 1000 chars)'}, status=status.HTTP_400_BAD_REQUEST)
 
    try:
        other_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
 
    room = ChatRoom.objects.filter(
        room_type='private', participants=request.user
    ).filter(participants=other_user).first()
 
    if not room:
        room = ChatRoom.objects.create(room_type='private')
        room.participants.add(request.user, other_user)
 
    msg = ChatMessage.objects.create(room=room, sender=request.user, content=content)
    serializer = ChatMessageSerializer(msg)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
 
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_users_for_chat(request):
    """GET /api/chat/users/ — list all users except self, for starting a DM"""
    users = User.objects.exclude(pk=request.user.id).filter(is_active=True).order_by('username')
    data  = [{'id': u.id, 'username': u.username, 'role': u.role} for u in users]
    return Response(data)
 
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_my_conversations(request):
    """GET /api/chat/conversations/ — all DM rooms the user is part of"""
    rooms = ChatRoom.objects.filter(
        room_type='private', participants=request.user
    ).prefetch_related('participants', 'messages')
    serializer = ChatRoomSerializer(rooms, many=True, context={'request': request})
    return Response(serializer.data)

# ─── Stats: Nationality / Gender / Age chart ─────────────────────────────────

def nationality_chart_data(request):
    group_by = request.GET.get('group_by', 'nationality')

    all_reports        = FieldReport.objects.all()
    total_count        = all_reports.count()
    submitted_count    = all_reports.filter(is_submitted=True).count()
    pending_count      = total_count - submitted_count
    submission_percentage = round((submitted_count / total_count) * 100, 1) if total_count > 0 else 0

    qs = all_reports.filter(is_submitted=True)

    global_avg_age = qs.exclude(age__isnull=True).exclude(age=0) \
    .aggregate(global_avg=Avg('age'))['global_avg']
    seniors_count = all_reports.filter(age__gte=60).exclude(age__isnull=True).count()

    if group_by == 'age':
        data = qs.values('age').annotate(testimonies=Count('id')) \
            .exclude(age__isnull=True) \
            .exclude(age=0) \
            .order_by('-testimonies')
        total_categories = data.count()
        data = list(data)
        valid_count = sum(item['testimonies'] for item in data)
    elif group_by == 'gender':
        data = qs.values('gender').annotate(testimonies=Count('id'), average_age=Avg('age')) \
            .exclude(gender__isnull=True) \
            .exclude(gender__exact='') \
            .exclude(gender__iexact='unknown') \
            .order_by('-testimonies')
        total_categories = data.count()
        data = list(data)
        valid_count = sum(item['testimonies'] for item in data)
    else:
        data = qs.values('nationality').annotate(testimonies=Count('id'), average_age=Avg('age')) \
            .exclude(nationality__isnull=True) \
            .exclude(nationality__exact='') \
            .exclude(nationality__iexact='unknown') \
            .order_by('-testimonies')
        total_categories = data.count()
        data = list(data)
        valid_count = sum(item['testimonies'] for item in data)

    labels = []
    testimonies_data = []
    table_data = []
    percentage_data = []

    for item in data:
        count = item['testimonies']
        testimonies_data.append(count)

        if group_by == 'age':
            category_name = f"{item['age']} years"
            avg_age = item['age']
        elif group_by == 'gender':
            category_name = str(item['gender']).capitalize() if item['gender'] else "Unknown"
            avg_age = round(item['average_age'], 1) if item['average_age'] is not None else None
        else:
            category_name = item['nationality']
            avg_age = round(item['average_age'], 1) if item['average_age'] is not None else None

        labels.append(category_name)
        percentage = round((count / valid_count) * 100, 1) if valid_count > 0 else 0
        percentage_data.append(percentage)
        table_data.append({'category': category_name, 'testimonies': count, 'average_age': avg_age, 'percentage': percentage})

    TOTAL_PAISES_MUNDO = 195
    c3_value = c3_label = c4_value = c4_label = c4_percentage = ""

    if group_by == 'nationality':
        nationalities_percentage = round((total_categories / TOTAL_PAISES_MUNDO) * 100, 1)
        card_total_value = total_categories
        card_subtitle    = f"{nationalities_percentage}% of World Countries"
        bar_color        = "#1849a9"
        chart_title      = "Nationality Demography"
        c3_value         = 7
        c3_label         = f"{round(7/195 * 100, 1)}% Operational Regions"
        top_route = ReportPosition.objects.filter(order=0).exclude(location_name__isnull=True).exclude(location_name="Unknown Location").values('location_name').annotate(total=Count('location_name')).order_by('-total').first()
        c4_value         = top_route['location_name'] if top_route else "No Data"
        c4_label         = "Top Route Context"
        c4_percentage    = 15

    elif group_by == 'gender':
        data_list = list(data)
        if data_list:
            top_gender_count = data_list[0]['testimonies']
            top_gender_name  = str(data_list[0]['gender']).capitalize()
            nationalities_percentage = round((top_gender_count / submitted_count) * 100, 1) if submitted_count > 0 else 0
            card_total_value = f"{nationalities_percentage}%"
            card_subtitle    = f"Majority: {top_gender_name}"
        else:
            nationalities_percentage = 100
            card_total_value = "0%"
            card_subtitle    = "No data"
        bar_color   = "#8b5cf6"
        chart_title = "Gender Demography"
        c3_value    = 72
        c3_label    = "Today's total genders"
        avg_group   = qs.aggregate(avg_p=Avg('people_count'))['avg_p']
        c4_value    = round(avg_group, 1) if avg_group else 0
        c4_label    = "Avg Group Size"
        c4_percentage = round((c4_value / 50) * 100, 1) if c4_value > 0 else 0

    else:
        nationalities_percentage = global_avg_age
        card_total_value = round(global_avg_age, 2) if global_avg_age else 0
        card_subtitle    = "Global Average Age"
        bar_color        = "#10b981"
        chart_title      = "Age Demography"
        c3_value         = qs.filter(age__lt=18).count()
        c3_label         = "Minors Identified"
        c4_value         = seniors_count
        c4_label         = "Elderly (60+)"
        c4_percentage    = round((seniors_count / submitted_count) * 100, 1) if submitted_count > 0 else 0

    payload = {
        "summary": {
            "totalTestimonies": submitted_count,
            "totalNationalities": card_total_value,
            "nationalitiesPercentage": nationalities_percentage,
            "cardSubtitle": card_subtitle,
            "dbStatus": {
                "total": total_count, "submitted": submitted_count,
                "pending": pending_count, "percentage": submission_percentage
            }
        },
        "dynamicCards": {
            "card3": {"value": c3_value, "label": c3_label, "percentage": round((c3_value / submitted_count) * 100, 1) if submitted_count > 0 else 0},
            "card4": {"value": c4_value, "label": c4_label, "percentage": c4_percentage}
        },
        "chartType": "bar",
        "title": chart_title,
        "labels": labels,
        "datasets": [{"label": "Density (%)", "data": percentage_data, "backgroundColor": bar_color}],
        "tableData": table_data
    }

    return JsonResponse(payload)


# ─── Global chat ─────────────────────────────────────────────────────────────
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def global_chat_messages(request):
    """
    GET /api/chat/global/?since=<message_id>
    Returns messages after a given ID (for polling).
    Omit 'since' to get the last 50 messages on first load.
    """
    room     = get_or_create_global_room()
    since_id = request.query_params.get('since')
 
    if since_id:
        messages = room.messages.filter(id__gt=since_id).select_related('sender')
    else:
        messages = list(reversed(list(room.messages.order_by('-timestamp')[:50])))
 
    # Mark others' messages as read
    room.messages.exclude(sender=request.user).update(is_read=True)
 
    serializer = ChatMessageSerializer(messages, many=True)
    return Response({'messages': serializer.data, 'room_id': room.id})
 
 
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def send_global_message(request):
    """POST /api/chat/global/send/"""
    # Rate limit
    if _is_rate_limited(request.user.id):
        return Response(
            {'error': 'Too many messages. Please slow down.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )
 
    content = request.data.get('content', '').strip()
    if not content:
        return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 1000:
        return Response({'error': 'Message too long (max 1000 chars)'}, status=status.HTTP_400_BAD_REQUEST)
 
    room = get_or_create_global_room()
    msg  = ChatMessage.objects.create(room=room, sender=request.user, content=content)
    serializer = ChatMessageSerializer(msg)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
 
 
# ─── Private chat ─────────────────────────────────────────────────────────────
 
def _get_or_create_private_room(user_a, user_b):
    """Get or create a DM room between two users."""
    room = ChatRoom.objects.filter(
        room_type='private', participants=user_a
    ).filter(participants=user_b).first()
 
    if not room:
        room = ChatRoom.objects.create(room_type='private')
        room.participants.add(user_a, user_b)
 
    return room
 
 
def _assert_participant(room, user):
    """Return 403 response if user is not a participant of this room."""
    if not room.participants.filter(pk=user.pk).exists():
        return Response({'error': 'Forbidden'}, status=status.HTTP_403_FORBIDDEN)
    return None
 
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def private_chat_messages(request, user_id):
    """
    GET /api/chat/private/<user_id>/?since=<message_id>
    Gets or creates a DM room between request.user and user_id.
    """
    try:
        other_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
 
    if other_user == request.user:
        return Response({'error': 'Cannot chat with yourself'}, status=status.HTTP_400_BAD_REQUEST)
 
    room = _get_or_create_private_room(request.user, other_user)
 
    # Authorization: only participants can read
    err = _assert_participant(room, request.user)
    if err:
        return err
 
    since_id = request.query_params.get('since')
    if since_id:
        messages = room.messages.filter(id__gt=since_id).select_related('sender')
    else:
        messages = list(reversed(list(room.messages.order_by('-timestamp')[:50])))
 
    # Mark other user's messages as read
    room.messages.filter(sender=other_user, is_read=False).update(is_read=True)
 
    serializer = ChatMessageSerializer(messages, many=True)
    return Response({
        'messages':   serializer.data,
        'room_id':    room.id,
        'other_user': {'id': other_user.id, 'username': other_user.username, 'role': other_user.role}
    })
 
 
@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def send_private_message(request, user_id):
    """POST /api/chat/private/<user_id>/send/"""
    # Rate limit
    if _is_rate_limited(request.user.id):
        return Response(
            {'error': 'Too many messages. Please slow down.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )
 
    content = request.data.get('content', '').strip()
    if not content:
        return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
    if len(content) > 1000:
        return Response({'error': 'Message too long (max 1000 chars)'}, status=status.HTTP_400_BAD_REQUEST)
 
    try:
        other_user = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
 
    if other_user == request.user:
        return Response({'error': 'Cannot chat with yourself'}, status=status.HTTP_400_BAD_REQUEST)
 
    room = _get_or_create_private_room(request.user, other_user)
 
    # Authorization: only participants can send
    err = _assert_participant(room, request.user)
    if err:
        return err
 
    msg = ChatMessage.objects.create(room=room, sender=request.user, content=content)
    serializer = ChatMessageSerializer(msg)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
 
 
# ─── User list ────────────────────────────────────────────────────────────────
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_users_for_chat(request):
    """GET /api/chat/users/ — list all active users except self"""
    users = User.objects.exclude(pk=request.user.id).filter(is_active=True).order_by('username')
    data  = [{'id': u.id, 'username': u.username, 'role': u.role} for u in users]
    return Response(data)
 
 
# ─── Conversations list ───────────────────────────────────────────────────────
 
@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_my_conversations(request):
    """GET /api/chat/conversations/ — all DM rooms the user is part of"""
    rooms = ChatRoom.objects.filter(
        room_type='private', participants=request.user
    ).prefetch_related('participants', 'messages__sender')
    serializer = ChatRoomSerializer(rooms, many=True, context={'request': request})
    return Response(serializer.data)

@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def create_group_chat(request):
    """
    POST /api/chat/groups/create/
    Crea un grupo con un nombre y una lista de IDs de participantes.
    """
    name = request.data.get('name', '').strip()
    user_ids = request.data.get('user_ids', [])

    if not name:
        return Response({'error': 'Group name cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)
    if not user_ids:
        return Response({'error': 'You must select at least one member'}, status=status.HTTP_400_BAD_REQUEST)

    # Crear la sala tipo grupo
    room = ChatRoom.objects.create(room_type='group', name=name)
    
    # El creador siempre es participante
    room.participants.add(request.user)

    # Añadir al resto de integrantes elegidos
    for u_id in user_ids:
        try:
            user_to_add = User.objects.get(pk=u_id, is_active=True)
            room.participants.add(user_to_add)
        except User.DoesNotExist:
            continue

    return Response({
        'id': room.id,
        'name': room.name,
        'type': 'group'
    }, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def group_chat_messages(request, group_id):
    """
    GET /api/chat/group/<group_id>/?since=<message_id>
    Trae los mensajes de un grupo del que eres miembro.
    """
    room = get_object_or_404(ChatRoom, pk=group_id, room_type='group')

    # Validar que el usuario pertenece al grupo
    err = _assert_participant(room, request.user)
    if err:
        return err

    since_id = request.query_params.get('since')
    if since_id:
        messages = room.messages.filter(id__gt=since_id).select_related('sender')
    else:
        messages = list(reversed(list(room.messages.order_by('-timestamp')[:50])))

    # (Opcional) Marcar como leído para este usuario si manejas lectura por participante
    room.messages.exclude(sender=request.user).update(is_read=True)

    serializer = ChatMessageSerializer(messages, many=True)
    return Response({
        'messages': serializer.data,
        'room_id': room.id,
        'name': room.name
    })


@api_view(['POST'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def send_group_message(request, group_id):
    """POST /api/chat/group/<group_id>/send/"""
    if _is_rate_limited(request.user.id):
        return Response({'error': 'Too many messages. Please slow down.'}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    content = request.data.get('content', '').strip()
    if not content:
        return Response({'error': 'Message cannot be empty'}, status=status.HTTP_400_BAD_REQUEST)

    room = get_object_or_404(ChatRoom, pk=group_id, room_type='group')

    err = _assert_participant(room, request.user)
    if err:
        return err

    # Si alguien tenía oculto este grupo en su preview, vuelve a aparecer porque hay actividad
    if hasattr(room, 'hidden_by'):
        room.hidden_by.clear()

    msg = ChatMessage.objects.create(room=room, sender=request.user, content=content)
    serializer = ChatMessageSerializer(msg)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


# ─── Quitar / Ocultar de la Preview y Eliminar Grupos ────────────────────────

@api_view(['DELETE'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def delete_or_leave_group(request, group_id):
    """
    DELETE /api/chat/groups/<group_id>/delete/
    Saca al usuario actual del grupo. Si no quedan miembros, elimina el grupo.
    """
    room = get_object_or_404(ChatRoom, pk=group_id, room_type='group')
    
    err = _assert_participant(room, request.user)
    if err:
        return err

    room.participants.remove(request.user)

    # Si el grupo se queda completamente vacío, lo borramos de la Base de Datos
    if not room.participants.exists():
        room.delete()

    return Response({'status': 'Left group successfully'}, status=status.HTTP_200_OK)


@api_view(['DELETE'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def hide_private_conversation(request, room_id):
    """
    DELETE /api/chat/conversations/<room_id>/
    Quita un chat privado de la vista previa lateral del usuario actual (ocultar).
    """
    room = get_object_or_404(ChatRoom, pk=room_id, room_type='private')

    err = _assert_participant(room, request.user)
    if err:
        return err

    # Agrega al usuario a la lista de personas que decidieron ocultar este chat
    if hasattr(room, 'hidden_by'):
        room.hidden_by.add(request.user)
        return Response({'status': 'Conversation hidden from preview'}, status=status.HTTP_200_OK)
    else:
        # Si no quieres añadir la relación ManyToMany 'hidden_by', como alternativa 
        # puedes borrar los mensajes para este usuario o simplemente sacar al participante.
        # Lo ideal es usar hidden_by. Si no existe, tirará un 200 simulado o puedes borrar la sala:
        room.delete() 
        return Response({'status': 'Conversation deleted'}, status=status.HTTP_200_OK)


# ─── Conversations list (Actualizado) ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([JWTAuthentication])
@permission_classes([IsAuthenticated])
def list_my_conversations(request):
    """
    GET /api/chat/conversations/
    Retorna todos los chats privados Y grupales activos donde participa el usuario,
    excluyendo aquellos que el usuario decidió quitar/ocultar de la preview.
    """
    # Buscamos salas privadas o grupales donde esté el usuario
    rooms = ChatRoom.objects.filter(
        room_type__in=['private', 'group'],
        participants=request.user
    )

    # Si implementaste el campo 'hidden_by', excluimos las salas ocultadas por el usuario actual
    if hasattr(ChatRoom, 'hidden_by'):
        rooms = rooms.exclude(hidden_by=request.user)

    rooms = rooms.prefetch_related('participants', 'messages__sender').distinct()
    
    serializer = ChatRoomSerializer(rooms, many=True, context={'request': request})
    return Response(serializer.data)
