# human-flow-observatory-backend

BackEnd PAE project — herramienta para ONGs donde voluntarios reportan desde el terreno (gente en movimiento) y analistas visualizan en un dashboard. Django REST Framework + SimpleJWT.

## 🚀 Quick Start (Windows)

1. Clonar el repo:
   ```bash
   git clone ...
   cd backend
   ```

2. Activar entorno virtual:
   ```bash
   .venv\Scripts\activate
   ```

3. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```

4. Configurar `.env`:
   ```bash
   cp .env.example .env
   ```

5. Migrar base de datos:
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

6. Arrancar servidor:
   ```bash
   python manage.py runserver
   ```

---

## 👤 Gestión de Usuarios

Este proyecto usa un modelo de usuario personalizado (`CustomUser`) con roles: **volunteer**, **coordinator**, **analyst** y **admin**.

### 📋 Crear un administrador (super‑usuario)

```bash
python manage.py createsuperuser
```

Responde a las preguntas de `Username`, `Email` y `Password`.

⚠️ **Importante**: El campo `role` queda por defecto en `volunteer`. Debes cambiarlo a `admin`:

**Opción 1 — Interfaz web**:
- Ve a `http://localhost:8000/admin/`
- Entra con tus credenciales
- Busca tu usuario y cambia **Role** a `admin`

**Opción 2 — Consola**:
```bash
python manage.py shell
from core.models import CustomUser
u = CustomUser.objects.get(username='tu_nombre')
u.role = 'admin'
u.save()
exit()
```

### 🔐 Autenticación con JWT

**POST** `http://localhost:8000/api/auth/login/`

```json
{
  "username": "admin",
  "password": "tu_contraseña"
}
```

Respuesta:
```json
{
  "refresh": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "access": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9..."
}
```

Usa el `access` token en el header de cada petición protegida:
```
Authorization: Bearer <access_token>
```

### ➕ Crear usuarios (sólo admin)

**POST** `http://localhost:8000/api/users/create/`

Headers:
```
Authorization: Bearer <access_token_admin>
Content-Type: application/json
```

Body:
```json
{
  "username": "voluntario1",
  "email": "voluntario1@ejemplo.com",
  "role": "volunteer"
}
```

Respuesta:
```json
{
  "id": 2,
  "username": "voluntario1",
  "email": "voluntario1@ejemplo.com",
  "role": "volunteer",
  "temp_password": "_UHDdqR33J0C4-32"
}
```

**El campo `temp_password` es la contraseña generada.** El admin debe comunicársela al usuario. El usuario usa esa contraseña para siempre (no puede cambiarla).

### 🧑‍💻 Login de un usuario normal

**POST** `http://localhost:8000/api/auth/login/`

```json
{
  "username": "voluntario1",
  "password": "_UHDdqR33J0C4-32"
}
```

Recibirá sus propios tokens para acceder a la API.

---

## 🧠 Notas técnicas

- Las contraseñas se guardan **hasheadas** usando `user.set_password()`.
- Solo usuarios con `role='admin'` pueden invocar el endpoint de creación.
- El flag `force_password_change` existe en el modelo para futuras mejoras.
- Los JWTs incluyen `username`, `role` y `force_password_change` en el payload.

---

## 📖 Workflow de equipo

### Para actualizar cambios del equipo:

```bash
git pull origin main
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

### Para trabajar (tus cambios):

```bash
# 1. Siempre con venv activo
.venv\Scripts\activate

# 2. Edita archivos (modelos, vistas, etc.)

# 3. Test local
python manage.py makemigrations  # si tocaste modelos
python manage.py migrate
python manage.py runserver

