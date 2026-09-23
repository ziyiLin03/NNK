document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('loginForm');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const usernameInput = document.getElementById('username').value; 
        const passwordInput = document.getElementById('password').value;

        try {
            const response = await fetch(`${API_BASE_URL}/api/auth/login/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: usernameInput,
                    password: passwordInput
                })
            });

            if (response.ok) {
                const data = await response.json();
                
                // Decodificar el JWT para extraer el rol
                const payload = JSON.parse(atob(data.access.split('.')[1]));
                
                // Guardar todo lo necesario
                localStorage.setItem('access_token', data.access);
                localStorage.setItem('refresh_token', data.refresh);
                localStorage.setItem('user_role', payload.role);
                localStorage.setItem('username', payload.username);
                
                console.log("¡Login exitoso! Rol:", payload.role);
                
                // Redirigir según el rol
                if (payload.role === 'volunteer') {
                    window.location.href = './home.html';
                } else {
                    window.location.href = './dashboard.html';
                }

            } else {
                alert("Usuario o contraseña incorrectos. Inténtalo de nuevo.");
            }

        } catch (error) {
            console.error("Error al conectar con el servidor:", error);
            alert("No se pudo conectar con el servidor. ¿Está el Docker encendido?");
        }
    });
});