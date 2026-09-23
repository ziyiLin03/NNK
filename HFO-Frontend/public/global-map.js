document.addEventListener("DOMContentLoaded", async () => {
    const token = localStorage.getItem('access_token');
    const role = localStorage.getItem('user_role');
    if (!token) {
        window.location.href = './index.html'; // o login.html
        alert("Access denied. Please log in with appropriate credentials.");
        return; // ← importante: detiene todo lo demás
    }

    if (role !== 'admin' && role !== 'analyst') {
        window.location.href = './home.html';
        alert("Access denied. Please log in with the appropriate role.");
        return;
    }

    const limitesMundiales = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
    // 1. Inicializamos el mapa centrado (puedes ajustar las coordenadas [Latitud, Longitud] y el zoom)
    const mapaGlobal = L.map('mapOverview', {
        maxBounds: limitesMundiales,      // No deja salir del mapa
        maxBoundsViscosity: 1.0,          // Hace que el límite sea sólido (1.0 = no atraviesa)
        minZoom: 3,                       // Zoom mínimo (para que no se vea el mundo minúsculo)
        maxZoom: 18,                      // Zoom máximo (para que no se pixele)
        worldCopyJump: false              // Evita saltar entre "mundos" repetidos
    }).setView([44.0, 18.0], 5);

    // 2. Cargamos las texturas del mapa (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        noWrap: true,                     // ¡ESTO evita que el mundo se repita horizontalmente!
        bounds: limitesMundiales,
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(mapaGlobal);

    // 3. Función para crear el icono visual dependiendo del "tipo" guardado
    function crearIcono(tipo) {
        let iconoFa = 'fa-location-dot'; 
        let colorFondo = '#333'; // Gris oscuro por defecto

        // Asignamos icono y color según el tipo
        if (tipo === 'policia') { 
            iconoFa = 'fa-person-military-rifle'; 
            colorFondo = '#0056b3'; // Azul
        } else if (tipo === 'medico') { 
            iconoFa = 'fa-briefcase-medical'; 
            colorFondo = '#28a745'; // Verde
        } else if (tipo === 'comida') { 
            iconoFa = 'fa-utensils'; 
            colorFondo = '#ffc107'; // Amarillo
        } else if (tipo === 'violencia') { 
            iconoFa = 'fa-hand-fist'; 
            colorFondo = '#dc3545'; // Rojo
        }

        // Construimos el HTML del icono circular
        const htmlCustom = `
            <div style="background-color: ${colorFondo}; color: white; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.5); font-size: 14px;">
                <i class="fa-solid ${iconoFa}"></i>
            </div>
        `;

        // Le decimos a Leaflet que use este HTML como marcador
        
        return L.divIcon({ 
            html: htmlCustom, 
            className: '', // Lo dejamos vacío para que no aplique estilos base molestos
            iconSize: [30, 30], 
            iconAnchor: [15, 15], // Centra el icono exactamente en la coordenada
            popupAnchor: [0, -15] // Hace que el bocadillo salga un poco más arriba
        });
    }

    try {
        // 4. Pedimos los reportes a tu servidor
        const response = await fetch('/api/all-reports');
        if (!response.ok) throw new Error("Error obteniendo los reportes del servidor");
        
        const reports = await response.json();

        // 5. Recorremos cada reporte
        reports.forEach(report => {
            
            // Verificamos si el reporte tiene un array de coordenadas
            if (report.coordenadas && Array.isArray(report.coordenadas) && report.coordenadas.length > 0) {
                
                // Recorremos cada pin dentro de ese reporte
                report.coordenadas.forEach(coord => {
                    
                    // Creamos el marcador pasándole el tipo de coordenada (coord.type)
                    // Si es un reporte viejo que no tiene 'type', usará el icono por defecto
                    const marcador = L.marker([coord.lat, coord.lng], { 
                        icon: crearIcono(coord.type) 
                    }).addTo(mapaGlobal);
                    
                    // Diseñamos la tarjeta que se abre al hacer clic (Popup)
                    const tipoTexto = coord.type ? coord.type.toUpperCase() : 'GENERAL';
                    
                    const popupHTML = `
                        <div style="text-align: center; min-width: 140px;">
                            <h3 style="margin: 0 0 5px 0; color: #333; font-size: 16px;">${report.custom_id || 'ID N/A'}</h3>
                            <p style="margin: 0 0 5px 0; color: #555; font-size: 14px;"><b>Name:</b> ${report.name || 'Unknown'}</p>
                            <p style="margin: 0 0 12px 0; color: #555; font-size: 12px;"><b>Pin Type:</b> ${tipoTexto}</p>
                            
                            <a href="/report?id=${report.id}" style="background-color: rgb(193, 18, 31); color: white; padding: 6px 12px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 13px; transition: 0.3s;">
                                Ver Reporte
                            </a>
                        </div>
                    `;
                    
                    marcador.bindPopup(popupHTML);
                });
            }
        });

    } catch (error) {
        console.error("Error al cargar los pines en el mapa global:", error);
    }
});