# 4. Subir cambios
git add .
git commit -m "feat: descripción de cambios"
git push origin main
```

---

## 🛠️ Stack actual

- **Framework**: Django REST Framework
- **Autenticación**: djangorestframework-simplejwt
- **Database**: SQLite (desarrollo) / MySQL (producción)
- **Frontend**: React + Vite (en `frontend/`)

# HFO API Documentation

## Autenticación

Todos los endpoints protegidos requieren un header JWT:
```
Authorization: Bearer <access_token>
```

El token se obtiene en `POST /api/auth/login/` y contiene:
- `username`
- `role`: `volunteer` | `coordinator` | `analyst` | `admin`
- `force_password_change`: `true` | `false`

---

## Endpoints

### POST /api/auth/login/
Obtener tokens JWT.

**Body (JSON):**
```json
{
    "username": "string",
    "password": "string"
}
```

**Respuesta 200:**
```json
{
    "access": "<jwt_token>",
    "refresh": "<jwt_token>"
}
```

---

### POST /api/users/create/
Crear un usuario nuevo. Solo `admin`.

**Body (JSON):**
```json
{
    "username": "string",
    "email": "string",
    "role": "volunteer | coordinator | analyst | admin"
}
```

**Respuesta 201:**
```json
{
    "id": 1,
    "username": "string",
    "email": "string",
    "role": "volunteer",
    "temp_password": "xK9mP2qL..."
}
```

---

### POST /api/reports/create/
Crear un reporte de campo. Roles: todos los autenticados.

**Content-Type:** `multipart/form-data`

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `needs` | string | No | Necesidades observadas |
| `notes` | string | No | Notas adicionales |
| `people_count` | integer | No | Número de personas |
| `audio_file` | file | No | Audio (mp3, wav, ogg) máx 10MB |
| `photo_file` | file | No | Foto (jpg, jpeg, png) máx 10MB |
| `hora_evento` | datetime | No | Cuándo ocurrió (ISO 8601) |
| `timezone` | string | No | Zona horaria (ej: Europe/Madrid) |
| `tipo_punto` | string | No | `actual` \| `pushback` \| `policia` \| `mafia` |
| `positions` | string (JSON) | No | Array de posiciones GPS |

**Formato de `positions`:**
```json
[
    {"lat": 36.72, "lon": 28.41},
    {"lat": 36.73, "lon": 28.42}
]
```

⚠️ El reporte debe tener al menos un campo con contenido.

**Respuesta 201:**
```json
{
    "id": 1,
    "submitted_by": "username",
    "timestamp": "2026-03-18T10:00:00Z",
    "needs": "Agua, ropa",
    "notes": "string",
    "people_count": 10,
    "audio_file": null,
    "photo_file": null,
    "hora_evento": null,
    "timezone": "Europe/Madrid",
    "tipo_punto": "actual",
    "positions": [
        {"latitude": "36.720000", "longitude": "28.410000", "order": 0}
    ]
}
```

---

### GET /api/reports/
Listar reportes. Roles: todos los autenticados.
- Volunteers: solo ven sus propios reportes.
- Admin/analyst/coordinator: ven todos.

**Filtros disponibles:**
| Parámetro | Descripción |
|-----------|-------------|
| `min_people` | Mínimo de personas |
| `max_people` | Máximo de personas |
| `days` | Últimos N días |
| `needs` | Texto en necesidades |
| `volunteer` | Username del voluntario |
| `ordering` | `timestamp` o `people_count` (prefijo `-` para descendente) |

---

### GET /api/reports/<id>/
Detalle de un reporte. Roles: `analyst`, `coordinator`, `admin`.

---

### GET /api/data-export/
Exportar CSV anonimizado para ML. Roles: `analyst`, `admin`.

**Respuesta:** archivo `hfo_export.csv`

**Columnas:**

| Columna | Descripción | Ejemplo |
|---------|-------------|---------|
| `id_unico` | ID anonimizado formato P0001 | `P0001` |
| `hora_evento` | Cuándo ocurrió el evento | `2026-03-18 10:00:00` |
| `hora_registro` | Cuándo se registró en el sistema | `2026-03-18 10:05:00` |
| `timezone` | Zona horaria del voluntario | `Europe/Madrid` |
| `lat` | Latitud de la posición | `36.720000` |
| `long` | Longitud de la posición | `28.410000` |
| `tipo_punto` | Tipo de situación | `actual` |

⚠️ Una fila por posición GPS. Sin datos de usuario