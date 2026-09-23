// frontend/src/App\.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ChangePassword from  './pages/ChangePassword';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Routes>
      {/* Ruta pública: Pantalla de Login */}
      <Route path="/login" element={<Login />} />
      
      {/* Ruta protegida: Solo si estás logueado ves el Dashboard */}
      <Route 
        path="/dashboard" 
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } 
      />

      {/* Si alguien entra a la raíz ("/") o inventa una ruta, lo mandamos al login */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default App;

