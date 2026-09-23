// frontend/src/pages/Login\.js
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { jwtDecode } from 'jwt-decode';

const Login = () => {
    // 1. Estados locales para guardar lo que el usuario escribe
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(''); // Para mostrar "Contraseña incorrecta"

    // 2. Traemos herramientas de React
    const { login } = useContext(AuthContext); // Traemos la función de login del megáfono
    const navigate = useNavigate(); // Herramienta para saltar a otra pantalla

    // 3. Lo que pasa cuando pulsamos el botón "Entrar"
    const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
        const data = await login(username, password);
        const decoded = jwtDecode(data.access);
        // Leemos el flag del token JWT
        if (data.force_password_change) {
            navigate('/change-password');
        } else {
            navigate('/dashboard');
        }
    } catch (err) {
        setError('Credenciales incorrectas. Inténtalo de nuevo.');
    }
    };

    // 4. El esqueleto visual (Lo que luego los diseñadores pondrán bonito)
    return (
        <div style={{ padding: '20px', maxWidth: '300px', margin: 'auto' }}>
            <h2>Iniciar Sesión</h2>
            
            {/* Si hay error, lo mostramos en rojo */}
            {error && <p style={{ color: 'red' }}>{error}</p>}
            
            <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: '10px' }}>
                    <label>Usuario:</label><br />
                    <input 
                        type="text" 
                        value={username}
                        onChange={(e) => setUsername(e.target.value)} 
                        required
                    />
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <label>Contraseña:</label><br />
                    <input 
                        type="password" 
                        value={password}
                        onChange={(e) => setPassword(e.target.value)} 
                        required
                    />
                </div>
                <button type="submit">Entrar</button>
            </form>
        </div>
    );
};

export default Login;

