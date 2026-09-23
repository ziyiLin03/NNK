"""Isolated test database: never connects to the configured Railway database."""
from .settings import *  # noqa: F403

DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
SECRET_KEY = 'test-only-key-not-for-deployment-0123456789'
DEBUG = False
ALLOWED_HOSTS = ['testserver', 'localhost']
SECURE_SSL_REDIRECT = False
CLOUDINARY_CLOUD_NAME = None
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
