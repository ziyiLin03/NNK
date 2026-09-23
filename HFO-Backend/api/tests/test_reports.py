from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from core.models import FieldReport

User = get_user_model()


# ─── Base ─────────────────────────────────────────────────────────────────────

class BaseTestCase(TestCase):
    """Configuración común para todos los tests."""

    def setUp(self):
        self.client = APIClient()

        self.admin = User.objects.create_user(
            username='admin_test', password='admin1234', role='admin'
        )
        self.analyst = User.objects.create_user(
            username='analyst_test', password='analyst1234', role='analyst'
        )
        self.volunteer1 = User.objects.create_user(
            username='volunteer1', password='vol1234', role='volunteer'
        )
        self.volunteer2 = User.objects.create_user(
            username='volunteer2', password='vol1234', role='volunteer'
        )

        # Reporte en borrador de volunteer1
        self.draft_report = FieldReport.objects.create(
            submitted_by=self.volunteer1,
            needs='Agua y comida',
            people_count=5,
            tipo_punto='actual',
            status='draft'
        )

        # Reporte enviado de volunteer1
        self.submitted_report = FieldReport.objects.create(
            submitted_by=self.volunteer1,
            needs='Mantas',
            people_count=3,
            tipo_punto='pushback',
            status='submitted'
        )


# ─── Test 1: Permisos de volunteer ────────────────────────────────────────────

