document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');
    const token = localStorage.getItem('access_token');
    const source       = urlParams.get('source');
    const API_BASE_URL = window.API_BASE_URL || "http://127.0.0.1:8000";
    const reportTitleEl = document.getElementById('report-custom-id');

    if (!reportId || !token) {
        window.location.href = './index.html';
        return;
    }

    let currentUserRole = 'volunteer';
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        currentUserRole = payload.role || 'volunteer';
    } catch (e) { console.error("Token decode error", e); }

    function obtenerIconoParaPunto(categoria) {
        const iconMap = {
            police:      { fa: 'fa-person-military-rifle', color: '#0056b3' },
            medical:     { fa: 'fa-briefcase-medical',     color: '#28a745' },
            food:        { fa: 'fa-utensils',              color: '#ffc107' },
            violence:    { fa: 'fa-hand-fist',             color: 'rgb(193,18,31)' },
            pushback:    { fa: 'fa-ban',                   color: '#e67e22' },
            shelter:     { fa: 'fa-house',                 color: '#8e44ad' },
            mafia:       { fa: 'fa-skull',                 color: '#2c3e50' },
            robbery:     { fa: 'fa-mask',                  color: '#c0392b' },
            extortion:   { fa: 'fa-hand-holding-dollar',  color: '#d35400' },
            safe_point:  { fa: 'fa-shield-halved',         color: '#27ae60' },
            nothing:     { fa: 'fa-person-walking-arrow-right', color: '#ffffff' },
            future:      { fa: 'fa-location-arrow',        color: '#2980b9' },
            origin:      { fa: 'fa-home',                  color: '#72f6ff' },
            destination: { fa: 'fa-flag',                  color: '#610404' },
        };
        const cfg = iconMap[categoria] || { fa: 'fa-location-dot', color: '#333' };
        const html = `<div style="background:${cfg.color};color:white;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"><i class="fa-solid ${cfg.fa}"></i></div>`;
        return L.divIcon({ html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
    }

    const isStaff = ['admin', 'analyst', 'coordinator'].includes(currentUserRole);
    const detailFolder = isStaff ? 'reports' : 'my-reports';

    try {
        reportTitleEl.textContent = `Report ID: NNK-${reportId}`;

        const response = await fetch(`${API_BASE_URL}/api/${detailFolder}/${reportId}/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) throw new Error("Report not found");
        const mainReport = await response.json();

        let allMembers = [mainReport];

        if (mainReport.group_id && mainReport.group_id !== "null" && mainReport.group_id !== "") {
            const groupRes = await fetch(
                `${API_BASE_URL}/api/reports/group/${mainReport.group_id}/`,
                { headers: { 'Authorization': `Bearer ${token}` } }
            );
            if (groupRes.ok) {
                const data = await groupRes.json();
                const fromServer = data.results || data;
                allMembers = [
                    ...new Map(
                        [mainReport, ...fromServer].map(m => [m.id, m])
                    ).values()
                ];
            } else {
                console.warn("Group fetch failed:", groupRes.status);
            }
        }

        console.log(`Loaded ${allMembers.length} member(s) for group`, mainReport.group_id);

        if (document.getElementById('report-type')) {
            document.getElementById('report-type').textContent = mainReport.interviewType || 'Testimony';
        }
        if (document.getElementById('report-group')) {
            document.getElementById('report-group').textContent = allMembers.length > 1 ? `Group of ${allMembers.length} people` : "Single Testimony";
        }

        renderPeople(allMembers);
        renderPhotos(mainReport);
        renderAudios(mainReport);
        renderMap(mainReport.positions, obtenerIconoParaPunto);
        setupButtons(mainReport, token, API_BASE_URL, currentUserRole, allMembers);

    } catch (error) {
        console.error("Error loading report:", error);
        alert("Could not load report details.");
    }
});

// ── renderPeople ──────────────────────────────────────────────────────────────

function renderPeople(members) {
    const container = document.getElementById('section-manual');
    if (!container) return;
    container.style.display = 'block';
    container.innerHTML = '<h3 style="margin-bottom: 12px;" class="section-title"><i class="fa-solid fa-users"></i> Manual Report</h3>';

    members.forEach((p, idx) => {
        const label = members.length === 1 ? "" : ` ${idx + 1}`;
        const card = document.createElement('div');
        card.className = "member-card";
        card.style.cssText = "background:#f9f9f9; border-radius:10px; padding:15px; margin-bottom:15px; border-left:5px solid #c1121f; box-shadow: 0 2px 4px rgba(0,0,0,0.05); overflow:hidden; max-width:100%;";
        card.innerHTML = `
            <p style="margin:0 0 10px 0; font-weight:bold; color:#c1121f;">MEMBER${label}: ${p.name || 'Anonymous'}</p>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; font-size:13px;">
                <span><strong>Age:</strong> ${p.age || '—'}</span>
                <span><strong>Gender:</strong> ${p.gender || '—'}</span>
                <span><strong>Nationality:</strong> ${p.nationality || '—'}</span>
                <span><strong>Vulnerability:</strong> ${p.vulnerability_type || '—'}</span>
            </div>
            <div style="margin-top:10px; font-size:13px; border-top:1px solid #ddd; padding-top:10px; word-wrap:break-word; overflow-wrap:break-word; white-space:pre-wrap; word-break:break-word; max-width:100%;">
                <strong>Observations/Needs:</strong> ${p.needs || 'No extra info provided.'}
            </div>
        `;
        container.appendChild(card);
    });
}

// ── renderMap ─────────────────────────────────────────────────────────────────

function renderMap(positions, iconFunc) {
    const section = document.getElementById('section-map');
    if (!section || !positions || positions.length === 0) return;
    section.style.display = 'block';

    let mapDiv = document.getElementById('static-map-container');
    if (mapDiv) mapDiv.innerHTML = ''; else {
        mapDiv = document.createElement('div');
        mapDiv.id = 'static-map-container';
        mapDiv.style.height = '400px';
        mapDiv.style.borderRadius = '8px';
        section.appendChild(mapDiv);
    }

    const bounds = [[-90, -180], [90, 180]];
    const map = L.map('static-map-container', {
        maxBounds: bounds,
        maxBoundsViscosity: 1.0,
        minZoom: 2
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { noWrap: true }).addTo(map);

    const mapBounds = [];
    positions.forEach(pos => {
        const coords = [parseFloat(pos.latitude), parseFloat(pos.longitude)];
        L.marker(coords, { icon: iconFunc(pos.category) })
            .addTo(map)
            .bindPopup(`<b>${pos.category}</b><br>${pos.description || ''}<br>${pos.location_name || ''}`);
        mapBounds.push(coords);
    });

    if (mapBounds.length > 1) {
        L.polyline(mapBounds, { color: '#c1121f', weight: 3, dashArray: '5, 10' }).addTo(map);
        map.fitBounds(mapBounds, { padding: [30, 30] });
    } else if (mapBounds.length === 1) {
        map.setView(mapBounds[0], 15);
    }
}

// ── renderPhotos ──────────────────────────────────────────────────────────────
// FIX: photo_file is always photos[0] — appending it separately caused duplicates.
// Now we only use photo_file as a fallback for legacy records with no photos[].

function renderPhotos(report) {
    const section = document.getElementById('section-photo');
    const gallery = document.getElementById('photo-gallery');
    if (!section || !gallery) return;

    let photos = report.photos || [];
    if (typeof photos === 'string') {
        try { photos = JSON.parse(photos); } catch { photos = []; }
    }

    let allUrls = photos.map(p => p.image || p.url || p).filter(Boolean);

    // Only use photo_file if photos[] is empty (old records saved before the ReportPhoto model)
    if (allUrls.length === 0 && report.photo_file) {
        allUrls = [report.photo_file];
    }

    if (allUrls.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    gallery.innerHTML = '';
    allUrls.forEach(url => {
        const img = document.createElement('img');
        img.src = url;
        img.style.cssText = "width:100%; border-radius:8px; margin-bottom:10px; cursor:pointer;";
        img.onclick = () => window.open(url, '_blank');
        gallery.appendChild(img);
    });
}

// ── renderAudios ──────────────────────────────────────────────────────────────
// FIX: now renders translation block in addition to transcription.
// Also handles audio_url vs url key difference between server and localStorage.

function renderAudios(report) {
    const section = document.getElementById('section-audio');
    const list = document.getElementById('audio-list');
    if (!section || !list) return;

    let audios = report.audios || [];
    if (typeof audios === 'string') {
        try { audios = JSON.parse(audios); } catch { audios = []; }
    }

    // Fall back to legacy single audio_file field for old records
    const items = audios.length > 0
        ? audios
        : (report.audio_file
            ? [{ audio_url: report.audio_file, transcription: report.transcription, translation: report.translation }]
            : []);

    if (items.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = '';
    items.forEach((a, idx) => {
        // Server returns audio_url; localStorage uses url — handle both
        const audioUrl = a.audio_url || a.url || a.audio_file || '';
        const div = document.createElement('div');
        div.style.cssText = "margin-bottom:20px; background:#f9f9f9; border-radius:10px; padding:14px; border-left:4px solid #c1121f;";
        div.innerHTML = `
            <p style="margin:0 0 8px 0; font-weight:600; font-size:13px; color:#c1121f;">
                Audio ${idx + 1}${a.title && a.title !== `Audio ${idx + 1}` ? ' — ' + a.title : ''}
            </p>
            ${audioUrl
                ? `<audio controls src="${audioUrl}" style="width:100%; margin-bottom:8px;"></audio>`
                : ''}
            ${a.transcription
                ? `<div style="background:#eee; padding:10px; border-radius:5px; margin-top:6px; font-size:13px; font-style:italic; border-left:3px solid #888;">
                       <strong style="font-style:normal;">Transcription:</strong><br>"${a.transcription}"
                   </div>`
                : ''}
            ${a.translation
                ? `<div style="background:#e8f0fe; padding:10px; border-radius:5px; margin-top:6px; font-size:13px; border-left:3px solid #4a90d9;">
                       <strong>Translation:</strong><br>${a.translation}
                   </div>`
                : ''}
        `;
        list.appendChild(div);
    });
}

// ── setupButtons ──────────────────────────────────────────────────────────────

function setupButtons(report, token, API_BASE_URL, role, allMembers) {
    const btnEdit   = document.getElementById('btnEdit');
    const btnSubmit = document.getElementById('btnSubmit');
    const btnRemove = document.getElementById('btnRemove');

    const isAdmin  = role === 'admin';
    const isAnalyst = role === 'analyst';
    const isStaff  = ['admin', 'analyst', 'coordinator'].includes(role);

    const urlParams = new URLSearchParams(window.location.search);
    const isAlreadySubmitted = report.is_submitted === true;
    const isFromDatabase = urlParams.get('source') === 'submitted';

    if (isFromDatabase || isAlreadySubmitted) {
        if (btnSubmit) btnSubmit.style.display = 'none';
        if (btnEdit)   btnEdit.style.display   = isAdmin ? '' : 'none';
        if (btnRemove) btnRemove.style.display  = isAdmin ? '' : 'none';
    } else {
        if (isAnalyst) {
            if (btnEdit)   btnEdit.style.display   = 'none';
            if (btnSubmit) btnSubmit.style.display  = 'none';
        }
    }

    if (btnEdit) {
        btnEdit.onclick = () => {
            const borrador = normalizeReportForEditing(report, allMembers);
            localStorage.setItem('reporteBorrador', JSON.stringify(borrador));
            localStorage.setItem('modoEdicion', 'true');
            window.location.href = 'new-report.html';
        };
    }

    if (btnSubmit) {
        btnSubmit.onclick = async () => {
            if (confirm("Submit entire group report to the database?")) {
                try {
                    const promises = allMembers.map(m =>
                        fetch(`${API_BASE_URL}/api/my-reports/${m.id}/`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                            body: JSON.stringify({ is_submitted: true })
                        })
                    );
                    await Promise.all(promises);
                    alert("Group submitted successfully!");
                    window.location.href = 'home.html';
                } catch (err) {
                    console.error(err);
                    alert("Error during submission.");
                }
            }
        };
    }

    if (btnRemove) {
        btnRemove.onclick = async () => {
            if (confirm("Delete this specific member's report?")) {
                const folder = isStaff ? 'reports' : 'my-reports';
                const res = await fetch(`${API_BASE_URL}/api/${folder}/${report.id}/`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) window.location.href = 'database.html';
            }
        };
    }
}

// ── normalizeReportForEditing ─────────────────────────────────────────────────

function normalizeReportForEditing(report, allMembers) {
    const borrador = { ...report };

    let photos = [];
    if (Array.isArray(report.photos) && report.photos.length > 0) {
        photos = report.photos.map(p => ({
            image:     p.image || p.url || p,
            title:     p.title || 'Field Photo',
            timestamp: p.timestamp || new Date().toISOString()
        }));
    } else if (report.photo_file) {
        photos = [{ image: report.photo_file, title: 'Field Photo', timestamp: new Date().toISOString() }];
    }
    // camera.js reads 'photo'; buildPayload reads 'photos' with .length fallback to 'photo'
    borrador.photo  = photos;
    borrador.photos = [];   // keep empty so buildPayload falls through to borrador.photo

    let audios = [];
    if (Array.isArray(report.audios) && report.audios.length > 0) {
        audios = report.audios.map((a, i) => ({
            url:           a.audio_url || a.url || a.audio_file,
            transcription: a.transcription || '',
            translation:   a.translation   || '',
            title:         a.title         || `Audio ${i + 1}`,
            timestamp:     a.timestamp     || new Date().toISOString()
        }));
    } else if (report.audio_file) {
        audios = [{
            url:           report.audio_file,
            transcription: report.transcription || '',
            translation:   report.translation   || '',
            title:         'Audio 1',
            timestamp:     new Date().toISOString()
        }];
    }
    borrador.audios = audios;

    const rawPositions = typeof report.positions === 'string'
        ? JSON.parse(report.positions || '[]')
        : (Array.isArray(report.positions) ? report.positions : []);

    borrador.positions = rawPositions.map(p => ({
        lat:         parseFloat(p.lat      ?? p.latitude  ?? 0),
        lng:         parseFloat(p.lng      ?? p.lon ?? p.longitude ?? 0),
        category:    p.category    || 'nothing',
        description: p.description || '',
        passed_at:   p.passed_at   || null
    }));

    if (allMembers.length > 1) {
        borrador.people_count = allMembers.length;
        borrador.personas = allMembers.map(m => ({
            name:               m.name               || '',
            years:              String(m.age          || ''),
            gender:             m.gender              || '',
            nationality:        m.nationality         || '',
            description:        m.needs              || '',
            vulnerability_type: m.vulnerability_type  || '',
            legal_situation:    m.legal_situation      || ''
        }));
        borrador.currentPersonIndex = 0;
    } else {
        borrador.years       = String(report.age || '');
        borrador.description = report.needs || '';
    }

    return borrador;
}