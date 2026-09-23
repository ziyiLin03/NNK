// ==========================================
// --- ESTADO GLOBAL ---
// ==========================================
const STATE = {
    allReports: [],
    filteredReports: [],
    currentPage: 1,
    itemsPerPage: 10,
    activeServerFilters: {},
    activeCols: ['groupSize', 'map', 'audio', 'manual', 'photo'],
    availableCols: ['userId'],
    selectedForSwap: null,
    selectedReportIds: new Set()
};

// ==========================================
// --- CONFIGURACIÓN DINÁMICA DE COLUMNAS ---
// ==========================================
const COLUMNS_DEF = {
    'custom_id':   { title: 'Report ID',    render: r => `<strong>${r.custom_id || `ID-${r.id}`}</strong>` },
    'timestamp':   { title: 'Date',         render: r => {
        if (!r.timestamp) return "Unknown Date";
        const d = new Date(r.timestamp);
        return `${d.toLocaleDateString()} @ ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    }},
    'groupSize':   { title: 'NumPeople',    render: r => r.groupSize || 1 },
    'map':         { title: 'Map',          render: r => { const m = r.methods || {}; return `<span style="color:${m.map ? 'green' : 'red'};"><i class="fa-solid ${m.map ? 'fa-check' : 'fa-xmark'}"></i></span>`; }},
    'audio':       { title: 'Audio',        render: r => { const m = r.methods || {}; return `<span style="color:${m.audio ? 'green' : 'red'};"><i class="fa-solid ${m.audio ? 'fa-check' : 'fa-xmark'}"></i></span>`; }},
    'manual':      { title: 'Manual',       render: r => { const m = r.methods || {}; return `<span style="color:${m.manual ? 'green' : 'red'};"><i class="fa-solid ${m.manual ? 'fa-check' : 'fa-xmark'}"></i></span>`; }},
    'photo':       { title: 'Photo',        render: r => { const m = r.methods || {}; return `<span style="color:${m.photo ? 'green' : 'red'};"><i class="fa-solid ${m.photo ? 'fa-check' : 'fa-xmark'}"></i></span>`; }},
    'userId':      { title: 'Volunteer ID', render: r => r.userId || 'Unknown' }
};

// Categorías para filtros avanzados del backend
const CATEGORY_FILTERS = [
    'current', 'mafia', 'police', 'pushback', 'violence',
    'robbery', 'extortion', 'medical', 'refuge', 'food', 'safe'
].map(id => ({ id, param: `${id}_count` }));

// ==========================================
// --- ELEMENTOS DEL DOM ---
// ==========================================
const DOM = {
    reportsBody:      document.getElementById('reports-body'),
    hitsCounter:      document.getElementById('hits-counter'),
    tableHeadersRow:  document.getElementById('table-headers'),
    activeColumns:    document.getElementById('active-columns'),
    availableColumns: document.getElementById('available-columns'),

    // Controles básicos
    search:    document.getElementById('search-bar'),
    startDate: document.getElementById('start-date'),
    endDate:   document.getElementById('end-date'),
    refreshBtn: document.getElementById('refresh'),
    deleteSelectedBtn: document.getElementById('delete-selected-btn'),
    selectedCount: document.getElementById('selected-count'),
    prevBtn:   document.getElementById('prev-btn'),
    nextBtn:   document.getElementById('next-btn'),
    pageInfo:  document.getElementById('page-info'),

    // Filtros avanzados
    inputs:    ['volunteer', 'interview-type', 'timezone', 'placement', 'country', 'needs', 'min-people', 'max-people', 'days', 'fecha-desde', 'fecha-hasta', 'age', 'health', 'points-count', 'gender', 'sort']
                .map(id => document.getElementById(`filter-${id}`)),
    checkboxes: ['has-map', 'has-audio', 'has-photo', 'has-manual', 'has-point-description', 'has-point-date']
                .map(id => document.getElementById(`filter-${id}`)),
    operators:  ['age', 'health', 'points-count']
                .map(id => document.getElementById(`filter-${id}-operator`))
};

// ==========================================
// --- INICIALIZACIÓN ---
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('user_role') === 'volunteer') {
        window.location.href = "./home.html";
        return;
    }
    initDelegatedListeners();
    initModalListeners();
    initGlobalListeners();
    fetchReports();
});

// ==========================================
// --- FETCH PRINCIPAL ---
// ==========================================
async function fetchReports(filters = {}) {
    try {
        STATE.activeServerFilters = filters;
        const token = localStorage.getItem('access_token');
        if (!token) throw new Error('No_Token');

        // Construir Query String (ignora nulls, undefined y strings vacíos)
        const query = new URLSearchParams(
            Object.entries(filters).filter(([_, v]) => v != null && v !== '')
        ).toString();

        const url = `${API_BASE_URL}/api/reports/${query ? `?${query}` : ''}`;
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) throw new Error('No_Token');
            throw new Error(`Error de red: ${response.status}`);
        }

        const rawReports = await response.json();

        // --- Solo reportes enviados/finalizados ---
        const submittedReports = rawReports.filter(r => r.is_submitted === true);

        // --- AGRUPACIÓN por group_id ---
        const groupedMap = {};

        submittedReports.forEach(r => {
            const key = (r.group_id && r.group_id !== "null" && r.group_id !== "")
                ? r.group_id
                : `single_${r.id}`;

            if (!groupedMap[key]) {
                // Primera persona del grupo: inicializamos la entrada
                groupedMap[key] = {
                    id:          r.id,
                    custom_id:   `NNK-${r.id}`,
                    timestamp:   r.timestamp,
                    groupSize:   1,
                    nationality: r.nationality || 'Unknown',
                    name:        r.name || 'Anonymous',
                    userId:      r.submitted_by || 'Unknown',
                    methods: {
                        audio:  !!r.audio_file,
                        photo:  !!(r.photo_file || (r.photos && r.photos.length > 0)),
                        map:    Array.isArray(r.positions) && r.positions.length > 0,
                        manual: !!r.needs
                    }
                };
            } else {
                // Persona adicional: sumamos al grupo y combinamos métodos (OR)
                groupedMap[key].groupSize += 1;
                if (r.audio_file)                                          groupedMap[key].methods.audio  = true;
                if (r.photo_file || (r.photos && r.photos.length > 0))    groupedMap[key].methods.photo  = true;
                if (Array.isArray(r.positions) && r.positions.length > 0) groupedMap[key].methods.map    = true;
                if (r.needs)                                               groupedMap[key].methods.manual = true;
            }
        });

        // Convertir mapa a array y ordenar por fecha descendente
        STATE.allReports = Object.values(groupedMap)
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        applyFrontendFilters();

    } catch (error) {
        if (error.message === 'No_Token') {
            localStorage.removeItem('access_token');
            window.location.href = "/index.html";
        } else {
            console.error("Error cargando base de datos:", error);
            DOM.reportsBody.innerHTML = `<tr><td colspan="10" style="color:red;padding:30px;text-align:center;">Error loading reports.</td></tr>`;
        }
    }
}

// ==========================================
// --- CONSTRUIR PARÁMETROS BACKEND ---
// ==========================================
function getAdvancedFilterParams() {
    const params = {};
    const val       = id => document.getElementById(id)?.value.trim();
    const isChecked = id => document.getElementById(id)?.checked;

    const mappings = {
        volunteer:            val('filter-volunteer'),
        interview_type:       val('filter-interview-type'),
        timezone:             val('filter-timezone'),
        placement:            val('filter-placement'),
        country:              val('filter-country'),
        needs:                val('filter-needs'),
        gender:               val('filter-gender'),
        min_people:           val('filter-min-people'),
        max_people:           val('filter-max-people'),
        has_map:              isChecked('filter-has-map')              || null,
        has_audio:            isChecked('filter-has-audio')            || null,
        has_photo:            isChecked('filter-has-photo')            || null,
        has_manual:           isChecked('filter-has-manual')           || null,
        has_point_description:isChecked('filter-has-point-description')|| null,
        has_point_date:       isChecked('filter-has-point-date')       || null,
    };
    Object.assign(params, mappings);

    // Fechas avanzadas
    const days = val('filter-days');
if (days) {
    params.days = days;
} else {
    const desdeRaw = val('filter-fecha-desde');
    const hastaRaw = val('filter-fecha-hasta');
    
    // Convertimos la hora local del navegador a string UTC/ISO nativo antes de enviarlo
    if (desdeRaw) params.fecha_desde = new Date(desdeRaw).toISOString();
    if (hastaRaw) params.fecha_hasta = new Date(hastaRaw).toISOString();
}

    // Campos con operadores
    ['age', 'health', 'points-count'].forEach(prefix => {
        const value = val(`filter-${prefix}`);
        if (value) {
            params[prefix.replace('-', '_')]                = value;
            params[`${prefix.replace('-', '_')}_operator`] = val(`filter-${prefix}-operator`) || 'is';
        }
    });

    // Categorías (current, mafia, police, etc.)
    CATEGORY_FILTERS.forEach(({ id, param }) => {
        const value = val(`filter-${id}-count`);
        if (value) {
            params[param]               = value;
            params[`${param}_operator`] = val(`filter-${id}-operator`) || 'more_than';
        }
    });

    return params;
}

function clearAdvancedFilterForm() {
    DOM.inputs   .forEach(el => el && (el.value   = ''));
    DOM.checkboxes.forEach(el => el && (el.checked = false));
    DOM.operators .forEach(el => el && (el.value   = el.options[0].value));

    CATEGORY_FILTERS.forEach(({ id }) => {
        const valEl = document.getElementById(`filter-${id}-count`);
        const opEl  = document.getElementById(`filter-${id}-operator`);
        if (valEl) valEl.value = '';
        if (opEl)  opEl.value  = opEl.options[0].value;
    });
}

// ==========================================
// --- FILTRADO FRONTEND ---
// ==========================================
// ==========================================
// --- FILTRADO FRONTEND (CORREGIDO) ---
// ==========================================
function applyFrontendFilters() {
    const term = DOM.search?.value.toLowerCase().trim() || "";
    
    const startVal = DOM.startDate?.value;
    const endVal   = DOM.endDate?.value;

    // Si tiene una 'T' ya incluye hora (datetime-local), lo parseamos directo como local.
    // Si no tiene 'T', es un input de solo fecha; le agregamos el inicio/fin del día local.
    const startMs = startVal ? new Date(startVal.includes('T') ? startVal : `${startVal}T00:00:00`).getTime() : null;
    const endMs   = endVal   ? new Date(endVal.includes('T')   ? endVal   : `${endVal}T23:59:59.999`).getTime() : null;

    STATE.filteredReports = STATE.allReports.filter(r => {
        // Búsqueda de texto
        const matchSearch = !term ||
            r.custom_id?.toLowerCase().includes(term) ||
            r.userId?.toString().toLowerCase().includes(term) ||
            r.name?.toLowerCase().includes(term);
        if (!matchSearch) return false;

        // Filtro "last X days"
        const lastDays = document.getElementById('filter-last-days')?.value;
        if (lastDays && r.timestamp) {
            const diffDays = (Date.now() - new Date(r.timestamp)) / (1000 * 60 * 60 * 24);
            if (diffDays > Number(lastDays)) return false;
        }

        // Rango de fechas (Ahora emparejará milisegundo a milisegundo en la misma zona horaria)
        if (r.timestamp) {
            const tMs = new Date(r.timestamp).getTime();
            if (startMs && tMs < startMs) return false;
            if (endMs   && tMs > endMs)   return false;
        } else if (startMs || endMs) {
            return false;
        }

        return true;
    });

    // ... El resto de tu ordenación (sortType) y updateUI() se queda exactamente igual

    const sortType = document.getElementById('filter-sort')?.value || 'newest';
    STATE.filteredReports.sort((a, b) => {
        switch (sortType) {
            case 'oldest':       return new Date(a.timestamp) - new Date(b.timestamp);
            case 'most-people':  return (b.groupSize || 0) - (a.groupSize || 0);
            case 'least-people': return (a.groupSize || 0) - (b.groupSize || 0);
            case 'media-first': {
                const score = r => (r.methods?.audio ? 1 : 0) + (r.methods?.photo ? 1 : 0)
                                 + (r.methods?.map   ? 1 : 0) + (r.methods?.manual ? 1 : 0);
                return score(b) - score(a);
            }
            case 'newest':
            default:             return new Date(b.timestamp) - new Date(a.timestamp);
        }
    });

    STATE.currentPage = 1;
    updateUI();
}

// ==========================================
// --- RENDERIZADO ---
// ==========================================
function updateUI() {
    renderSidebar();
    renderTableHeaders();
    renderTable();
}

function renderSidebar() {
    if (!DOM.activeColumns || !DOM.availableColumns) return;

    const lockedCols = `
        <div class="preview-option-row"><i class="fa-solid fa-lock" style="color:orange;"></i><p style="color: var(--text-dark);">#Reports</p></div>
        <div class="preview-option-row"><i class="fa-solid fa-lock" style="color:orange;"></i><p style="color: var(--text-dark);">#Date</p></div>
    `;

    const activeHtml = STATE.activeCols.map(col => `
        <div class="preview-option-row ${STATE.selectedForSwap === col ? 'selected-swap' : ''}" data-col="${col}" style="cursor:pointer;">
            <i class="fa-regular fa-square-minus btn-remove" style="color:red; pointer-events:none;"></i>
            <p style="color: var(--text-dark); pointer-events:none;">#${COLUMNS_DEF[col].title}</p>
        </div>
    `).join('');

    const isLimit       = STATE.activeCols.length >= 6 && !STATE.selectedForSwap;
    const availableHtml = STATE.availableCols.map(col => `
        <div class="preview-option-row" data-col="${col}" style="cursor:pointer;">
            <i class="fa-regular fa-square-plus btn-add" style="color:${isLimit ? 'gray' : 'rgb(0,164,0)'}; pointer-events:none;"></i>
            <p style="color: var(--text-dark); pointer-events:none;">#${COLUMNS_DEF[col].title}</p>
        </div>
    `).join('');

    DOM.activeColumns.innerHTML    = lockedCols + activeHtml;
    DOM.availableColumns.innerHTML = availableHtml;
}

function renderTableHeaders() {
    if (!DOM.tableHeadersRow) return;
    const visibleReports = getCurrentPageReports();
    const allSelected = visibleReports.length > 0 && visibleReports.every(r => STATE.selectedReportIds.has(r.id));
    const headers = [
        `<th><input type="checkbox" id="select-all-checkbox" ${allSelected ? 'checked' : ''}></th>`,
        `<th>Report ID</th>`,
        `<th>Date</th>`,
        ...STATE.activeCols.map(col => `<th>${COLUMNS_DEF[col].title}</th>`)
    ];
    DOM.tableHeadersRow.innerHTML = headers.join('');
}

function renderTable() {
    const { filteredReports, currentPage, itemsPerPage } = STATE;
    if (DOM.hitsCounter) DOM.hitsCounter.textContent = `${filteredReports.length} hits`;

    if (filteredReports.length === 0) {
        DOM.reportsBody.innerHTML = `<tr><td colspan="${3 + STATE.activeCols.length}" style="color:gray;padding:30px;text-align:center;">No reports found.</td></tr>`;
        updatePagination(0, 0);
        updateSelectionSummary();
        return;
    }

    const totalPages   = Math.ceil(filteredReports.length / itemsPerPage);
    STATE.currentPage  = Math.min(Math.max(currentPage, 1), totalPages);
    const startIndex   = (STATE.currentPage - 1) * itemsPerPage;
    const chunk        = filteredReports.slice(startIndex, startIndex + itemsPerPage);

    DOM.reportsBody.innerHTML = chunk.map(r => {
        const idString = String(r.id);
        return `
        <tr data-id="${idString}" style="cursor:pointer;">
            <td><input type="checkbox" class="report-select-checkbox" data-id="${idString}" ${STATE.selectedReportIds.has(idString) ? 'checked' : ''}></td>
            <td>${COLUMNS_DEF['custom_id'].render(r)}</td>
            <td>${COLUMNS_DEF['timestamp'].render(r)}</td>
            ${STATE.activeCols.map(col => `<td>${COLUMNS_DEF[col].render(r)}</td>`).join('')}
        </tr>
    `;
    }).join('');

    updatePagination(STATE.currentPage, totalPages);
    updateSelectionSummary();
}

function updatePagination(current, total) {
    if (DOM.pageInfo) DOM.pageInfo.textContent = `Page ${current} of ${total}`;
    if (DOM.prevBtn)  DOM.prevBtn.disabled = current <= 1;
    if (DOM.nextBtn)  DOM.nextBtn.disabled = current >= total;
}

function getCurrentPageReports() {
    const startIndex = (STATE.currentPage - 1) * STATE.itemsPerPage;
    return STATE.filteredReports.slice(startIndex, startIndex + STATE.itemsPerPage);
}

function updateSelectionSummary() {
    const count = STATE.selectedReportIds.size;
    if (DOM.selectedCount) DOM.selectedCount.textContent = `${count} selected`;
    if (DOM.deleteSelectedBtn) DOM.deleteSelectedBtn.disabled = count === 0;
}

function normalizeReportId(reportId) {
    return String(reportId);
}

function toggleReportSelection(reportId, checked) {
    const id = normalizeReportId(reportId);
    if (checked) {
        STATE.selectedReportIds.add(id);
    } else {
        STATE.selectedReportIds.delete(id);
    }
    updateUI();
}

function handleSelectAll(checked) {
    getCurrentPageReports().forEach(report => {
        const id = normalizeReportId(report.id);
        if (checked) {
            STATE.selectedReportIds.add(id);
        } else {
            STATE.selectedReportIds.delete(id);
        }
    });
    updateUI();
}

function extractMediaUrls(report) {
    const photoUrls = [];
    const audioUrls = [];

    if (report.photo_file) photoUrls.push(report.photo_file);
    if (Array.isArray(report.photos)) {
        report.photos.forEach(photo => {
            const url = photo?.image || photo?.url || photo;
            if (url) photoUrls.push(url);
        });
    }

    if (report.audio_file) audioUrls.push(report.audio_file);
    if (Array.isArray(report.audios)) {
        report.audios.forEach(audio => {
            const url = audio?.url || audio?.audio_url || audio;
            if (url) audioUrls.push(url);
        });
    }

    return {
        photoUrls: Array.from(new Set(photoUrls.filter(Boolean))),
        audioUrls: Array.from(new Set(audioUrls.filter(Boolean)))
    };
}

async function cleanupMedia(report, token) {
    const { photoUrls, audioUrls } = extractMediaUrls(report);
    const requests = [];
    photoUrls.forEach(url => {
        requests.push(fetch(`${API_BASE_URL}/api/delete-photo/`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ url })
        }).catch(err => console.warn('Failed to delete photo:', url, err)));
    });
    audioUrls.forEach(url => {
        requests.push(fetch(`${API_BASE_URL}/api/delete-audio/`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ url })
        }).catch(err => console.warn('Failed to delete audio:', url, err)));
    });
    await Promise.allSettled(requests);
}

async function fetchGroupMembers(report) {
    if (!report.group_id) return [report];
    try {
        const url = `${API_BASE_URL}/api/reports/group/${report.group_id}/`;
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` } });
        if (!response.ok) return [report];
        const data = await response.json();
        const results = Array.isArray(data) ? data : data.results || [];
        const members = [report, ...results].reduce((acc, item) => {
            if (item && item.id != null && !acc.some(existing => existing.id === item.id)) {
                acc.push(item);
            }
            return acc;
        }, []);
        return members;
    } catch (error) {
        console.warn('Group fetch failed for cleanup:', error);
        return [report];
    }
}

