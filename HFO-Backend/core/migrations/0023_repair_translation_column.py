from django.db import migrations


def repair_translation(apps, schema_editor):
    # 0014 added this field only to migration state, assuming an existing DB.
    model = apps.get_model('core', 'FieldReport')
    with schema_editor.connection.cursor() as cursor:
        columns = schema_editor.connection.introspection.get_table_description(
            cursor, model._meta.db_table)
    if 'translation' not in {column.name for column in columns}:
        schema_editor.add_field(model, model._meta.get_field('translation'))


class Migration(migrations.Migration):
    dependencies = [('core', '0022_chatroom_name_alter_chatroom_room_type')]
    operations = [migrations.RunPython(repair_translation, migrations.RunPython.noop)]
