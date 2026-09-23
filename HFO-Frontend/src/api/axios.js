// frontend/src/api/axios.js
import axios from 'axios';

// 1. Creamos el cartero y le decimos dónde vive Django
const api = axios.create({
    baseURL: `${(window.API_BASE_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')}/api/`,
});

// 2. Interceptor: Se ejecuta ANTES de que la petición salga hacia Django
api.interceptors.request.use(
    (config) => {
        // Miramos si en el almacenamiento del navegador hay un token guardado
        const token = localStorage.getItem('access_token');
        
        // Si hay un token, se lo pegamos en la cabecera como exige tu backend
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);
// 3. Interceptor: Se ejecuta cuando Django responde con error
api.interceptors.response.use(
    (response) => response, // Si va bien, no hacemos nada
    async (error) => {
        const original = error.config;

        // Si Django dice "token caducado" y no lo hemos reintentado ya
        if (error.response?.status === 401 && !original._retry) {
            original._retry = true;

            try {
                const refresh = localStorage.getItem('refresh_token');
                const { data } = await axios.post(
                    `${api.defaults.baseURL}auth/token/refresh/`,
                    { refresh }
                );
                // Guardamos el nuevo token
                localStorage.setItem('access_token', data.access);
                if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
                // Reintentamos la petición original con el nuevo token
                original.headers.Authorization = `Bearer ${data.access}`;
                return api(original);
            } catch {
                // El refresh también caducó → logout
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export default api; // Exportamos a nuestro cartero para usarlo en el resto de la app
