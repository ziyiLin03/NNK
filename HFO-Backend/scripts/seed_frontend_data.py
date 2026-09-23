import django, os, sys
sys.path.insert(0, '/app')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hfo_backend.settings')
django.setup()

from core.models import CustomUser, FieldReport, ReportPosition

def get_or_create_user(username, email, password, role):
    user, created = CustomUser.objects.get_or_create(
        username=username,
        defaults={'email': email, 'role': role}
    )
    if created:
        user.set_password(password)
        user.save()
        print(f"✅ Usuario creado: {username} ({role})")
    else:
        print(f"ℹ️  Usuario ya existe: {username}")
    return user

# Usuarios
analyst   = get_or_create_user('analyst_fe',   'analyst@test.com',   'Frontend1234!',  'analyst')
volunteer = get_or_create_user('volunteer_fe',  'volunteer@test.com', 'Volunteer1234!', 'volunteer')

# Reportes de prueba
# 1. Detailed data including the new fields
SEED_REPORTS = [
    {
        "name": "Ahmad", 
        "age": 28,
        "gender": "Male",
        "nationality": "Syria",
        "needs": "Grupo de 30 personas en el paso norte", 
        "people_count": 30, 
        "tipo_punto": "actual",
        "coords": [(36.7213, -5.4195), (36.7225, -5.4180)] 
    },
    {
        "name": "Fátima", 
        "age": 34,
        "gender": "Female",
        "nationality": "Morocco",
        "needs": "Pushback registrado en zona costera", 
        "people_count": 12, 
        "tipo_punto": "pushback",
        "coords": [(36.7350, -5.4050), (36.7301, -5.4100)] 
    },
    {
        "name": "Youssef", 
        "age": 21,
        "gender": "Male",
        "nationality": "Algeria",
        "needs": "Presencia policial en punto de entrada", 
        "people_count": 5, 
        "tipo_punto": "policia",
        "coords": [(36.7150, -5.4250)]
    },
    {
        "name": "Familia Siria", 
        "age": 40,
        "gender": "Other",
        "nationality": "Syria",
        "needs": "Familia con menores esperando asistencia", 
        "people_count": 8, 
        "tipo_punto": "actual",
        "coords": [(36.7180, -5.4220)]
    },
    {
        "name": "Testimonio Anónimo", 
        "age": 25,
        "gender": "Unknown",
        "nationality": "Afghanistan",
        "needs": "Grupo detectado por mafia en ruta secundaria", 
        "people_count": 20, 
        "tipo_punto": "mafia",
        "coords": [(36.7260, -5.4130), (36.7280, -5.4150), (36.7300, -5.4170)] 
    },
]

created = 0
for data in SEED_REPORTS:
    # Check if report already exists to avoid duplicates
    if not FieldReport.objects.filter(needs=data["needs"]).exists():
        r = FieldReport.objects.create(
            submitted_by=volunteer,
            name=data["name"],
            age=data.get("age"),               # <--- New
            gender=data.get("gender"),         # <--- New
            nationality=data.get("nationality"), # <--- New
            needs=data["needs"],
            people_count=data["people_count"],
            tipo_punto=data["tipo_punto"],
        )
        
        # Handle the map points
        coord_list = data.get("coords", [])
        for index, coord in enumerate(coord_list):
            lat, lon = coord
            ReportPosition.objects.create(
                report=r, 
                latitude=lat, 
                longitude=lon, 
                order=index
            )
            
        print(f"✅ Created Report #{r.id}: {r.name} ({r.age}y, {r.gender})")
        created += 1

print(f"\n🌱 Seed completed — {created} reports added.")