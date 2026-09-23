from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    """Solo usuarios con rol 'admin'."""
    message = "Acceso restringido a administradores."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role == 'admin'
        )


class IsAnalyst(BasePermission):
    """Analistas y administradores. (coordinator eliminado)"""
    message = "Acceso restringido a analistas o administradores."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in ['admin', 'analyst']
        )


class IsVolunteer(BasePermission):
    """Cualquier usuario autenticado (todos los roles)."""
    message = "Debes estar autenticado para acceder a este recurso."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
        )

# IsCoordinator → ELIMINADO