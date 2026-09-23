// frontend/src/services/reportService.js
import api from '../api/axios.js';

const reportService = {

    getAllReports: async (filters = {}) => {
        try {
            const response = await api.get('reports/', { params: filters });
            return response.data;
        } catch (error) {
            console.error("Error al obtener los reportes:", error);
            throw error;
        }
    },

    createReport: async (reportData) => {
        try {
            const formData = new FormData();

            if (reportData.needs)        formData.append('needs', reportData.needs);
            if (reportData.notes)        formData.append('notes', reportData.notes);
            if (reportData.people_count) formData.append('people_count', reportData.people_count);
            if (reportData.audio_file)   formData.append('audio_file', reportData.audio_file);
            if (reportData.photo_file)   formData.append('photo_file', reportData.photo_file);

            if (reportData.latitude && reportData.longitude) {
                const positions = JSON.stringify([{
                    lat: reportData.latitude,
                    lon: reportData.longitude
                }]);
                formData.append('positions', positions);
            }

            // ⚠️ Sin headers manuales — axios lo gestiona solo
            const response = await api.post('reports/create/', formData);
            return response.data;

        } catch (error) {
            console.error("Error al crear el reporte:", error);
            throw error;
        }
    }
};

export default reportService;