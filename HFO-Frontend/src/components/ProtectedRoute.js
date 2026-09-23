// frontend/src/components/ProtectedRoute\.js
import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

// Este componente "envuelve" a otras pantallas
const ProtectedRoute = ({ children }) => {
    const { user, loading } = useContext(AuthContext);

    // Mientras comprueba el token en localStorage, muestra un cargando
    if (loading) return <div>Comprobando seguridad...</div>;

    // Si no hay usuario logueado, lo manda al login
    if (!user) return <Navigate to="/login" replace />;

    // Si tiene permiso, muestra la pantalla hija (el dashboard)
    return children;
};

export default ProtectedRoute;

