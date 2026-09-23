// frontend/src/main\.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // Para las rutas (/login, /dashboard)
import App from './App.js';
import { AuthProvider } from './context/AuthContext.js'; // Nuestro megáfono

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* Envolvemos la app en el Router y luego en el Contexto */}
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);


