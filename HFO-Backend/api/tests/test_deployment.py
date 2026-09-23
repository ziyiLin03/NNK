from django.test import SimpleTestCase, override_settings


class DeploymentTests(SimpleTestCase):
    @override_settings(SECURE_SSL_REDIRECT=True, SECURE_REDIRECT_EXEMPT=[r'^health/$'])
    def test_railway_healthcheck_accepts_http_without_authentication(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})

    @override_settings(CORS_ALLOW_ALL_ORIGINS=False,
                       CORS_ALLOWED_ORIGINS=['https://frontend.example.com'])
    def test_configured_frontend_can_make_authenticated_api_requests(self):
        response = self.client.options('/api/auth/login/',
            HTTP_ORIGIN='https://frontend.example.com',
            HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type')
        self.assertEqual(response['Access-Control-Allow-Origin'], 'https://frontend.example.com')
        self.assertIn('authorization', response['Access-Control-Allow-Headers'])
