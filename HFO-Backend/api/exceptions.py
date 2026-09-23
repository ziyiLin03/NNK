from rest_framework.views import exception_handler
from rest_framework.response import Response
from http import HTTPStatus


def custom_exception_handler(exc, context):
    # Llama al handler por defecto de DRF primero
    response = exception_handler(exc, context)

    if response is not None:
        status_code = response.status_code

        # Obtiene descripción legible del código HTTP
        try:
            mensaje = HTTPStatus(status_code).description
        except ValueError:
            mensaje = "Error inesperado."

        response.data = {
            "error": True,
            "status_code": status_code,
            "mensaje": mensaje,
            "detalles": response.data,
        }

    return response
