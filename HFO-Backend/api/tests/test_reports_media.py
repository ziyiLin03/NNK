from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient
from core.models import CustomUser, FieldReport
from core.models import ReportPhoto, ReportAudio
from api.serializers import FieldReportCreateSerializer


class ReportsMediaTests(TestCase):
    @patch('cloudinary.uploader.destroy')
    def test_edit_keeps_existing_cloudinary_files(self, destroy):
        report = FieldReport.objects.create(submitted_by=self.user)
        photo = ReportPhoto.objects.create(report=report, image='https://res.cloudinary.com/demo/image/upload/photo.jpg')
        audio = ReportAudio.objects.create(report=report, audio_url='https://res.cloudinary.com/demo/video/upload/audio.mp4')
        FieldReportCreateSerializer().update(report, {
            'photos': [{'image': photo.image, 'title': 'New title'}],
            'audios': [{'url': audio.audio_url, 'title': 'Recording'}],
        })
        destroy.assert_not_called()
        self.assertEqual(report.photos.get().pk, photo.pk)
        self.assertEqual(report.audios.get().pk, audio.pk)
        self.assertEqual(report.photos.get().title, 'New title')

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(username='media-admin', role='admin')
        self.client.force_authenticate(self.user)

    def test_reports_and_drafts_on_fresh_database(self):
        submitted = FieldReport.objects.create(submitted_by=self.user, is_submitted=True, translation='Hello')
        draft = FieldReport.objects.create(submitted_by=self.user, is_submitted=False)
        response = self.client.get('/api/reports/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [submitted.id])
        self.assertEqual(response.data[0]['translation'], 'Hello')
        response = self.client.get('/api/my-reports/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual([row['id'] for row in response.data], [draft.id])

    @patch('api.media_uploads.cloudinary.config')
    def test_missing_storage_returns_actionable_error(self, cfg):
        cfg.return_value = SimpleNamespace(cloud_name=None, api_key=None, api_secret=None)
        for path, payload in [('/api/upload-photo/', {'image': 'data:image/jpeg;base64,YQ=='}),
                              ('/api/upload-audio/', {'audio': 'data:audio/webm;base64,YQ=='})]:
            response = self.client.post(path, payload, format='json')
            self.assertEqual(response.status_code, 503)
            self.assertIn('not configured', response.data['error'])

    def test_invalid_recording_is_rejected(self):
        for audio in [None, '', 'data:audio/webm;base64,not-base64!', 'data:text/html;base64,YQ==']:
            response = self.client.post('/api/upload-audio/', {'audio': audio}, format='json')
            self.assertEqual(response.status_code, 400)

    @patch('api.media_uploads.config', return_value='')
    @patch('api.media_uploads.cloudinary.uploader.upload', return_value={'secure_url': 'https://example.com/audio.webm'})
    @patch('api.media_uploads.storage_unavailable', return_value=None)
    def test_audio_saved_without_groq(self, storage, upload, cfg):
        response = self.client.post('/api/upload-audio/', {'audio': 'data:audio/webm;base64,YQ=='}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data['url'], 'https://example.com/audio.webm')
        self.assertIn('warning', response.data)

    @patch('api.media_uploads.Groq', side_effect=RuntimeError('AI unavailable'))
    @patch('api.media_uploads.config', return_value='test-key')
    @patch('api.media_uploads.cloudinary.uploader.upload', return_value={'secure_url': 'https://example.com/audio.mp4'})
    @patch('api.media_uploads.storage_unavailable', return_value=None)
    def test_audio_saved_when_ai_fails(self, storage, upload, cfg, groq):
        response = self.client.post('/api/upload-audio/', {'audio': 'data:audio/mp4;base64,YQ==', 'extension': 'mp4'}, format='json')
        self.assertEqual(response.status_code, 201)
        self.assertIn('warning', response.data)
