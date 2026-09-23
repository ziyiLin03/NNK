from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_reportposition_location_name'),
    ]

    operations = [
        # translation ya existe en la BD, solo actualizamos el estado de Django
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.AddField(
                    model_name='fieldreport',
                    name='translation',
                    field=models.TextField(blank=True, null=True),
                ),
            ],
            database_operations=[]  # No ejecuta nada en la BD
        ),
        # Estos sí cambian la BD (FileField → CharField)
        migrations.AlterField(
            model_name='fieldreport',
            name='audio_file',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
        migrations.AlterField(
            model_name='fieldreport',
            name='photo_file',
            field=models.CharField(blank=True, max_length=500, null=True),
        ),
    ]