# NNK / Human Flow Observatory

Monorepo con dos aplicaciones que se despliegan por separado:

| Aplicación | Carpeta | Plataforma |
| --- | --- | --- |
| Web Vite, HTML y mapas React | `HFO-Frontend/` | Vercel |
| API Django y analítica | `HFO-Backend/` | Railway |

La carpeta `HFO-Frontend/hfo-frontend/` es un prototipo antiguo y no se usa
para compilar ni desplegar. Cada aplicación conserva sus dependencias propias;
no hace falta instalar el `package.json` del backend para ejecutar Django.

## Desarrollo

Requisitos: Node 22.12+ o 24 y Docker Desktop con el motor Linux arrancado.
Desde la raíz:

```sh
npm run setup
# Solo si no existe: copiar HFO-Backend/.env.example a HFO-Backend/.env
npm run backend:up
```

En otra terminal, `npm run dev`. Web: http://localhost:5173.
API: http://localhost:8000. Compose crea PostgreSQL y aplica migraciones;
`npm run backend:down` detiene los servicios conservando el volumen de datos.
Para crear el primer usuario:

```sh
docker compose -f HFO-Backend/docker-compose.yml exec backend python manage.py createsuperuser
```

También se puede ejecutar Django con Python 3.12+, un entorno virtual,
`pip install -r HFO-Backend/requirements.txt` y una base PostgreSQL local.
Configurar `HFO-Backend/.env`, ejecutar `python HFO-Backend/manage.py migrate`
y `python HFO-Backend/manage.py runserver`.

## Conectar el monorepo a los nuevos despliegues

Conectar los nuevos proyectos a `https://github.com/ziyiLin03/NNK`, rama `main`.
Frontend: `https://nnk-nu.vercel.app`. Backend:
`https://perpetual-tranquility-production-d044.up.railway.app`.

### Vercel

- Root Directory: `HFO-Frontend` (no la subcarpeta `hfo-frontend`).
- Framework: Vite; instalación `npm ci`; build `npm run build`; salida `dist`.
- Variable `VITE_API_BASE_URL`: `https://perpetual-tranquility-production-d044.up.railway.app`
  o el origen público de la API, sin `/api`.
- Volver a desplegar después de cambiar la variable: se incorpora al build.
- No añadir una reescritura global a `index.html`: esta web tiene múltiples HTML.

`vercel.json` incluye los comandos y la caché de `/config.js`. El build genera
este script para las páginas HTML y los mapas; en desarrollo la API por defecto
es localhost. Si se omite la variable en producción se usa el nuevo servicio Railway.
Una variable `VITE_API_BASE_URL` configurada en Vercel tiene prioridad: actualizarla
también si todavía contiene el dominio antiguo, y generar un nuevo deployment.
No poner secretos en variables `VITE_*`: son públicas.

### Railway

- Root Directory: `/HFO-Backend`.
- Si se selecciona explícitamente Config File, usar `/HFO-Backend/railway.json`.
- Builder: Dockerfile. Quitar overrides antiguos de Start Command para usar
  el comando del Dockerfile: migraciones y Gunicorn en `$PORT`.
- Mantener la base de datos actual y sus variables `DB_NAME`, `DB_USER`,
  `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, o usar `DATABASE_URL` (tiene prioridad).
- `DJANGO_ENV=production`, `DJANGO_DEBUG=False` y un `SECRET_KEY` privado.
- `ALLOWED_HOSTS`: dominios de la API y `healthcheck.railway.app`, separados por comas.
- `CORS_ALLOWED_ORIGINS`: origen HTTPS del frontend, sin barra final.
- `CSRF_TRUSTED_ORIGINS`: orígenes HTTPS del frontend y backend.
- Conservar las credenciales Cloudinary y Groq del servicio existente.

El healthcheck `/health/` comprueba que Django responde, sin autenticación ni
redirección HTTPS; no comprueba servicios externos. Django acepta `DATABASE_URL`
y los orígenes configurados, usando los dominios del nuevo despliegue como valores por defecto.
`DJANGO_DEBUG` evita conflictos con una variable global `DEBUG` del sistema.

Referencias: [monorepos en Vercel](https://vercel.com/docs/monorepos),
[monorepos en Railway](https://docs.railway.com/deployments/monorepo).

## Comprobaciones

```sh
npm test
npm run build
python HFO-Backend/manage.py test api.tests.test_auth api.tests.test_deployment --settings=hfo_backend.test_settings
```

Las pruebas de Django usan SQLite en memoria, sin acceder a la base de producción.
La migración de reparación 0016 comprueba qué columnas faltan y también funciona
al crear esta base desde cero. Las pruebas antiguas de `api.tests.test_reports`
siguen pendientes de actualizar: usan el campo eliminado `status`, sustituido
en el modelo por `is_submitted`. No forman parte del comando anterior.

## Git e historial anterior

Las dos carpetas son archivos normales del monorepo, no submódulos.
Los directorios `.git` originales se conservaron **localmente** en
`.repo-backups/HFO-Frontend.git` y `.repo-backups/HFO-Backend.git`.
Se pueden consultar con `git --git-dir=.repo-backups/HFO-Frontend.git log`.
Ese historial no se ha fusionado con el monorepo; sus copias no se suben.
Los `.env`, entornos virtuales, logs y builds tampoco se incluyen en Git.
