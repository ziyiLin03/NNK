document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('access_token');
    const userRole = localStorage.getItem('user_role');

    // ─── GUARD: solo admin y analyst pueden entrar ───────────────────────────
    if (!token || !['admin', 'analyst'].includes(userRole)) {
        window.location.href = './index.html'; // o login.html
        alert("Access denied. Please log in with appropriate credentials.");
        return; // ← importante: detiene todo lo demás
    }

    if (window.innerWidth < 700) {
        window.location.href = './home.html'; // o login.html
        alert("Please come back on a Computer or large Tablet for data visualization.");
        return; // ← importante: detiene todo lo demás
    }

    const BASE_URL = window.API_BASE_URL || 'http://127.0.0.1:8000'; 

    const accountText = document.getElementById('user-role');
    
    if (userRole === 'analyst') {
        accountText.textContent = "Analyst Role"; 
    } else {
        accountText.textContent = "Administrator"; 
    } 

    const palette = [
        { bg: '#f4f7fe', text: '#4318FF' }, // Azul
        { bg: '#ecfdf5', text: '#10b981' }, // Verde
        { bg: '#fef3c7', text: '#f59e0b' }, // Naranja
        { bg: '#fee2e2', text: '#ef4444' }, // Rojo
        { bg: '#f3e8ff', text: '#a855f7' }  // Morado
    ];

    let mainChartInstance = null;
    let gaugeChartInstance = null;

    // --- 2. FUNCIÓN PRINCIPAL DE CARGA ---
    async function cargarGraficos(groupBy = 'nationality') {
        const token = localStorage.getItem('access_token');
  
        if (!token) {
            console.error('No hay token, de vuelta al login');
            window.location.href = './index.html';
         return;
        }
        try {
            const response = await fetch(`${BASE_URL}/api/nationality-chart/?group_by=${groupBy}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) throw new Error("Error al obtener los datos de Django");
            const rawData = await response.json(); 
            const data = rawData.tableData || [];
            const dbStatus = rawData.summary.dbStatus;

            // --- 3. ACTUALIZAR TEXTOS Y TARJETAS ---
            const totalTestimoniesEl = document.getElementById('total-testimonies');
            const totalNationalitiesEl = document.getElementById('total-nationalities');
            const scLabel = document.querySelector('#total-nationalities').nextElementSibling; 
            const categoryIcon = document.getElementById('category-icon');

            if (totalTestimoniesEl) totalTestimoniesEl.textContent = rawData.summary.totalTestimonies;
            if (totalNationalitiesEl) totalNationalitiesEl.textContent = rawData.summary.totalNationalities;

                // --- NUEVO: Etiquetas e iconos según la agrupación ---
            if (scLabel) {
                if (groupBy === 'nationality') scLabel.textContent = rawData.summary.cardSubtitle || "Out of 195 Nationalities";
                else if (groupBy === 'age') scLabel.textContent = rawData.summary.cardSubtitle || "Average Age";
                else if (groupBy === 'gender') scLabel.textContent = rawData.summary.cardSubtitle || "Majority Demographic"; 
            }
            
            
            if (categoryIcon) {
                if (groupBy === 'nationality') categoryIcon.className = 'fa-solid fa-earth-americas';
                else if (groupBy === 'age') categoryIcon.className = 'fa-solid fa-users';
                else if (groupBy === 'gender') categoryIcon.className = 'fa-solid fa-venus-mars'; // Icono para género
            }
            

            // --- 3.5 ACTUALIZAR TÍTULOS DE LA TABLA ---
            const tableCardTitle = document.getElementById('table-card-title');
            const thCategory = document.getElementById('th-category');
            const thExtra = document.getElementById('th-extra');
            const GraphTitle = document.getElementById('graphic-title');

            if (groupBy === 'nationality') {
                if (GraphTitle) GraphTitle.textContent = "Nationality Density";
                if (tableCardTitle) tableCardTitle.textContent = "Top 5 Most Common Nationalities";
                if (thCategory) thCategory.textContent = "Nationality";
                if (thExtra) thExtra.textContent = "Avg. Age";
            } else if (groupBy === 'age') {
                if (GraphTitle) GraphTitle.textContent = "Age Density";
                if (tableCardTitle) tableCardTitle.textContent = "Top 5 Most Common Ages";
                if (thCategory) thCategory.textContent = "Age";
                if (thExtra) thExtra.textContent = "Age"; 
            } else if (groupBy === 'gender') {
                // NUEVO: Títulos para género
                if (GraphTitle) GraphTitle.textContent = "Gender Density";
                if (tableCardTitle) tableCardTitle.textContent = "Gender Distribution";
                if (thCategory) thCategory.textContent = "Gender";
                if (thExtra) thExtra.textContent = "Avg. Age"; 
            }

            if (rawData.dynamicCards) {
            // Selectors
            const c3Value = document.getElementById('c3-value');
            const c3Label = document.getElementById('c3-label');
            const c3Icon = document.getElementById('c3-icon');
            const c3IconBg = document.getElementById('c3-icon-bg');
            const c3Progress = document.getElementById('c3-progress');

            const c4Value = document.getElementById('c4-value');
            const c4Label = document.getElementById('c4-label');
            const c4Icon = document.getElementById('c4-icon');
            const c4IconBg = document.getElementById('c4-icon-bg');
            const c4Progress = document.getElementById('c4-progress');

            // 1. Text Values
            if (c3Value) c3Value.textContent = rawData.dynamicCards.card3.value;
            if (c3Label) c3Label.textContent = rawData.dynamicCards.card3.label;
            
            if (c4Value) c4Value.textContent = rawData.dynamicCards.card4.value;
            if (c4Label) c4Label.textContent = rawData.dynamicCards.card4.label;

            // 2. Icons & Colors based on group_by
            if (groupBy === 'nationality') {
                if (c3Icon) c3Icon.className = 'fa-solid fa-earth-europe';
                if (c3IconBg) { c3IconBg.style.color = '#9333ea'; c3IconBg.style.background = '#f3e8ff'; }
                if (c3Progress) { c3Progress.style.width = '3.6%'; c3Progress.style.background = '#9333ea'; }

                if (c4Icon) c4Icon.className = 'fa-solid fa-route';
                if (c4IconBg) { c4IconBg.style.color = '#0284c7'; c4IconBg.style.background = '#e0f2fe'; }
                if (c4Progress) { c4Progress.style.width = `${rawData.dynamicCards.card4.percentage}%`; c4Progress.style.background = '#0284c7'; }

            } else if (groupBy === 'age') {
                if (c3Icon) c3Icon.className = 'fa-solid fa-children';
                if (c3IconBg) { c3IconBg.style.color = '#f59e0b'; c3IconBg.style.background = '#fffbeb'; }
                if (c3Progress) { c3Progress.style.width = `${rawData.dynamicCards.card3.percentage}%`; c3Progress.style.background = '#f59e0b'; }

               // Card 4 (Elderly)
                if (c4Icon) c4Icon.className = 'fa-solid fa-person-walking-with-cane'; // New Icon!
                if (c4IconBg) { c4IconBg.style.color = '#fc0000'; c4IconBg.style.background = '#fdf0ec'; }
                if (c4Progress) { 
                    c4Progress.style.width = `${rawData.dynamicCards.card4.percentage}%`; 
                    c4Progress.style.background = '#ff0000'; 
                }

            } else if (groupBy === 'gender') {
                if (c3Icon) c3Icon.className = 'fa-solid fa-mars-and-venus';
                if (c3IconBg) { c3IconBg.style.color = '#ef4444'; c3IconBg.style.background = '#fef2f2'; }
                if (c3Progress) { c3Progress.style.width = '100%'; c3Progress.style.background = '#ef4444'; }

                if (c4Icon) c4Icon.className = 'fa-solid fa-users';
                if (c4IconBg) { c4IconBg.style.color = '#ec4899'; c4IconBg.style.background = '#fdf2f8'; }
                if (c4Progress) { c4Progress.style.width = `${rawData.dynamicCards.card4.percentage}%`; c4Progress.style.background = '#ec4899'; }
            }
        }
            // --- 4. ACTUALIZAR BARRAS HORIZONTALES ---
            const totalBar = document.getElementById('total-progress-bar');
            if (totalBar) totalBar.style.width = `${dbStatus.percentage}%`;

            const nationalitiesBar = document.getElementById('nationalities-progress-bar');
            if (nationalitiesBar) nationalitiesBar.style.width = `${rawData.summary.nationalitiesPercentage}%`;

            // --- 5. ACTUALIZAR ESTADO DE BASE DE DATOS (TEXTOS) ---
            const gaugeText = document.getElementById('gauge-text');
            const submittedCountEl = document.getElementById('db-submitted-count');
            const pendingCountEl = document.getElementById('db-pending-count');

            if (gaugeText) gaugeText.textContent = `${dbStatus.percentage}%`;
            if (submittedCountEl) submittedCountEl.textContent = dbStatus.submitted;
            if (pendingCountEl) pendingCountEl.textContent = dbStatus.pending;

            // --- 6. RELLENAR LA TABLA INFERIOR ---
            const tableBody = document.getElementById('country-table-body');
            if (tableBody) {
                tableBody.innerHTML = ''; 

                data.slice(0, 5).forEach((item, index) => {
                    const categoryName = item.category || "Unknown";
                    const count = item.testimonies; 
                    const percentage = item.percentage;
                    const colorTheme = palette[index % palette.length];
                    
                    // Elegir icono de la tabla
                    let iconClass = 'fa-user';
                    if (groupBy === 'nationality') iconClass = 'fa-earth-africa';
                    else if (groupBy === 'gender') iconClass = 'fa-venus-mars'; // Mismo icono de la tarjeta superior

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td>
                            <div style="display: flex; align-items: center; gap: 15px;">
                                <div style="background: ${colorTheme.bg}; color: ${colorTheme.text}; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                                    <i class="fa-solid ${iconClass}"></i>
                                </div>
                                <span style="font-weight: 600; color: var(--text-main);">${categoryName}</span>
                            </div>
                        </td>
                        <td style="font-weight: 700; font-size: 15px;">${count}</td>
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <span style="font-size: 13px; font-weight: 600; color: var(--text-muted); width: 35px;">${percentage}%</span>
                                <div class="mini-progress-bar" style="width: 100px; margin-top: 0; background: #e9edf7;">
                                    <div class="mini-progress-fill" style="width: ${percentage}%; background: ${colorTheme.text};"></div>
                                </div>
                            </div>
                        </td>
                        <td><span class="country-pill" style="background: #f4f7fe; color: #a3aed1; font-weight: 600;">${item.average_age || '-'}</span></td>
                    `;
                    tableBody.appendChild(tr);
                });
            }

            // --- 7. DIBUJAR GRÁFICO PRINCIPAL ---
            const mainChartCanvas = document.getElementById('mainChart');
            if (mainChartCanvas) {
                if (mainChartInstance) {
                    mainChartInstance.destroy();
                }

                const ctxMain = mainChartCanvas.getContext('2d');
                mainChartInstance = new Chart(ctxMain, {
                    type: 'bar',
                    data: {
                        labels: rawData.labels,
                        datasets: rawData.datasets
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false, 
                        scales: {
    x: {
        grid: { display: false }
    },
    y: { 
    border: { display: false }, 
    beginAtZero: true,
    suggestedMax: Math.max(...rawData.datasets.flatMap(d => d.data)) * 1.1, // +10% de margen
    ticks: {
        callback: function(value) { return value + '%'; }
    }
}
},
                        plugins: {
                            legend: { display: false },
                            title: { display: true, text: rawData.title, align: 'start' },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return ` ${context.parsed.y}% of total`;
                                    }
                                }
                            }
                        }
                    }
                });
            }

            // --- 8. DIBUJAR GRÁFICO CIRCULAR (GAUGE) ---
            const gaugeCanvas = document.getElementById('gaugeChart');
            if (gaugeCanvas) {
                if (!gaugeChartInstance) {
                    const ctxGauge = gaugeCanvas.getContext('2d');
                    gaugeChartInstance = new Chart(ctxGauge, {
                        type: 'doughnut',
                        data: {
                            datasets: [{
                                data: [dbStatus.submitted, dbStatus.pending],
                                backgroundColor: ['rgb(192,18,31)', '#e9edf7'],
                                borderWidth: 0,
                                cutout: '80%',
                                circumference: 180,
                                rotation: 270
                            }]
                        },
                        options: { responsive: true, maintainAspectRatio: false, plugins: { tooltip: { enabled: true } } }
                    });
                } else {
                    gaugeChartInstance.data.datasets[0].data = [dbStatus.submitted, dbStatus.pending];
                    gaugeChartInstance.update();
                }
            }

        } catch (error) {
            console.error("Error cargando el dashboard:", error);
        }
    }

    // --- 9. INICIALIZAR EVENTOS ---
    const selectAgrupacion = document.getElementById('data-grouping-select');
    if (selectAgrupacion) {
        selectAgrupacion.addEventListener('change', (e) => {
            cargarGraficos(e.target.value); 
        });
    }

    cargarGraficos('nationality');

    // --- LOGOUT ---
    window.logout = function() {
        localStorage.clear();
        window.location.href = './index.html';
    }

    // --- 10. CARD TAB NAVIGATION SWITCHER ---
    const tabAdvanced = document.getElementById('tab-advanced');
    const tabMaps = document.getElementById('tab-maps');
    const contentAdvanced = document.getElementById('content-advanced');
    const contentMaps = document.getElementById('content-maps');

    if (tabAdvanced && tabMaps && contentAdvanced && contentMaps) {
        // Advanced Tab Event
        tabAdvanced.addEventListener('click', () => {
            // Style changes
            tabAdvanced.style.color = 'var(--primary)';
            tabAdvanced.style.borderBottom = '2px solid var(--primary)';
            tabMaps.style.color = 'var(--text-muted)';
            tabMaps.style.borderBottom = 'none';
            // Display toggle
            contentAdvanced.style.display = 'flex';
            contentMaps.style.display = 'none';
        });

        // Maps Tab Event
        tabMaps.addEventListener('click', () => {
            // Style changes
            tabMaps.style.color = 'var(--primary)';
            tabMaps.style.borderBottom = '2px solid var(--primary)';
            tabAdvanced.style.color = 'var(--text-muted)';
            tabAdvanced.style.borderBottom = 'none';
            // Display toggle
            contentMaps.style.display = 'flex';
            contentAdvanced.style.display = 'none';
        });
    }
});