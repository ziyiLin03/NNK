document.addEventListener("DOMContentLoaded", () => {
    const token = localStorage.getItem('access_token');
    if (!token) {
        window.location.href = './index.html'; // o login.html
        alert("Access denied. Please log in with appropriate credentials.");
        return; // ← importante: detiene todo lo demás
    }
    const role = localStorage.getItem('user_role');
    if (role === 'analyst') {
        window.location.href = './home.html';
        alert("Access denied. Please log in with the appropriate role.");
        return;
    }

    const limitesMundiales = L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180));
    const mapa = L.map('mapaEscritura', {
        maxBounds: limitesMundiales,
        maxBoundsViscosity: 1.0,
        minZoom: 4,
        maxZoom: 18,
        worldCopyJump: false
    }).setView([44.0, 18.0], 3);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        noWrap: true,
        bounds: limitesMundiales,
        attribution: '© OpenStreetMap'
    }).addTo(mapa);

    let listaDeCoordenadas = [];
    let capaRutaBase = null;
    let capaFlechasRuta = null;

    // ── Categorías (deben coincidir con CATEGORY_CHOICES del modelo) ──────────
    const CATEGORIAS = [
        { value: 'mafia',      label: 'Mafia' },
        { value: 'violence',   label: 'Violence' },
        { value: 'robbery',    label: 'Robbery' },
        { value: 'extortion',  label: 'Extortion' },
        { value: 'medical',    label: 'Medical' },
        { value: 'shelter',    label: 'Shelter' },
        { value: 'food',       label: 'Food' },
        { value: 'police',     label: 'Police' },
        { value: 'pushback',   label: 'Pushback' },
        { value: 'safe_point', label: 'Safe point' },
        { value: 'nothing',   label: 'Nothing' },
        { value: 'future',     label: 'Future' },
        { value: 'origin',     label: 'Origin' },
        { value: 'destination',     label: 'Destination' },
    ];

    // ── Iconos por tipo visual (para el marcador Leaflet) ─────────────────────
    function crearIconoHTML(tipo) {
        const iconMap = {
            police:     { fa: 'fa-person-military-rifle', color: '#0056b3' },
            medical:    { fa: 'fa-briefcase-medical',     color: '#28a745' },
            food:       { fa: 'fa-utensils',              color: '#ffc107' },
            violence:   { fa: 'fa-hand-fist',             color: 'rgb(193,18,31)' },
            pushback:   { fa: 'fa-ban',                   color: '#e67e22' },
            shelter:    { fa: 'fa-house',                 color: '#8e44ad' },
            mafia:      { fa: 'fa-skull',                 color: '#2c3e50' },
            robbery:    { fa: 'fa-mask',                  color: '#c0392b' },
            extortion:  { fa: 'fa-hand-holding-dollar',  color: '#d35400' },
            safe_point: { fa: 'fa-shield-halved',         color: '#27ae60' },
            nothing:    { fa: 'fa-person-walking-arrow-right',  color: '#ffffff' },
            future:     { fa: 'fa-location-arrow',        color: '#2980b9' },
            origin:     { fa: 'fa-home',                  color: '#72f6ff' },
            destination: { fa: 'fa-flag',                 color: '#610404' },
        };
        const cfg = iconMap[tipo] || { fa: 'fa-location-dot', color: '#333' };
        const html = `<div style="background:${cfg.color};color:white;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,.5);"><i class="fa-solid ${cfg.fa}" style="font-size:13px;"></i></div>`;
        return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
    }

    // ── Ruta ──────────────────────────────────────────────────────────────────
    function actualizarRutaDirigida() {
        if (capaRutaBase)    { mapa.removeLayer(capaRutaBase);    capaRutaBase = null; }
        if (capaFlechasRuta) { mapa.removeLayer(capaFlechasRuta); capaFlechasRuta = null; }

        if (listaDeCoordenadas.length > 1) {
            const puntos = listaDeCoordenadas.map(c => [c.lat, c.lng]);
            capaRutaBase = L.polyline(puntos, { color: 'rgb(193,18,31)', weight: 3, opacity: 0.6 }).addTo(mapa);
            capaFlechasRuta = L.polylineDecorator(capaRutaBase, {
                patterns: [{ offset: '15px', repeat: '50px', symbol: L.Symbol.arrowHead({ pixelSize: 12, pathOptions: { fillOpacity: 1, color: 'rgb(193,18,31)', stroke: false } }) }]
            }).addTo(mapa);
        }
    }

    // ── HTML del formulario de detalle ────────────────────────────────────────
    function crearFormularioDetalle(coordObj, esNuevo) {
        const opcionesCategoria = CATEGORIAS.map(cat =>
            `<option value="${cat.value}" ${coordObj.category === cat.value ? 'selected' : ''}>${cat.label}</option>`
        ).join('');

        // Formateamos passed_at para datetime-local (quita la Z / zona)
        let passedAtValue = '';
        if (coordObj.passed_at) {
            passedAtValue = coordObj.passed_at.slice(0, 16); // "2025-04-28T14:30"
        }

        const titulo = esNuevo ? 'New point' : 'Edit point';
        const btnPrimario = esNuevo ? 'Save point' : 'Update';
        const btnSecundario = esNuevo ? 'Cancel' : 'Delete';

        return `
        <div style="min-width:220px;">
            <b style="display:block; color:var(--text-dark);margin-bottom:10px;font-size:14px;">${titulo}</b>

            <label style="font-size:12px;color:var(--text-dark);display:block;margin-bottom:3px;">Category</label>
            <select id="pop-category" style="width:100%;margin-bottom:8px;font-size:13px;padding:5px;border:1px solid #ddd;border-radius:6px;">
                <option style="color:var(--text-dark);" value="">— select —</option>
                ${opcionesCategoria}
            </select>

            <label style="font-size:12px;color:var(--text-dark);display:block;margin-bottom:3px;">Description</label>
            <textarea id="pop-description" rows="3" placeholder="What happened here?" style="width:100%;font-size:13px;padding:5px;border:1px solid #ddd;border-radius:6px;resize:none;box-sizing:border-box;">${coordObj.description || ''}</textarea>

            <label style="font-size:12px;color:var(--text-dark);display:block;margin-top:6px;margin-bottom:3px;">Time at this point</label>
            <input id="pop-passed-at" type="datetime-local" value="${passedAtValue}" style="width:100%;font-size:13px;padding:5px;border:1px solid #ddd;border-radius:6px;box-sizing:border-box;" />

            <div style="display:flex;gap:8px;margin-top:12px;">
                <button id="pop-btn-secondary" style="flex:1;padding:7px;font-size:13px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;">${btnSecundario}</button>
                <button id="pop-btn-primary" style="flex:2;padding:7px;font-size:13px;background:#1849a9;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:500;">${btnPrimario}</button>
            </div>
        </div>`;
    }

    // ── Agregar marcador ──────────────────────────────────────────────────────
    function agregarMarcador(coordObj) {
        const marker = L.marker([coordObj.lat, coordObj.lng], {
            icon: crearIconoHTML(coordObj.category || coordObj.type),
            draggable: true
        }).addTo(mapa);

        marker.on('dragend', (e) => {
            const pos = e.target.getLatLng();
            coordObj.lat = pos.lat;
            coordObj.lng = pos.lng;
            actualizarRutaDirigida();
        });

        marker.on('click', () => {
            const container = document.createElement('div');
            container.innerHTML = crearFormularioDetalle(coordObj, false);

            const popup = L.popup({ maxWidth: 280 })
                .setLatLng([coordObj.lat, coordObj.lng])
                .setContent(container)
                .openOn(mapa);

            // Botón Update
            container.querySelector('#pop-btn-primary').onclick = () => {
                coordObj.category    = container.querySelector('#pop-category').value;
                coordObj.description = container.querySelector('#pop-description').value;
                const rawDate        = container.querySelector('#pop-passed-at').value;
                coordObj.passed_at   = rawDate ? new Date(rawDate).toISOString() : null;
                // Actualizar icono del marcador
                marker.setIcon(crearIconoHTML(coordObj.category));
                mapa.closePopup();
            };

            // Botón Delete
            container.querySelector('#pop-btn-secondary').onclick = () => {
                mapa.removeLayer(marker);
                listaDeCoordenadas = listaDeCoordenadas.filter(c => c !== coordObj);
                mapa.closePopup();
                actualizarRutaDirigida();
            };
        });
    }

    // ── Cargar puntos guardados (borrador) ────────────────────────────────────
    const borradorStringMap = localStorage.getItem('reporteBorrador');
    if (borradorStringMap) {
        const borrador = JSON.parse(borradorStringMap);
        let rawPos = borrador.positions || borrador.coordenadas;
if (typeof rawPos === 'string') {
    try { rawPos = JSON.parse(rawPos); } catch(e) { rawPos = []; }
}
const puntosMap = rawPos;

        if (puntosMap && puntosMap.length > 0) {
    listaDeCoordenadas = puntosMap.map(c => ({
        lat:         parseFloat(c.lat      ?? c.latitude  ?? 0),
        lng:         parseFloat(c.lng      ?? c.lon ?? c.longitude ?? 0),
        category:    c.category    || 'nothing',   // <-- asegurar que existe
        description: c.description || '',
        passed_at:   c.passed_at   || null
    }));

    listaDeCoordenadas.forEach(coordObj => agregarMarcador(coordObj));
    actualizarRutaDirigida();  // <-- llamar DESPUÉS de añadir todos los puntos

    if (listaDeCoordenadas.length > 0) {
        mapa.setView([listaDeCoordenadas[0].lat, listaDeCoordenadas[0].lng], 5);
    }
}
    }

    // ── Click en mapa: elegir tipo → rellenar detalle ─────────────────────────
    mapa.on('click', (e) => {
        const { lat, lng } = e.latlng;

        // Paso 1: elegir tipo visual rápido (como antes)
        const contenedorTipo = document.createElement('div');
        contenedorTipo.innerHTML = `
    <b style="display:block;margin-bottom:8px;font-size:14px;">Select point type</b>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;min-width:220px;">
        ${CATEGORIAS.map(cat => `<button class="menu-btn" data-cat="${cat.value}" style="padding:7px 6px;border:1px solid #ddd;border-radius:6px;background:var(--content-bg);cursor:pointer;font-size:12px;text-align:center; color:var(--text-dark);">${cat.label}</button>`).join('')}
    </div>`;

        const popupTipo = L.popup({ maxWidth: 200 })
            .setLatLng([lat, lng])
            .setContent(contenedorTipo)
            .openOn(mapa);

        contenedorTipo.querySelectorAll('.menu-btn').forEach(btn => {
            btn.onclick = () => {
                const categoria = btn.getAttribute('data-cat');
                mapa.closePopup();

                // Paso 2: formulario de detalle
                const nuevoPunto = { lat, lng, category: categoria, description: '', passed_at: null };

                const contenedorDetalle = document.createElement('div');
                contenedorDetalle.innerHTML = crearFormularioDetalle(nuevoPunto, true);

                const popupDetalle = L.popup({ maxWidth: 280 })
                    .setLatLng([lat, lng])
                    .setContent(contenedorDetalle)
                    .openOn(mapa);

                // Guardar punto
                contenedorDetalle.querySelector('#pop-btn-primary').onclick = () => {
                    nuevoPunto.category    = contenedorDetalle.querySelector('#pop-category').value;
                    nuevoPunto.description = contenedorDetalle.querySelector('#pop-description').value;
                    const rawDate          = contenedorDetalle.querySelector('#pop-passed-at').value;
                    nuevoPunto.passed_at   = rawDate ? new Date(rawDate).toISOString() : null;

                    listaDeCoordenadas.push(nuevoPunto);
                    agregarMarcador(nuevoPunto);
                    actualizarRutaDirigida();
                    mapa.closePopup();
                };

                // Cancelar
                contenedorDetalle.querySelector('#pop-btn-secondary').onclick = () => {
                    mapa.closePopup();
                };
            };
        });
    });

    // ── Guardar y volver ──────────────────────────────────────────────────────
    document.getElementById('btnGuardarMapa').onclick = () => {
        if (listaDeCoordenadas.length === 0) {
            alert('Please add at least one point.');
            return;
        }

        let borrador = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
        // Guardamos el formato que espera Django: lat, lon, category, description, passed_at
        borrador.positions = listaDeCoordenadas.map(c => ({
            lat:         c.lat,
            lon:         c.lng,          // el serializer acepta lon o lng
            category:    c.category,
            description: c.description,
            passed_at:   c.passed_at,
        }));
        delete borrador.coordenadas;

        localStorage.setItem('reporteBorrador', JSON.stringify(borrador));
        window.location.href = '/new-report.html';
    };
});