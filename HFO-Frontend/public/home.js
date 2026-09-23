const API_BASE_URL = window.API_BASE_URL || "http://127.0.0.1:8000"; 

async function loadReports() {
    console.log("🚀 Ejecutando carga visual de reportes pendientes...");
    
    const container = document.getElementById('reports-container');
    if (!container) return;

    // Dibujamos la estructura base de inmediato
    container.innerHTML = `
        <h1>My Testimonials</h1>
        <input id="searchInput" class="search-bar" type="text" placeholder="Search by name or ID...">
        <div id="reports-list"></div> 
    `;

    const listContainer = document.getElementById('reports-list');
    const searchInput = document.getElementById('searchInput');
    const token = localStorage.getItem('access_token');

    if (!token) {
        window.location.href = './index.html';
        return;
    }

    try {
        // Cargar datos de usuario (opcional, para el saludo si existe)
        fetch(`${API_BASE_URL}/api/auth/me/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => res.json()).then(userData => {
            const el = document.getElementById('nombreUsuario') || document.querySelector('.user-name');
            if (el) el.textContent = userData.username;
        }).catch(() => {});

        // Obtener Reportes
        const response = await fetch(`${API_BASE_URL}/api/my-reports/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error("Error API");
        const data = await response.json();
        
        // Convertimos a array
        const allMyReports = data.results || data;

        // --- FILTRO: Solo mostramos borradores (is_submitted = false) ---
        const pendingReports = allMyReports.filter(report => report.is_submitted === false);

        // --- LÓGICA DE AGRUPACIÓN ---
        const groupedMap = {};

        pendingReports.forEach(report => {
            const key = (report.group_id && report.group_id !== "null" && report.group_id !== "") 
                        ? report.group_id 
                        : `single_${report.id}`;
            
            if (!groupedMap[key]) {
                groupedMap[key] = {
                    ...report,
                    members: [report],
                    hasAudio: !!report.audio_file,
                    hasPhoto: !!(report.photo_file || (report.photos && report.photos.length > 0)),
                    hasMap: !!(report.positions && report.positions.length > 0)
                };
            } else {
                groupedMap[key].members.push(report);
                if (report.audio_file) groupedMap[key].hasAudio = true;
                if (report.photo_file || (report.photos && report.photos.length > 0)) groupedMap[key].hasPhoto = true;
                if (report.positions?.length > 0) groupedMap[key].hasMap = true;
            }
        });

        const finalGroups = Object.values(groupedMap).sort((a, b) => {
    const dateA = new Date(a.created_at || a.timestamp || a.date || 0);
    const dateB = new Date(b.created_at || b.timestamp || b.date || 0);
    return dateB - dateA; // más nuevo primero
});

        // Si no hay reportes pendientes
        if (finalGroups.length === 0) {
            listContainer.innerHTML = `<p style="text-align:center; padding:20px; color:gray;">No pending reports. All your work is submitted!</p>`;
            return;
        }

        // --- RENDERIZADO DE TARJETAS ---
        finalGroups.forEach(group => {
            const previewDiv = document.createElement('div');
            previewDiv.className = 'message-preview';
            
            const fechaRaw = group.created_at || group.timestamp || group.date;
            const fechaObj = new Date(fechaRaw);
            const fechaStr = isNaN(fechaObj) ? "No date" : fechaObj.toLocaleDateString();

            const esGrupo = group.members.length > 1;
            const nombres = group.members.map(m => m.name || 'Anonymous').join(', ');
            const displayNombre = esGrupo && nombres.length > 35 ? nombres.substring(0, 32) + '...' : nombres;

            previewDiv.onclick = () => window.location.href = `./report.html?id=${group.id}&source=draft`;

            previewDiv.innerHTML = `
                <i class="fa-solid ${esGrupo ? 'fa-users' : 'fa-user'}" style="color: var(--text-dark); font-size: 18px; width: 30px; text-align: center;"></i>
                <div style="width: 70px; text-align: center;">
                    <span style="background-color: rgb(192, 18, 30); color: white; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">
                        ${esGrupo ? 'Grp: ' + group.members.length : 'Single'}
                    </span>
                </div>
                <div style="flex: 1; padding: 0 15px;">
                    <p class="name" style="color: var(--text-dark); margin: 0; font-size: 14px; font-weight: bold;">${displayNombre}</p>
                </div>
                <div class="report-datetime" style="width: 120px; text-align: center; font-size: 12px;">
                    <i class="fa-regular fa-clock"></i> ${fechaStr}
                </div>
                <div class="methods-container" style="width: 130px; justify-content: flex-end; display: flex; gap: 5px;">
                    <span class="method-tag tag-active"><i class="fa-solid fa-file-signature"></i></span>
                    <span class="method-tag ${group.hasMap ? 'tag-active' : 'tag-inactive'}"><i class="fa-solid fa-map-location-dot"></i></span>
                    <span class="method-tag ${group.hasAudio ? 'tag-active' : 'tag-inactive'}"><i class="fa-solid fa-microphone"></i></span>
                    <span class="method-tag ${group.hasPhoto ? 'tag-active' : 'tag-inactive'}"><i class="fa-solid fa-camera"></i></span>
                </div>
            `;
            listContainer.appendChild(previewDiv);
        });

        // --- BUSCADOR ---
        searchInput.addEventListener('input', function() {
            const term = this.value.toLowerCase();
            Array.from(listContainer.children).forEach(card => {
                card.style.display = card.innerText.toLowerCase().includes(term) ? 'flex' : 'none';
            });
        });

    } catch (error) {
        console.error("Error final en Home:", error);
    }
}

// Asegurar ejecución en la carga
if (document.readyState === "complete" || document.readyState === "interactive") {
    loadReports();
} else {
    window.addEventListener('DOMContentLoaded', loadReports);
}