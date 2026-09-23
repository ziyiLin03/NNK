// frontend/src/services/authService.js
import api from '../api/axios.js'; // Importamos a nuestro "cartero"

const authService = {
    // Función para iniciar sesión
    login: async (username, password) => {
        try {
            // Llama a LoginView de tu api/auth.py en Django
            const response = await api.post('auth/login/', {
                username,
                password
            });

            // Si Django responde OK, guardamos el token
            if (response.data.access) {
                localStorage.setItem('access_token', response.data.access);
                if (response.data.refresh) {
                    localStorage.setItem('refresh_token', response.data.refresh);
                }
            }
            return response.data;
            
        } catch (error) {
            console.error("Error en el login:", error.response?.data || error.message);
            throw error; // Lanzamos el error para que la UI lo atrape
        }
    },

    // Función para cerrar sesión
    logout: async () => {
        try {
            // Llamamos a tu logout_view en api/auth.py
            await api.post('auth/logout/');
        } catch (error) {
            console.error("Error al notificar al backend del logout", error);
        } finally {
            // Lo más importante: borramos los tokens del navegador
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
        }
    },

    changePassword: async (currentPassword, newPassword, confirmPassword) => {
    try {
        const response = await api.post('auth/change-password/', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword,
        });
        return response.data;
    } catch (error) {
        console.error("Error al cambiar la contraseña:", error.response?.data || error.message);
        throw error;
    }
    } 
};


export default authService;
