// ==========================================
// CONFIGURACIÓN GLOBAL DE LA APLICACIÓN
// ==========================================

// URL para desarrollo local (tu ordenador)
//const API_BASE_URL = "http://localhost:8000";

// Vite supplies VITE_API_BASE_URL synchronously before legacy scripts run.
window.API_BASE_URL = window.API_BASE_URL || (
  ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    ? 'http://localhost:8000'
    : 'https://perpetual-tranquility-production-d044.up.railway.app'
);
window.HFO_ANALYTICS_API = window.API_BASE_URL;
