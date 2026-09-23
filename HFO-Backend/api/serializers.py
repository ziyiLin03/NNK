import json
import secrets

from django.contrib.auth import get_user_model

from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from core.models import FieldReport, ReportPosition, ReportPhoto, ReportAudio, ChatRoom, ChatMessage


# ─── 1. JWT ───────────────────────────────────────────────────────────────────

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['username']              = user.username
        token['role']                  = user.role
        token['force_password_change'] = user.force_password_change
        return token


# ─── 2. Users ─────────────────────────────────────────────────────────────────

User = get_user_model()

class UserCreateSerializer(serializers.ModelSerializer):
    password      = serializers.CharField(write_only=True, required=False)
    temp_password = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ('id', 'username', 'email', 'role', 'password', 'temp_password')
        read_only_fields = ('id', 'temp_password')

    def create(self, validated_data):
        import secrets as _s
        password = validated_data.pop('password', None) or _s.token_urlsafe(12)
        user = User(**validated_data)
        user.set_password(password)
        user.save()
        self.context['password'] = password
        return user

    def get_temp_password(self, obj):
        return self.context.get('password', '')


# ─── 3. Constants ─────────────────────────────────────────────────────────────

MAX_PHOTOS = 10
MAX_AUDIOS = 5


# ─── 4. Positions ─────────────────────────────────────────────────────────────

class ReportPositionSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ReportPosition
        fields = ['latitude', 'longitude', 'order', 'category', 'description', 'passed_at', 'location_name', 'country']


# ─── 4b. Photos ───────────────────────────────────────────────────────────────

class ReportPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ReportPhoto
        fields = ['id', 'image', 'title', 'order', 'timestamp']


# ─── 4c. Audios ───────────────────────────────────────────────────────────────

class ReportAudioSerializer(serializers.ModelSerializer):
    class Meta:
        model  = ReportAudio
        fields = ['id', 'audio_url', 'transcription', 'translation', 'title', 'order', 'timestamp']


# ─── 5. FieldReport CREATE ────────────────────────────────────────────────────

