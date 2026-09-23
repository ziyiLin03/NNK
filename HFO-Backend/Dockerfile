# Usamos una imagen ligera de Python 3.12
FROM python:3.12-slim

# Evita que Python genere archivos .pyc y permite que los logs salgan directos a la consola
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Instalamos dependencias del sistema necesarias para PostgreSQL y herramientas de compilación
RUN apt-get update && apt-get install -y \
    libpq-dev \
    gcc \
    libmagic1 \
    gdal-bin \
    libgdal-dev \
    libgeos-dev \
    libproj-dev \
    binutils \
    && rm -rf /var/lib/apt/lists/*

# Establecemos el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiamos solo el archivo de requerimientos primero para aprovechar la caché de capas de Docker
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el resto del código del backend
COPY . /app/

# Exponemos el puerto de Django
EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && exec gunicorn hfo_backend.wsgi:application --bind 0.0.0.0:${PORT:-8000}"]
