import base64
import binascii
import logging

import cloudinary
import cloudinary.uploader
from decouple import config
from groq import Groq
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def storage_unavailable():
    cfg = cloudinary.config()
    if not all((cfg.cloud_name, cfg.api_key, cfg.api_secret)):
        return Response({'error': 'Media storage is not configured. Please contact an administrator.'}, status=503)


def save_audio(data):
    audio = data.get('audio')
    extension = data.get('extension', 'webm')
    if extension not in {'webm', 'mp4', 'm4a', 'wav', 'mp3', 'ogg', 'aac'}:
        return Response({'error': 'Unsupported audio format.'}, status=400)
    try:
        header, encoded = audio.split(';base64,', 1)
        if not header.startswith(('data:audio/', 'data:video/')):
            raise ValueError('Invalid audio header')
        audio_bytes = base64.b64decode(encoded, validate=True)
        if not audio_bytes:
            raise ValueError('Empty audio')
    except (AttributeError, TypeError, ValueError, binascii.Error):
        return Response({'error': 'Provide a valid, non-empty audio recording.'}, status=400)
    unavailable = storage_unavailable()
    if unavailable is not None:
        return unavailable
    try:
        result = cloudinary.uploader.upload(
            f'data:video/{extension};base64,{encoded}', resource_type='video', folder='hfo_audios')
        url = result['secure_url']
    except Exception:
        logger.exception('Audio upload failed')
        return Response({'error': 'Audio storage is unavailable. Please try again later.'}, status=502)

    # An optional AI failure must not discard a successfully uploaded recording.
    payload = {'url': url, 'transcription': '', 'translation': ''}
    key = config('GROQ_API_KEY', default='')
    if not key:
        payload['warning'] = 'Audio uploaded. Automatic transcription is unavailable; you can save without it.'
    else:
        try:
            client = Groq(api_key=key, timeout=20, max_retries=0)
            payload['transcription'] = client.audio.transcriptions.create(
                file=(f'recording.{extension}', audio_bytes), model='whisper-large-v3', response_format='json').text
            payload['translation'] = client.audio.translations.create(
                file=(f'recording.{extension}', audio_bytes), model='whisper-large-v3', response_format='json').text
        except Exception:
            logger.exception('Audio transcription or translation failed after upload')
            payload['warning'] = 'Audio uploaded. Automatic transcription or translation failed; you can still save it.'
    return Response(payload, status=201)
