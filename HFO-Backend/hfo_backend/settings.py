import os
from pathlib import Path
from decouple import config, Csv
import dj_database_url
from datetime import timedelta
import cloudinary
import cloudinary.uploader
import cloudinary.api

# 1. RUTAS BASE
BASE_DIR = Path(__file__).resolve().parent.parent

# 2. CONFIGURACIÓN DE ENTORNO Y SEGURIDAD
# Usamos decouple para leer de las variables de Railway
SECRET_KEY = config('SECRET_KEY', default='django-insecure-default-key-change-me')

# Detectar si estamos en producción o local
DJANGO_ENV = config('DJANGO_ENV', default='development')
IS_PRODUCTION = DJANGO_ENV == 'production'
DEBUG = config('DJANGO_DEBUG', default=not IS_PRODUCTION, cast=bool)

# ── HOSTS PERMITIDOS (El '*' soluciona el error 400/DisallowedHost) ──
ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='*', cast=Csv())

# 3. DEFINICIÓN DE APLICACIONES
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',           
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'api',
    'core',
    'django_filters',  
    'drf_spectacular',
    'analytics',
]

# 11. CORS CONFIGURATION
CORS_ALLOW_ALL_ORIGINS = True

# 4. MIDDLEWARE
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware', # Debe ir antes de CommonMiddleware
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'hfo_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'hfo_backend.wsgi.application'

# 5. BASE DE DATOS (Limpia y conectada a Railway)
DATABASES = {
    'default': {
        'ENGINE': config('DB_ENGINE', default='django.db.backends.postgresql'),
        'NAME': config('DB_NAME', default='hfo_db'),
        'USER': config('DB_USER', default='hfo_user'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='localhost'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

# 6. MODELO DE USUARIO PERSONALIZADO
# Railway can expose DATABASE_URL; retain the existing DB_* configuration.
if config('DATABASE_URL', default=''):
    DATABASES['default'] = dj_database_url.parse(config('DATABASE_URL'), conn_max_age=60)
elif DATABASES['default']['ENGINE'] == 'django.db.backends.sqlite3':
    DATABASES['default'] = {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': config('DB_NAME', default=str(BASE_DIR / 'db.sqlite3')),
    }

AUTH_USER_MODEL = "core.CustomUser"

# 7. VALIDACIÓN DE CONTRASEÑAS
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# 8. INTERNACIONALIZACIÓN
LANGUAGE_CODE = 'es-es'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# 9. ARCHIVOS ESTÁTICOS Y MEDIA
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Límites de subida (10MB)
DATA_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024

# 10. REST FRAMEWORK Y JWT
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_RATES': {
        'login': '5/minute',
    }
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=8),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'AUTH_HEADER_TYPES': ('Bearer',),
}

# 11. CORS & CSRF CONFIGURATION
if IS_PRODUCTION:
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS',
        default='https://project-2hw2p.vercel.app', cast=Csv())
    CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS',
        default=','.join(CORS_ALLOWED_ORIGINS + ['https://hfobackend-production.up.railway.app']),
        cast=Csv())
    

    
    # 12. PRODUCTION SECURITY
    SECURE_SSL_REDIRECT = True 
    SECURE_REDIRECT_EXEMPT = [r'^health/$']
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
else:
    # Local Development Settings
    CORS_ALLOW_ALL_ORIGINS = True 
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
# 13. CLOUDINARY
CLOUDINARY_CLOUD_NAME = config('CLOUDINARY_CLOUD_NAME', default=None)
if CLOUDINARY_CLOUD_NAME:
    cloudinary.config( 
        cloud_name = CLOUDINARY_CLOUD_NAME, 
        api_key = config('CLOUDINARY_API_KEY'), 
        api_secret = config('CLOUDINARY_API_SECRET'),
        secure = True
    )

# 14. DOCUMENTACIÓN Y LOGS
SPECTACULAR_SETTINGS = {
    'TITLE': 'Human Flow Observatory API',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'WARNING',
    },
}
