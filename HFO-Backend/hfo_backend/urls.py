"""
URL configuration for hfo_backend project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/6.0/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include  # Para incluir URLs de otras apps (como "api") [web:1]
from django.conf import settings
from django.conf.urls.static import static
from api.auth import LoginView, RefreshView, logout_view, verify_token_view, ChangePasswordView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from api import views
from .health import health

urlpatterns = [
    path('health/', health, name='health'),
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),  # Incluye las URLs definidas en api/urls.py [web:1]
    path('api/analytics/', include('analytics.urls')),
    path('api/auth/change-password/', ChangePasswordView.as_view(), name='change-password'),
    # Documentación API
    path('api/schema/',        SpectacularAPIView.as_view(),                          name='schema'),
    path('api/docs/',          SpectacularSwaggerView.as_view(url_name='schema'),     name='swagger-ui'),
    path('api/docs/redoc/',    SpectacularRedocView.as_view(url_name='schema'),       name='redoc'),
    path('api/translate-text/', views.translate_corrected_text, name='translate-text'),
    path('api/nationality-chart/', views.nationality_chart_data, name='nationality-chart')
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT) # Sirve archivos media en desarrollo


