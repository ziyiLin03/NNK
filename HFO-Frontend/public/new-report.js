document.addEventListener('DOMContentLoaded', () => {
    const getToken = () => localStorage.getItem('access_token');
    const BASE_URL = `${API_BASE_URL}`;
    const token = getToken();
    const role = localStorage.getItem('user_role');
    if (!token) {
        window.location.href = './index.html';
        alert("Access denied. Please log in with appropriate credentials.");
        return;
    }
    if (role === 'analyst') {
        window.location.href = './home.html';
        alert("Access denied. Please log in with the appropriate role.");
        return;
    }

    const esEdicion = localStorage.getItem('modoEdicion') === 'true';

    const btnSave = document.getElementById('btnSave');
    if (esEdicion && btnSave) btnSave.style.display = 'none';

    const borradorString = localStorage.getItem('reporteBorrador');
    const titleElement = document.getElementById('title-new-edit');
    if (titleElement) {
        titleElement.textContent = esEdicion ? "Edit Testimonial" : "New Testimonial";
    }

    let borradorObj = JSON.parse(borradorString || '{}');
    let reportIdParaEditar = null;

    // ── Edit mode pre-fill ────────────────────────────────────────────────────
    if (esEdicion && borradorObj.id) {
        reportIdParaEditar = borradorObj.id;
        console.log("Edit mode for report ID:", reportIdParaEditar);

        const inputName        = document.getElementById('inputName');
        const inputAge         = document.getElementById('inputAge');
        const selectGender     = document.getElementById('selectGender');
        const selectNationality= document.getElementById('selectNationality');
        const inputNeeds       = document.getElementById('inputNeeds');

        if (inputName)         inputName.value         = borradorObj.name         || '';
        if (inputAge)          inputAge.value          = borradorObj.age          || '';
        if (selectGender)      selectGender.value      = borradorObj.gender       || '';
        if (selectNationality) selectNationality.value = borradorObj.nationality  || '';
        if (inputNeeds)        inputNeeds.value        = borradorObj.needs        || '';

        if (esEdicion && borradorObj) {
            const photoCount    = (borradorObj.photo    || []).length;
            const audioCount    = (borradorObj.audios   || []).length;
            const positionCount = (borradorObj.positions|| []).length;

            const btnCamera = document.getElementById('btnCameraReport');
            const btnAudio  = document.getElementById('btnAudioReport');
            const btnMap    = document.getElementById('btnMapReport');

            if (btnCamera && photoCount > 0) {
                const desc = btnCamera.querySelector('.description');
                if (desc) desc.textContent = `${photoCount} photo(s) saved — tap to edit`;
                const card = btnCamera.querySelector('.application');
                if (card) { card.style.borderColor = '#28a745'; card.style.backgroundColor = '#f4fdf6'; }
            }
            if (btnAudio && audioCount > 0) {
                const desc = btnAudio.querySelector('.description');
                if (desc) desc.textContent = `${audioCount} clip(s) saved — tap to edit`;
                const card = btnAudio.querySelector('.application');
                if (card) { card.style.borderColor = '#28a745'; card.style.backgroundColor = '#f4fdf6'; }
            }
            if (btnMap && positionCount > 0) {
                const desc = btnMap.querySelector('.description');
                if (desc) desc.textContent = `${positionCount} point(s) saved — tap to edit`;
                const card = btnMap.querySelector('.application');
                if (card) { card.style.borderColor = '#28a745'; card.style.backgroundColor = '#f4fdf6'; }
            }
        }
    }

    const getCurrentUserRole = () => {
        if (!token) return 'user';
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const payload = JSON.parse(window.atob(base64));
            return payload.role || 'user';
        } catch (e) {
            return 'user';
        }
    };

    // ── Cloudinary cleanup ────────────────────────────────────────────────────
    async function cleanupCloudinaryAssets(borrador) {
        const t = getToken();
        if (!t || !borrador) return;

        const deleteRequests = [];

        (borrador.photos || borrador.photo || []).forEach(photo => {
            const url = photo.image || photo;
            if (url && typeof url === 'string') {
                deleteRequests.push(
                    fetch(`${BASE_URL}/api/delete-photo/`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                        body: JSON.stringify({ url })
                    }).catch(err => console.warn("Failed to delete photo:", url, err))
                );
            }
        });

        (borrador.audios || []).forEach(audio => {
            const url = audio.url || audio;
            if (url && typeof url === 'string') {
                deleteRequests.push(
                    fetch(`${BASE_URL}/api/delete-audio/`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                        body: JSON.stringify({ url })
                    }).catch(err => console.warn("Failed to delete audio:", url, err))
                );
            }
        });

        if (borrador.photo_file) {
            deleteRequests.push(
                fetch(`${BASE_URL}/api/delete-photo/`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                    body: JSON.stringify({ url: borrador.photo_file })
                }).catch(err => console.warn("Failed to delete photo_file:", err))
            );
        }

        if (borrador.audio_file) {
            deleteRequests.push(
                fetch(`${BASE_URL}/api/delete-audio/`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                    body: JSON.stringify({ url: borrador.audio_file })
                }).catch(err => console.warn("Failed to delete audio_file:", err))
            );
        }

        if (deleteRequests.length > 0) {
            await Promise.allSettled(deleteRequests);
            console.log(`Cleanup complete: ${deleteRequests.length} asset(s) deleted.`);
        }
    }

    // ── Build a single report payload from a persona + shared media ───────────
    function buildPayload(personaData, sharedMedia, isSubmit) {
        console.group('🔧 buildPayload()');

        // ── DEBUG: Show exactly what came in ─────────────────────────────────
        console.log('personaData keys:', Object.keys(personaData));
        console.log('sharedMedia keys:', Object.keys(sharedMedia));
        console.log('sharedMedia.photo  (raw):', sharedMedia.photo);
        console.log('sharedMedia.photos (raw):', sharedMedia.photos);
        console.log('sharedMedia.audios (raw):', sharedMedia.audios);
        console.log('sharedMedia.positions (raw):', sharedMedia.positions);

        const payload = { ...personaData };

        // Resolve age
        if (payload.years) {
            payload.age = parseInt(payload.years, 10);
            delete payload.years;
        }

        // Resolve needs/description
        if (payload.description) {
            payload.needs = payload.description;
            delete payload.description;
        }
        if (!payload.needs) payload.needs = 'No description provided.';

        // Interview type & group meta
        payload.interviewType = sharedMedia.interviewType || '';
        payload.people_count  = sharedMedia.people_count  || 1;

        if (sharedMedia.group_id) {
            payload.group_id = sharedMedia.group_id;
        }

        // ── Audios ────────────────────────────────────────────────────────────
        // Use .length check — [] is truthy so plain || short-circuits on it.
        const audios = (sharedMedia.audios?.length ? sharedMedia.audios : null) || [];
        console.log(`📻 audios resolved: ${audios.length} item(s)`, audios);
        if (audios.length > 0) {
            payload.audio_file    = audios[0].url || audios[0].audio_url;
            payload.transcription = audios[0].transcription || '';
            payload.translation   = audios[0].translation   || '';
            payload.audios = JSON.stringify(audios.map((a, i) => ({
                url:           a.url || a.audio_url || a.audio_file,
                transcription: a.transcription || '',
                translation:   a.translation   || '',
                title:         a.title         || `Audio ${i + 1}`
            })));
        }

        // ── Photos ────────────────────────────────────────────────────────────
        // camera.js saves to borrador.photo (not borrador.photos).
        // Must check both keys or photos are silently dropped.
        // borrador.photos is [] (empty, truthy) while borrador.photo has the items.
        // Must use .length check so the empty array doesn't block the fallback.
        const photos = (sharedMedia.photos?.length ? sharedMedia.photos : null)
                    || (sharedMedia.photo?.length  ? sharedMedia.photo  : null)
                    || [];
        console.log(`📷 photos resolved: ${photos.length} item(s)`, photos);

        if (photos.length > 0) {
            payload.photo_file = photos[0].image || photos[0];
            payload.photos = JSON.stringify(photos.map(p => ({
                image:     p.image || p,
                title:     p.title || 'Field Photo',
                timestamp: p.timestamp || new Date().toISOString()
            })));
            console.log('✅ photo_file set to:', payload.photo_file);
            console.log('✅ photos JSON set to:', payload.photos);
        } else {
            console.warn('⚠️  No photos found in sharedMedia. borrador.photo was:', sharedMedia.photo, '| borrador.photos was:', sharedMedia.photos);
        }

        // ── Positions ─────────────────────────────────────────────────────────
        const positions = sharedMedia.positions || [];
        console.log(`📍 positions resolved: ${positions.length} item(s)`, positions);
        if (positions.length > 0) {
            payload.positions = JSON.stringify(positions);
        }

        // submission flag
        payload.is_submitted = isSubmit;

        // Strip empty / null fields
        const keysBeforeStrip = Object.keys(payload);
        Object.keys(payload).forEach(key => {
            if (
                payload[key] === '' ||
                payload[key] === null ||
                payload[key] === undefined ||
                (Array.isArray(payload[key]) && payload[key].length === 0)
            ) {
                delete payload[key];
            }
        });
        const droppedKeys = keysBeforeStrip.filter(k => !(k in payload));
        if (droppedKeys.length > 0) {
            console.log('🗑️  Keys stripped (empty/null):', droppedKeys);
        }

        // Remove server-managed fields
        delete payload.id;
        delete payload.submitted_by;
        delete payload.timestamp;
        delete payload.author_name;

        console.log('📦 Final payload:', JSON.parse(JSON.stringify(payload)));
        console.groupEnd();

        return payload;
    }

    // ── Send one report payload ───────────────────────────────────────────────
    async function sendReport(payload, isEdit, reportId, userRole) {
        const t = getToken();
        let url    = `${BASE_URL}/api/reports/create/`;
        let method = 'POST';

        if (isEdit && reportId) {
            url    = userRole === 'admin'
                ? `${BASE_URL}/api/reports/${reportId}/`
                : `${BASE_URL}/api/my-reports/${reportId}/`;
            method = 'PATCH';
        }

        console.group(`📡 sendReport() — ${method} ${url}`);
        console.log('Payload being sent:', JSON.parse(JSON.stringify(payload)));
        console.log('photo_file in payload?', 'photo_file' in payload, '→', payload.photo_file);
        console.log('photos in payload?',     'photos'     in payload, '→', payload.photos);

        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type':  'application/json',
                'Authorization': `Bearer ${t}`
            },
            body: JSON.stringify(payload)
        });

        const responseText = await response.text();
        console.log(`Server response status: ${response.status}`);
        console.log('Server response body:', responseText);

        if (!response.ok) {
            console.error('❌ Server rejected the request:', responseText);
            console.groupEnd();
            let err = {};
            try { err = JSON.parse(responseText); } catch {}
            throw new Error(JSON.stringify(err));
        }

        let data = {};
        try { data = JSON.parse(responseText); } catch {}
        console.log('✅ Server accepted. Returned photo_file:', data.photo_file);
        console.log('✅ Server accepted. Returned photos:', data.photos);
        console.groupEnd();

        return data;
    }

    // ── Main save / submit handler ────────────────────────────────────────────
    const btnSubmit = document.getElementById('btnSubmit');

    async function procesarReporte(esSubmit, botonPulsado) {
        if (botonPulsado.disabled) return;

        if (esSubmit) {
            const confirmar = confirm("Are you sure you want to submit this report? You won't be able to edit it later.");
            if (!confirmar) return;
        }

        const textoOriginal = botonPulsado.innerHTML;
        botonPulsado.innerHTML = esSubmit
            ? '<i class="fa-solid fa-paper-plane fa-bounce"></i> Submitting...'
            : '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
        botonPulsado.disabled = true;

        try {
            const currentBorrador = JSON.parse(localStorage.getItem('reporteBorrador') || '{}');

            // ── DEBUG: Full borrador state at submission time ─────────────────
            console.group('🗂️  procesarReporte() — borrador at submission time');
            console.log('Full borrador:', JSON.parse(JSON.stringify(currentBorrador)));
            console.log('borrador.photo  (array from camera.js):', currentBorrador.photo);
            console.log('borrador.photos (may be undefined):', currentBorrador.photos);
            console.log('borrador.audios:', currentBorrador.audios);
            console.log('borrador.positions:', currentBorrador.positions);
            console.log('people_count:', currentBorrador.people_count);
            console.log('personas:', currentBorrador.personas);
            console.groupEnd();

            if (!currentBorrador || Object.keys(currentBorrador).length === 0) {
                alert("Empty report, please fill the required information");
                botonPulsado.innerHTML = textoOriginal;
                botonPulsado.disabled = false;
                return;
            }

            const t = getToken();
            if (!t) {
                alert("Your session has expired. Please log in again.");
                window.location.href = "index.html";
                return;
            }

            const currentUserRole = getCurrentUserRole();
            const isGroup = (currentBorrador.people_count || 1) > 1;
            const personas = currentBorrador.personas || [];

            if (esEdicion) {
                // ── Edit mode: single PATCH ───────────────────────────────────
                console.log('MODE: Edit (PATCH)');
                if (esSubmit) currentBorrador.is_submitted = true;
                const payload = buildPayload(currentBorrador, currentBorrador, esSubmit);
                await sendReport(payload, true, reportIdParaEditar, currentUserRole);

            } else if (isGroup && personas.length > 0) {
                // ── Group mode: N POST requests ───────────────────────────────
                console.log(`MODE: Group (${personas.length} personas)`);
                const sharedGroupId = crypto.randomUUID();
                const results = [];
                const errors  = [];

                for (let i = 0; i < personas.length; i++) {
                    try {
                        console.log(`--- Group member ${i + 1}/${personas.length} ---`);
                        const payload = buildPayload({ ...personas[i] }, currentBorrador, esSubmit);
                        payload.group_id = sharedGroupId;
                        await sendReport(payload, false, null, currentUserRole);
                        results.push(i);
                    } catch (err) {
                        console.error(`Failed report for persona ${i}:`, err);
                        errors.push({ index: i, name: personas[i].name, error: err.message });
                    }
                }

                if (errors.length > 0) {
                    const names = errors.map(e => `• ${e.name}`).join('\n');
                    alert(`${results.length} report(s) saved. The following failed:\n${names}\n\nCheck console for details.`);
                    botonPulsado.innerHTML = textoOriginal;
                    botonPulsado.disabled = false;
                    return;
                }

            } else {
                // ── Single person mode ────────────────────────────────────────
                console.log('MODE: Single person (POST)');
                const payload = buildPayload({ ...currentBorrador }, currentBorrador, esSubmit);
                await sendReport(payload, false, null, currentUserRole);
            }

            // All done
            localStorage.removeItem('reporteBorrador');
            localStorage.removeItem('modoEdicion');
            window.location.href = "home.html";

        } catch (error) {
            console.error("Failed to send:", error);
            alert("Connection error. Check console.");
            botonPulsado.innerHTML = textoOriginal;
            botonPulsado.disabled = false;
        }
    }

    if (btnSave)   btnSave.addEventListener('click',   e => { e.preventDefault(); procesarReporte(false, btnSave); });
    if (btnSubmit) btnSubmit.addEventListener('click', e => { e.preventDefault(); procesarReporte(true,  btnSubmit); });

    // ── Cancel / Quit ─────────────────────────────────────────────────────────
    const btnQuit = document.getElementById('btnQuitReport');
    if (btnQuit) {
        btnQuit.addEventListener('click', async (e) => {
            e.preventDefault();
            const confirmar = confirm("Sure you want to quit? All photos and audios from this report will be deleted.");
            if (!confirmar) return;

            const textoOriginal = btnQuit.innerHTML;
            btnQuit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Cleaning up...';
            btnQuit.disabled = true;

            try {
                const borrador = JSON.parse(localStorage.getItem('reporteBorrador') || '{}');
                await cleanupCloudinaryAssets(borrador);
            } catch (err) {
                console.error("Cleanup error:", err);
            }

            localStorage.removeItem('reporteBorrador');
            localStorage.removeItem('modoEdicion');
            window.location.href = "home.html";
        });
    }

    // ── Control de la Tarjeta Manual (Añadir vs Editar) ───────────────
    const btnManual = document.getElementById('btnManualReport');

    if (btnManual) {
        const titleElement = btnManual.querySelector('.application-info');
        const descElement  = btnManual.querySelector('.description');
        const iconElement  = btnManual.querySelector('.application-icon');

        const personas  = borradorObj.personas   || [];
        const maxPeople = borradorObj.people_count || 1;

        const individualCompletado = !borradorObj.people_count && (borradorObj.name || borradorObj.description);
        const grupoCompletado      = personas.length >= maxPeople;

        if (grupoCompletado || individualCompletado) {
            if (titleElement) titleElement.textContent = "EDIT MANUAL";
            if (descElement)  descElement.textContent  = "Review saved information";
            if (iconElement)  iconElement.className    = "fa-solid fa-pen-to-square application-icon";

            const cardDiv = btnManual.querySelector('.application');
            if (cardDiv) {
                cardDiv.style.borderColor      = "#28a745";
                cardDiv.style.backgroundColor  = "#f4fdf6";
            }

            btnManual.addEventListener('click', (e) => {
                e.preventDefault();
                borradorObj.currentPersonIndex = 0;
                localStorage.setItem('reporteBorrador', JSON.stringify(borradorObj));
                window.location.href = 'manual-report.html';
            });

        } else {
            const nextPerson = personas.length + 1;

            if (titleElement) titleElement.textContent = "MANUAL";
            if (descElement) {
                descElement.textContent = maxPeople > 1
                    ? `Add Member ${nextPerson} of ${maxPeople}`
                    : "Help us to understand the situation";
            }

            btnManual.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = 'manual-report.html';
            });
        }
    }
});