class FieldReportCreateSerializer(serializers.ModelSerializer):
    needs              = serializers.CharField(required=False, allow_blank=True)
    notes              = serializers.CharField(required=False, allow_blank=True)
    name               = serializers.CharField(required=False, allow_blank=True, max_length=40)
    transcription      = serializers.CharField(required=False, allow_blank=True)
    translation        = serializers.CharField(required=False, allow_blank=True)
    people_count       = serializers.IntegerField(required=False)
    audio_file         = serializers.CharField(required=False, allow_blank=True)  # legacy
    photo_file         = serializers.CharField(required=False, allow_blank=True)  # legacy
    hora_evento        = serializers.DateTimeField(required=False, allow_null=True)
    timezone           = serializers.CharField(required=False, max_length=50)
    interviewType      = serializers.CharField(required=False, allow_blank=True)
    vulnerability_type = serializers.CharField(required=False, allow_blank=True)
    legal_situation    = serializers.CharField(required=False, allow_blank=True)
    # Arrays as JSON strings
    positions          = serializers.CharField(required=False, write_only=True)
    photos             = serializers.CharField(required=False, write_only=True, allow_blank=True)
    audios             = serializers.CharField(required=False, write_only=True, allow_blank=True)

    class Meta:
        model = FieldReport
        fields = [
            'is_submitted', 'needs', 'name', 'age', 'gender', 'nationality',
            'transcription', 'translation', 'notes', 'people_count',
            'audio_file', 'photo_file',
            'photos', 'audios',
            'hora_evento', 'timezone', 'interviewType',
            'vulnerability_type', 'legal_situation',
            'positions','group_id',
        ]

    # ── Validators ────────────────────────────────────────────────────────────

    def validate_positions(self, value):
        try:
            positions = json.loads(value)
        except (json.JSONDecodeError, TypeError):
            raise serializers.ValidationError("positions must be valid JSON.")
        if not isinstance(positions, list):
            raise serializers.ValidationError("positions must be a list.")
        for i, pos in enumerate(positions):
            lat = pos.get('lat', pos.get('latitude'))
            lon = pos.get('lon', pos.get('lng', pos.get('longitude')))
            if lat is None or lon is None:
                raise serializers.ValidationError(f"Position #{i+1} is missing lat/lon.")
            pos['lat'] = lat
            pos['lon'] = lon
        return positions

    def validate_photos(self, value):
        if not value:
            return []
        try:
            photos = json.loads(value) if isinstance(value, str) else value
        except (json.JSONDecodeError, TypeError):
            raise serializers.ValidationError("photos must be valid JSON.")
        if not isinstance(photos, list):
            raise serializers.ValidationError("photos must be a list.")
        if len(photos) > MAX_PHOTOS:
            raise serializers.ValidationError(f"Maximum {MAX_PHOTOS} photos per report.")
        return photos

    def validate_audios(self, value):
        if not value:
            return []
        try:
            audios = json.loads(value) if isinstance(value, str) else value
        except (json.JSONDecodeError, TypeError):
            raise serializers.ValidationError("audios must be valid JSON.")
        if not isinstance(audios, list):
            raise serializers.ValidationError("audios must be a list.")
        if len(audios) > MAX_AUDIOS:
            raise serializers.ValidationError(f"Maximum {MAX_AUDIOS} audios per report.")
        return audios

    def validate(self, data):
        needs        = data.get('needs',        getattr(self.instance, 'needs',        None))
        audio_file   = data.get('audio_file',   getattr(self.instance, 'audio_file',   None))
        photo_file   = data.get('photo_file',   getattr(self.instance, 'photo_file',   None))
        photos       = data.get('photos',       [])
        audios       = data.get('audios',       [])
        positions    = data.get('positions')
        people_count = data.get('people_count', getattr(self.instance, 'people_count', None))

        tiene_posiciones_guardadas = (
            self.instance and self.instance.pk and self.instance.positions.exists()
        )

        tiene_contenido = any([
            bool(needs), bool(audio_file), bool(photo_file),
            bool(photos), bool(audios), bool(positions),
            tiene_posiciones_guardadas, people_count is not None,
        ])

        if not tiene_contenido:
            raise serializers.ValidationError(
                {"non_field_errors": ["Report must have at least one field."]}
            )
        return data

    # ── Create ────────────────────────────────────────────────────────────────

    def create(self, validated_data):
        positions_data = validated_data.pop('positions', [])
        photos_data    = validated_data.pop('photos',    [])
        audios_data    = validated_data.pop('audios',    [])
        request        = self.context.get('request')

        report = FieldReport.objects.create(submitted_by=request.user, **validated_data)
        self._save_positions(report, positions_data)
        self._save_photos(report, photos_data)
        self._save_audios(report, audios_data)
        return report

    # ── Update ────────────────────────────────────────────────────────────────

    def update(self, instance, validated_data):
        positions_data = validated_data.pop('positions', None)
        photos_data    = validated_data.pop('photos',    None)
        audios_data    = validated_data.pop('audios',    None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()

        if positions_data is not None:
            instance.positions.all().delete()
            self._save_positions(instance, positions_data)

        if photos_data is not None:
            instance.photos.all().delete()
            self._save_photos(instance, photos_data)

        if audios_data is not None:
            instance.audios.all().delete()
            self._save_audios(instance, audios_data)

        return instance

    # ── Helpers ───────────────────────────────────────────────────────────────

    def _save_positions(self, report, positions_data):
        import requests as req
        import time

        def geocode(lat, lon):
            try:
                r = req.get(
                    f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}",
                    headers={
                        'User-Agent': 'HFODashboardApp/1.0 (jxz888811@gmail.com)',
                        'Accept-Language': 'en'
                    },
                    timeout=5
                )
                if r.status_code == 200:
                    address = r.json().get('address', {})
                    return (
                        address.get('city') or address.get('town') or
                        address.get('village') or address.get('state') or
                        address.get('country') or "Unknown Area"
                    )
            except Exception as e:
                print(f"⚠️ Geocoding error: {e}")
            return None

        objs = []
        for i, pos in enumerate(positions_data):
            location_name = geocode(pos['lat'], pos['lon'])
            if i < len(positions_data) - 1:
                time.sleep(1)  # Nominatim rate limit: 1 req/sec
            objs.append(ReportPosition(
                report=report,
                latitude=pos['lat'],
                longitude=pos['lon'],
                order=i,
                category=pos.get('category'),
                description=pos.get('description'),
                passed_at=pos.get('passed_at'),
                country=pos.get('country'),
                location_name=location_name,
            ))

        ReportPosition.objects.bulk_create(objs)

    def _save_photos(self, report, photos_data):
        for i, photo in enumerate(photos_data):
            url   = photo.get('image') or photo.get('url') or photo
            title = photo.get('title', 'Field Photo') if isinstance(photo, dict) else 'Field Photo'
            if url and isinstance(url, str):
                ReportPhoto.objects.create(report=report, image=url, title=title, order=i)

    def _save_audios(self, report, audios_data):
        for i, audio in enumerate(audios_data):
            if isinstance(audio, dict):
                # Ahora acepta cualquiera de estas llaves:
                url = audio.get('url') or audio.get('audio_url') or audio.get('audio_file')
                transcription = audio.get('transcription', '')
                translation   = audio.get('translation', '')
                title         = audio.get('title', '')
            else:
                url = audio
                transcription = ''
                translation = ''
                title = ''

            if url and isinstance(url, str):
                ReportAudio.objects.create(
                    report=report, 
                    audio_url=url,
                    transcription=transcription, 
                    translation=translation,
                    title=title, 
                    order=i,
                )


