from django.db import models
import requests
import time
from django.contrib.auth.models import AbstractUser
import cloudinary.uploader
from django.db.models.signals import post_delete
from django.dispatch import receiver
import re

# ─── Helper: upload paths ─────────────────────────────────────────────────────

def audio_upload_path(instance, filename):
    return f'reports/{instance.submitted_by.id}/audio/{filename}'

def photo_upload_path(instance, filename):
    return f'reports/{instance.submitted_by.id}/photo/{filename}'


# ─── CustomUser ───────────────────────────────────────────────────────────────

class CustomUser(AbstractUser):
    ROLE_CHOICES = (
        ('volunteer', 'Voluntario'),
        ('analyst',   'Analista'),
        ('admin',     'Admin'),
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='volunteer')
    force_password_change = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.username} ({self.role})"


# ─── FieldReport ──────────────────────────────────────────────────────────────

class FieldReport(models.Model):

    submitted_by = models.ForeignKey(
        'CustomUser',
        on_delete=models.CASCADE,
        related_name='reports',
        null=True,
    )

    group_id = models.CharField(max_length=100, null=True, blank=True)

    is_submitted = models.BooleanField(default=False)

    name        = models.CharField(max_length=100, blank=True, null=True)
    age         = models.IntegerField(blank=True, null=True)
    gender      = models.CharField(max_length=50, blank=True, null=True)
    nationality = models.CharField(max_length=100, blank=True, null=True)

    # ── NEW fields (replace tipo_punto) ───────────────────────────────────────
    vulnerability_type = models.CharField(max_length=100, blank=True, null=True)
    legal_situation    = models.CharField(max_length=100, blank=True, null=True)
    # ── (tipo_punto kept temporarily so existing DB rows don't break) ─────────
    # Once you've run a data migration you can drop it. Set null=True for safety.
    tipo_punto = models.CharField(
        max_length=20,
        choices=[
            ('actual',   'Situación actual'),
            ('pushback', 'Pushback'),
            ('policia',  'Policía'),
            ('mafia',    'Mafia'),
        ],
        null=True, blank=True,
        db_index=True
    )

    transcription = models.TextField(blank=True, null=True)
    translation   = models.TextField(blank=True, null=True)

    timestamp   = models.DateTimeField(auto_now_add=True, db_index=True)
    hora_evento = models.DateTimeField(null=True, blank=True)
    timezone    = models.CharField(max_length=50, default='Europe/Madrid')

    needs         = models.TextField(blank=True, null=True)
    notes         = models.TextField(blank=True, null=True)
    people_count  = models.IntegerField(blank=True, null=True)
    interviewType = models.CharField(max_length=50, null=True, blank=True)

    audio_file = models.CharField(max_length=500, blank=True, null=True)
    photo_file = models.CharField(max_length=500, blank=True, null=True)  # legacy

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        preview = (self.needs or "sin texto")[:20]
        estado  = "Enviado" if self.is_submitted else "Borrador"
        return f"#{self.id} [{estado}] by {self.submitted_by} — {preview}"


# ─── ReportPhoto ──────────────────────────────────────────────────────────────

class ReportPhoto(models.Model):
    """One row per photo. A FieldReport can have up to 10."""
    report    = models.ForeignKey(FieldReport, on_delete=models.CASCADE, related_name='photos')
    image     = models.CharField(max_length=500)
    title     = models.CharField(max_length=100, blank=True, null=True)
    order     = models.PositiveSmallIntegerField(default=0)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Photo #{self.order} for Report #{self.report_id}"


# ─── ADD TO models.py, right after ReportPhoto ────────────────────────────────

class ReportAudio(models.Model):
    """One row per audio clip. A FieldReport can have up to 5."""
    report        = models.ForeignKey(FieldReport, on_delete=models.CASCADE, related_name='audios')
    audio_url     = models.CharField(max_length=500)          # Cloudinary secure_url
    transcription = models.TextField(blank=True, null=True)
    translation   = models.TextField(blank=True, null=True)
    title         = models.CharField(max_length=100, blank=True, null=True)
    order         = models.PositiveSmallIntegerField(default=0)
    timestamp     = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Audio #{self.order} for Report #{self.report_id}"


# ─── ADD this signal after the ReportPhoto signal ─────────────────────────────

@receiver(post_delete, sender=ReportAudio)
def eliminar_audio_cloudinary(sender, instance, **kwargs):
    if not instance.audio_url or 'res.cloudinary.com' not in instance.audio_url:
        return
    match = re.search(r'upload/(?:v\d+/)?(.+?)\.[^.]+$', instance.audio_url)
    if match:
        try:
            cloudinary.uploader.destroy(match.group(1), resource_type='video')
            print(f"🗑️ Audio {match.group(1)} deleted from Cloudinary")
        except Exception as e:
            print(f"⚠️ Error deleting audio: {e}")