async function deleteSelectedReports() {
    if (STATE.selectedReportIds.size === 0) {
        alert('No reports selected for deletion.');
        return;
    }

    if (!confirm(`Delete ${STATE.selectedReportIds.size} selected report(s)? This will remove their media and report records.`)) {
        return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
        localStorage.removeItem('access_token');
        window.location.href = '/index.html';
        return;
    }

    const reportIds = Array.from(STATE.selectedReportIds);
    const results = await Promise.allSettled(reportIds.map(async id => {
        const detailResponse = await fetch(`${API_BASE_URL}/api/reports/${id}/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!detailResponse.ok) {
            throw new Error(`Failed to load report ${id}`);
        }
        const reportDetail = await detailResponse.json();
        const members = await fetchGroupMembers(reportDetail);
        const cleanupPromises = members.map(member => cleanupMedia(member, token));
        await Promise.allSettled(cleanupPromises);
        const deletePromises = members.map(member => fetch(`${API_BASE_URL}/api/reports/${member.id}/`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        }).then(res => {
            if (!res.ok) throw new Error(`Delete failed for report ${member.id}`);
        }));
        await Promise.all(deletePromises);
    }));

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
        console.warn('Some deletions failed:', failed);
        alert(`${failed.length} report(s) could not be deleted. Check the console for details.`);
    } else {
        alert('Selected reports were deleted successfully.');
    }

    STATE.selectedReportIds.clear();
    fetchReports(STATE.activeServerFilters);
}

// ==========================================
// --- EVENT LISTENERS ---
// ==========================================
function initDelegatedListeners() {
    // Click en fila → detalle del reporte
    DOM.reportsBody?.addEventListener('click', e => {
        if (e.target.closest('.report-select-checkbox')) return;
        const tr = e.target.closest('tr');
        if (tr?.dataset.id) window.location.href = `/report.html?id=${tr.dataset.id}&source=submitted`;
    });

    DOM.reportsBody?.addEventListener('change', e => {
        const checkbox = e.target.closest('.report-select-checkbox');
        if (!checkbox) return;
        const reportId = checkbox.dataset.id;
        if (!reportId) return;
        toggleReportSelection(reportId, checkbox.checked);
    });

    DOM.activeColumns?.addEventListener('click', e => {
        const row = e.target.closest('.preview-option-row');
        if (!row?.dataset.col) return;
        const col = row.dataset.col;
        STATE.activeCols    = STATE.activeCols.filter(c => c !== col);
        STATE.availableCols = [...STATE.availableCols, col];
        if (STATE.selectedForSwap === col) STATE.selectedForSwap = null;
        updateUI();
    });

    DOM.availableColumns?.addEventListener('click', e => {
        const row = e.target.closest('.preview-option-row');
        if (!row?.dataset.col) return;
        const col = row.dataset.col;

        if (STATE.selectedForSwap) {
            const idx = STATE.activeCols.indexOf(STATE.selectedForSwap);
            STATE.activeCols[idx]  = col;
            STATE.availableCols    = STATE.availableCols.filter(c => c !== col);
            STATE.availableCols.push(STATE.selectedForSwap);
            STATE.selectedForSwap  = null;
        } else {
            if (STATE.activeCols.length >= 6) return;
            STATE.availableCols = STATE.availableCols.filter(c => c !== col);
            STATE.activeCols.push(col);
        }
        updateUI();
    });
}

function initGlobalListeners() {
    DOM.search?.addEventListener('input',  applyFrontendFilters);
    DOM.startDate?.addEventListener('change', applyFrontendFilters);
    DOM.endDate?.addEventListener('change',   applyFrontendFilters);

    DOM.refreshBtn?.addEventListener('click', () => {
        if (DOM.search)    DOM.search.value    = '';
        if (DOM.startDate) DOM.startDate.value = '';
        if (DOM.endDate)   DOM.endDate.value   = '';
        clearAdvancedFilterForm();
        fetchReports();
    });

    DOM.deleteSelectedBtn?.addEventListener('click', deleteSelectedReports);

    document.addEventListener('change', e => {
        if (e.target && e.target.id === 'select-all-checkbox') {
            handleSelectAll(e.target.checked);
        }
    });

    DOM.prevBtn?.addEventListener('click', () => {
        if (STATE.currentPage > 1) { STATE.currentPage--; updateUI(); }
    });

    DOM.nextBtn?.addEventListener('click', () => {
        const total = Math.ceil(STATE.filteredReports.length / STATE.itemsPerPage);
        if (STATE.currentPage < total) { STATE.currentPage++; updateUI(); }
    });

    window.logout = () => {
        localStorage.clear();
        window.location.href = './index.html';
    };
}

function initModalListeners() {
    const modal = document.getElementById('filter-modal');
    document.getElementById('filter-btn')?.addEventListener('click',   () => modal.style.display = 'flex');
    document.getElementById('close-filters')?.addEventListener('click', () => modal.style.display = 'none');
    window.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });

    document.getElementById('apply-filters-btn')?.addEventListener('click', async () => {
        modal.style.display = 'none';
        await fetchReports(getAdvancedFilterParams());
    });

    document.getElementById('reset-filters-btn')?.addEventListener('click', () => {
        clearAdvancedFilterForm();
        if (DOM.search)    DOM.search.value    = '';
        if (DOM.startDate) DOM.startDate.value = '';
        if (DOM.endDate)   DOM.endDate.value   = '';
        fetchReports();
    });
}