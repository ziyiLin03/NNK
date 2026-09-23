from django.db import migrations


def repair_missing_columns(apps, schema_editor):
    # The previous migration owns these fields. Repair only databases that
    # recorded it as applied without actually creating the columns.
    model = apps.get_model('core', 'FieldReport')
    with schema_editor.connection.cursor() as cursor:
        columns = {
            column.name for column in
            schema_editor.connection.introspection.get_table_description(cursor, model._meta.db_table)
        }
    for name in ('vulnerability_type', 'legal_situation'):
        if name not in columns:
            schema_editor.add_field(model, model._meta.get_field(name))

class Migration(migrations.Migration):

    dependencies = [
        ('core', '0015_fieldreport_legal_situation_and_more'), # Ensure this matches your last migration number
    ]

    operations = [
        migrations.RunPython(repair_missing_columns, migrations.RunPython.noop),
    ]