# ─── 6. FieldReport READ ──────────────────────────────────────────────────────

class FieldReportReadSerializer(serializers.ModelSerializer):
    positions    = ReportPositionSerializer(many=True, read_only=True)
    photos       = ReportPhotoSerializer(many=True,    read_only=True)
    audios       = ReportAudioSerializer(many=True,    read_only=True)
    submitted_by = serializers.StringRelatedField()

    class Meta:
        model  = FieldReport
        fields = [
            'is_submitted', 'id', 'name', 'age', 'gender', 'nationality',
            'transcription', 'translation', 'submitted_by', 'timestamp',
            'needs', 'notes', 'people_count', 'interviewType',
            'audio_file', 'photo_file',   # legacy — kept for old records
            'photos', 'audios',
            'hora_evento', 'timezone',
            'vulnerability_type', 'legal_situation',
            'positions', 'group_id',
        ]


# ─── 7. User management ───────────────────────────────────────────────────────

class UserManagementSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False)

    class Meta:
        model  = User
        fields = ['id', 'username', 'email', 'role', 'is_active', 'force_password_change', 'last_login', 'password']
        read_only_fields = ['id', 'last_login']

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        if password:
            instance.set_password(password)
        return super().update(instance, validated_data)


# ─── 8. Password reset ────────────────────────────────────────────────────────

class UserResetPasswordSerializer(serializers.ModelSerializer):
    temp_password = serializers.SerializerMethodField()

    class Meta:
        model  = User
        fields = ['id', 'username', 'temp_password']
        read_only_fields = ['id', 'username', 'temp_password']

    def update(self, instance, validated_data):
        import secrets as _s
        password = _s.token_urlsafe(12)
        instance.set_password(password)
        instance.force_password_change = True
        instance.save()
        self.context['password'] = password
        return instance

    def get_temp_password(self, obj):
        return self.context.get('password', '')

class ChatMessageSerializer(serializers.ModelSerializer):
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_role     = serializers.CharField(source='sender.role',     read_only=True)

    class Meta:
        model  = ChatMessage
        fields = ['id', 'room', 'sender', 'sender_username', 'sender_role', 'content', 'timestamp', 'is_read']
        read_only_fields = ['id', 'sender', 'sender_username', 'sender_role', 'timestamp']

class ChatRoomSerializer(serializers.ModelSerializer):
    participants  = serializers.StringRelatedField(many=True, read_only=True)
    last_message  = serializers.SerializerMethodField()
    unread_count  = serializers.SerializerMethodField()
    display_name  = serializers.SerializerMethodField()
    other_user_id = serializers.SerializerMethodField()

    class Meta:
        model  = ChatRoom
        fields = ['id', 'room_type', 'participants', 'last_message', 'unread_count', 'display_name', 'other_user_id', 'created_at']

    def get_last_message(self, obj):
        msg = obj.messages.last()
        if msg:
            return {'content': msg.content, 'sender': msg.sender.username, 'timestamp': msg.timestamp}
        return None

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if not request:
            return 0
        return obj.messages.filter(is_read=False).exclude(sender=request.user).count()

    def get_display_name(self, obj):
        # 1. Si es el chat global
        if obj.room_type == 'global':
            return 'Global Chat'
        
        # 2. Si es un grupo, devolvemos el nombre del grupo
        if obj.room_type == 'group':
            return obj.name if obj.name else 'Grupo sin nombre'
            
        # 3. Si es chat privado (DM), devolvemos el nombre de la otra persona
        request = self.context.get('request')
        if request:
            other = obj.participants.exclude(id=request.user.id).first()
            if other:
                return other.username
        return 'Private Chat'

    def get_other_user_id(self, obj):
        # En chats globales o grupales no hay un único "otro usuario"
        if obj.room_type in ['global', 'group']:
            return None
            
        request = self.context.get('request')
        if not request:
            return None
            
        other = obj.participants.exclude(id=request.user.id).first()
        return other.id if other else None

