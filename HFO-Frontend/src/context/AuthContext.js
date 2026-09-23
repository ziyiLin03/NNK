// frontend/src/context/AuthContext\.js
import React, { createContext, useState, useEffect } from 'react';
import authService from '../services/authService'; // Importamos el servicio que creaste antes
import { jwtDecode } from 'jwt-decode'; // Importamos la nueva herramienta

// 1. Creamos el "Megáfono"
export const AuthContext = createContext();

// 2. Creamos el Proveedor (El encargado de gritar por el megáfono)
export const AuthProvider = ({ children }) => {
    // Aquí guardamos el estado: ¿hay usuario o no? (Empezamos asumiendo que no)
    const [user, setUser] = useState(null);
    // Un estado de carga para no mostrar nada hasta saber si hay token guardado
    const [loading, setLoading] = useState(true);

    // Cuando la aplicación arranca, miramos si ya había un token de ayer en el navegador
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            try {
                // Descodificamos el token para sacar el rol y el usuario
                const decodedUser = jwtDecode(token);
                setUser(decodedUser);
            } catch (error) {
                console.error("Token inválido");
                localStorage.removeItem('access_token');
            } 
        }
        setLoading(false); // Ya terminamos de comprobar
    }, []);

    // La función oficial para loguearse que usarán nuestros botones
    const login = async (username, password) => {
        const data = await authService.login(username, password);
         // Si el login es exitoso, descodificamos el nuevo token inmediatamente
        const decodedUser = jwtDecode(data.access);
        setUser(decodedUser);
        return data;
    };

    // La función oficial para salir
    const logout = async () => {
        await authService.logout();
        // Borramos al usuario de la memoria de React
        setUser(null);
    };

    // Todo esto es lo que le pasamos al resto de la aplicación para que lo usen
    const valorParaCompartir = {
        user,
        login,
        logout,
        loading
    };

    // Y aquí es donde realmente lo compartimos con el resto de la aplicación (megafono)
    return (
        <AuthContext.Provider value={{ user, login, logout, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