# ─── MIGRATION ────────────────────────────────────────────────────────────────
# python manage.py makemigrations && python manage.py migrate

# ─── ReportPosition ───────────────────────────────────────────────────────────

class ReportPosition(models.Model):

    report    = models.ForeignKey(FieldReport, on_delete=models.CASCADE, related_name='positions')
    latitude  = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    location_name = models.CharField(max_length=255, blank=True, null=True)
    order     = models.PositiveSmallIntegerField(default=0)

    CATEGORY_CHOICES = [
        ('mafia',      'Mafia'),
        ('violence',   'Violencia'),
        ('robbery',    'Robo'),
        ('extortion',  'Extorsión'),
        ('medical',    'Ayuda médica'),
        ('shelter',    'Refugio/Alojamiento'),
        ('food',       'Comida'),
        ('police',     'Policía'),
        ('pushback',   'Pushback'),
        ('safe_point', 'Punto seguro'),
        ('nothing',   'No pasa nada'),
        ('future',     'Punto futuro'),
        ('origin',     'Punto de origen'),
        ('destination', 'Punto de destino'),
    ]
    category    = models.CharField(max_length=20, choices=CATEGORY_CHOICES, blank=True, null=True)
    description = models.TextField(blank=True, null=True)
    passed_at   = models.DateTimeField(blank=True, null=True)
    country     = models.CharField(max_length=100, blank=True, null=True)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f"Pos #{self.order} ({self.latitude}, {self.longitude})"

    def save(self, *args, **kwargs):
        
        super().save(*args, **kwargs)


# ─── Signals ─────────────────────────────────────────────────────────────────

@receiver(post_delete, sender=FieldReport)
def eliminar_archivos_cloudinary(sender, instance, **kwargs):
    def obtener_public_id(url):
        if not url or 'res.cloudinary.com' not in url:
            return None
        match = re.search(r'upload/(?:v\d+/)?(.+)\.[a-z0-9]+$', url)
        return match.group(1) if match else None

    if instance.photo_file:
        try:
            p_id = obtener_public_id(str(instance.photo_file))
            if p_id:
                cloudinary.uploader.destroy(p_id)
        except Exception as e:
            print(f"⚠️ Error deleting legacy photo: {e}")

    if instance.audio_file:
        try:
            p_id = obtener_public_id(str(instance.audio_file))
            if p_id:
                cloudinary.uploader.destroy(p_id, resource_type="video")
        except Exception as e:
            print(f"⚠️ Error deleting audio: {e}")


@receiver(post_delete, sender=ReportPhoto)
def eliminar_foto_cloudinary(sender, instance, **kwargs):
    if not instance.image or 'res.cloudinary.com' not in instance.image:
        return
    match = re.search(r'upload/(?:v\d+/)?(.+)\.[a-z0-9]+$', instance.image)
    if match:
        try:
            cloudinary.uploader.destroy(match.group(1))
        except Exception as e:
            print(f"⚠️ Error deleting photo: {e}")

# ─── ADD THESE MODELS to your existing models.py ────────────────────────────
# Place them at the bottom, before or after ReportPosition

class ChatRoom(models.Model):
    """
    A room can be:
    - 'global'  → one shared room for everyone
    - 'private' → a DM between two users
    """
    ROOM_TYPES = [
        ('global',  'Global'),
        ('private', 'Private'),
        ('group', 'Group'),
    ]
    room_type   = models.CharField(max_length=10, choices=ROOM_TYPES, default='global')
    name = models.CharField(max_length=255, blank=True, null=True)
    # For private rooms, store the two participants (order-independent)
    participants = models.ManyToManyField('CustomUser', blank=True, related_name='chat_rooms')
    created_at  = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        if self.room_type == 'global':
            return 'Global Chat'
        names = ', '.join(u.username for u in self.participants.all())
        return f'DM: {names}'


class ChatMessage(models.Model):
    room      = models.ForeignKey(ChatRoom, on_delete=models.CASCADE, related_name='messages')
    sender    = models.ForeignKey('CustomUser', on_delete=models.CASCADE, related_name='sent_messages')
    content   = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)
    is_read   = models.BooleanField(default=False)

    class Meta:
        ordering = ['timestamp']

    def __str__(self):
        return f'{self.sender.username}: {self.content[:40]}'


# ─── MIGRATION ────────────────────────────────────────────────────────────────
# python manage.py makemigrations && python manage.py migrate