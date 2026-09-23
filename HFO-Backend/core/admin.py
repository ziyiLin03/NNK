from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, FieldReport, ReportPosition


# ─── CustomUser ───────────────────────────────────────────────────────────────

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ('Campos personalizados', {
            'fields': ('role', 'force_password_change')
        }),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Campos personalizados', {
            'fields': ('role', 'force_password_change')
        }),
    )
    list_display = ('username', 'email', 'role', 'force_password_change', 'is_staff')
    list_filter  = ('role', 'is_staff', 'is_active')


# ─── FieldReport ──────────────────────────────────────────────────────────────

@admin.register(FieldReport)
class FieldReportAdmin(admin.ModelAdmin):
    list_display  = ('id', 'submitted_by', 'is_submitted', 'tipo_punto', 'timestamp')
    list_filter   = ('is_submitted', 'tipo_punto')
    search_fields = ('submitted_by__username', 'needs', 'notes')
    readonly_fields = ('timestamp',)


# ─── ReportPosition ───────────────────────────────────────────────────────────

@admin.register(ReportPosition)
class ReportPositionAdmin(admin.ModelAdmin):
    list_display  = ('id', 'report', 'order', 'category', 'latitude', 'longitude', 'location_name')
    list_filter   = ('category',)