class VolunteerPermissionTest(BaseTestCase):

    def test_volunteer_ve_sus_propios_drafts(self):
        """volunteer1 ve su propio borrador."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.get('/api/reports/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in response.data]
        self.assertIn(self.draft_report.id, ids)

    def test_volunteer_no_ve_reportes_submitted(self):
        """volunteer1 NO ve sus propios reportes ya enviados."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.get('/api/reports/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in response.data]
        self.assertNotIn(self.submitted_report.id, ids)

    def test_volunteer_no_ve_drafts_de_otros(self):
        """volunteer2 no ve los borradores de volunteer1."""
        self.client.force_authenticate(user=self.volunteer2)
        response = self.client.get('/api/reports/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in response.data]
        self.assertNotIn(self.draft_report.id, ids)

    def test_volunteer_no_accede_a_detalle_de_otro(self):
        """volunteer2 no puede ver el detalle del reporte de volunteer1."""
        self.client.force_authenticate(user=self.volunteer2)
        response = self.client.get(f'/api/reports/{self.draft_report.id}/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ─── Test 2: Creación de reporte ──────────────────────────────────────────────

class ReportCreateTest(BaseTestCase):

    def test_volunteer_puede_crear_reporte(self):
        """Un volunteer crea un reporte válido → 201 y status=draft."""
        self.client.force_authenticate(user=self.volunteer1)
        data = {
            'needs': 'Mantas',
            'people_count': 10,
            'tipo_punto': 'pushback',
            'positions': '[{"lat": 41.38, "lon": 2.17}]'
        }
        response = self.client.post('/api/reports/create/', data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['needs'], 'Mantas')
        self.assertEqual(response.data['status'], 'draft')

    def test_reporte_vacio_es_rechazado(self):
        """Un reporte vacío devuelve 400."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.post('/api/reports/create/', {}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_usuario_no_autenticado_no_puede_crear(self):
        """Sin token JWT devuelve 401."""
        data = {'needs': 'Agua', 'people_count': 3}
        response = self.client.post('/api/reports/create/', data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reporte_se_crea_con_interview_type(self):
        """El campo interview_type se guarda correctamente."""
        self.client.force_authenticate(user=self.volunteer1)
        data = {
            'needs': 'Comida',
            'interview_type': 'group',
            'people_count': 8,
        }
        response = self.client.post('/api/reports/create/', data, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['interview_type'], 'group')


# ─── Test 3: Draft / Submit workflow ──────────────────────────────────────────

class DraftSubmitTest(BaseTestCase):

    def test_volunteer_puede_enviar_su_draft(self):
        """POST /api/reports/<id>/submit/ cambia status a submitted."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.post(f'/api/reports/{self.draft_report.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.draft_report.refresh_from_db()
        self.assertEqual(self.draft_report.status, 'submitted')

    def test_volunteer_no_ve_reporte_tras_enviarlo(self):
        """Una vez enviado, el volunteer no lo ve en su listado."""
        self.client.force_authenticate(user=self.volunteer1)
        self.client.post(f'/api/reports/{self.draft_report.id}/submit/')
        response = self.client.get('/api/reports/')
        ids = [r['id'] for r in response.data]
        self.assertNotIn(self.draft_report.id, ids)

    def test_no_puedes_enviar_reporte_de_otro(self):
        """volunteer2 no puede enviar el draft de volunteer1."""
        self.client.force_authenticate(user=self.volunteer2)
        response = self.client.post(f'/api/reports/{self.draft_report.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_puedes_enviar_reporte_ya_submitted(self):
        """No se puede enviar un reporte que ya está submitted."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.post(f'/api/reports/{self.submitted_report.id}/submit/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Test 4: Edición de borradores ────────────────────────────────────────────

class ReportUpdateTest(BaseTestCase):

    def test_volunteer_puede_editar_su_draft(self):
        """Un volunteer puede editar su propio borrador."""
        self.client.force_authenticate(user=self.volunteer1)
        data = {'needs': 'Texto actualizado', 'people_count': 10}
        response = self.client.patch(
            f'/api/reports/{self.draft_report.id}/edit/',
            data, format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_volunteer_no_puede_editar_submitted(self):
        """Un volunteer no puede editar un reporte ya enviado."""
        self.client.force_authenticate(user=self.volunteer1)
        data = {'needs': 'Intento editar submitted'}
        response = self.client.patch(
            f'/api/reports/{self.submitted_report.id}/edit/',
            data, format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_volunteer_no_puede_editar_draft_de_otro(self):
        """volunteer2 no puede editar el draft de volunteer1."""
        self.client.force_authenticate(user=self.volunteer2)
        data = {'needs': 'Intento editar de otro'}
        response = self.client.patch(
            f'/api/reports/{self.draft_report.id}/edit/',
            data, format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ─── Test 5: Permisos de analyst ──────────────────────────────────────────────

class AnalystPermissionTest(BaseTestCase):

    def test_analyst_ve_reportes_submitted(self):
        """Un analyst ve todos los reportes enviados."""
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get('/api/reports/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = [r['id'] for r in response.data]
        self.assertIn(self.submitted_report.id, ids)

    def test_analyst_no_ve_drafts(self):
        """Un analyst NO ve los borradores."""
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get('/api/reports/')
        ids = [r['id'] for r in response.data]
        self.assertNotIn(self.draft_report.id, ids)

    def test_analyst_accede_al_detalle(self):
        """Un analyst puede ver el detalle de cualquier reporte."""
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get(f'/api/reports/{self.submitted_report.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ─── Test 6: Exportación CSV ──────────────────────────────────────────────────

class DataExportTest(BaseTestCase):

    def test_analyst_puede_exportar_csv(self):
        """Un analyst puede descargar el CSV."""
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get('/api/data-export/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')

    def test_volunteer_no_puede_exportar_csv(self):
        """Un volunteer no tiene acceso al CSV."""
        self.client.force_authenticate(user=self.volunteer1)
        response = self.client.get('/api/data-export/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_csv_contiene_cabeceras(self):
        """El CSV debe tener las cabeceras correctas incluyendo los nuevos campos."""
        self.client.force_authenticate(user=self.analyst)
        response = self.client.get('/api/data-export/')
        contenido = response.content.decode('utf-8')
        self.assertIn('id_unico', contenido)
        self.assertIn('tipo_punto', contenido)
        self.assertIn('lat', contenido)
        self.assertIn('interview_type', contenido)   # ← campo nuevo