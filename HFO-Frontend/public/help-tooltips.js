(function () {
  const PAGE_GUIDES = {
    "index.html": {
      title: { en: "How to use the initial data load", es: "Cómo usar la carga inicial de datos" },
      bullets: {
        en: [
          "This page controls the large database request. Pick the broad period you want to load before opening a dashboard.",
          "Recommended max records is a visual performance threshold, not a hard block. If the selected window is above it, the Home page warns you, but you decide whether to continue.",
          "Dashboard filters then work inside this loaded window, so changing date, region or granularity recalculates only the already-approved analysis range."
        ],
        es: [
          "Esta página controla el GET grande a BBDD. Elige aquí el periodo amplio que quieres cargar antes de abrir un dashboard.",
          "El máximo recomendado de registros es un umbral visual de rendimiento, no un bloqueo. Si la ventana lo supera, Home te avisa, pero tú decides si continuar.",
          "Los filtros de los dashboards trabajan dentro de esta ventana cargada; al cambiar fecha, región o granularidad se recalcula solo el rango aprobado."
        ]
      }
    },
    "operational_kpis_dashboard.html": {
      title: { en: "What this dashboard tells you", es: "Qué te dice este dashboard" },
      bullets: {
        en: [
          "Use it to understand collection volume: testimonies/groups recorded, people represented and where activity is concentrated.",
          "The left filters control every KPI, chart and table. The time axis and summaries are recalculated after each change.",
          "People represented comes from the group size/party size recorded for each testimony; it is not a unique-person identifier."
        ],
        es: [
          "Sirve para entender volumen de recogida: testimonios/grupos registrados, personas representadas y zonas con más actividad.",
          "Los filtros de la izquierda controlan todos los KPIs, gráficas y tablas. El eje temporal y los resúmenes se recalculan con cada cambio.",
          "Personas representadas sale del tamaño de grupo/party size de cada testimonio; no es un identificador de persona única."
        ]
      }
    },
    "demographics_dashboard.html": {
      title: { en: "How to interpret demographic results", es: "Cómo interpretar la demografía" },
      bullets: {
        en: [
          "These charts describe the selected testimony records and are weighted by people represented when group size is available.",
          "Unknown, not reported and empty values are shown as data-quality categories, not as real demographic or vulnerability groups.",
          "Use these results for composition and planning, not as exact individual-level census data unless the final app provides person-level IDs."
        ],
        es: [
          "Estas gráficas describen los testimonios seleccionados y se ponderan por personas representadas cuando existe tamaño de grupo.",
          "Unknown, not reported y valores vacíos se tratan como categorías de calidad de dato, no como grupos demográficos o vulnerabilidades reales.",
          "Úsalo para composición y planificación, no como censo individual exacto salvo que la app final entregue IDs de persona."
        ]
      }
    },
    "dashboard_02_incident_needs.html": {
      title: { en: "How to read incidents and needs", es: "Cómo leer incidentes y necesidades" },
      bullets: {
        en: [
          "This dashboard is event/tag based: one testimony or point can contain several incident or need tags.",
          "Percentages are prevalence against the selected events. They are capped at 100% per tag but different tags are not expected to sum to 100%.",
          "Use it to detect what is being reported most often and whether risk or assistance categories are increasing over time."
        ],
        es: [
          "Este dashboard trabaja por eventos/etiquetas: un mismo testimonio o punto puede contener varias etiquetas de incidente o necesidad.",
          "Los porcentajes son prevalencia sobre eventos seleccionados. Cada etiqueta se limita a 100%, pero las etiquetas no tienen por qué sumar 100% entre ellas.",
          "Úsalo para detectar qué se reporta con más frecuencia y si aumentan categorías de riesgo o de asistencia."
        ]
      }
    },
    "dashboard_03_data_quality.html": {
      title: { en: "How to use data-quality checks", es: "Cómo usar la calidad de datos" },
      bullets: {
        en: [
          "This page tells you whether the selected data is reliable enough for maps, KPIs, filters and exports.",
          "Completeness checks show missing critical fields. Latency compares when something happened against when it was recorded.",
          "If quality drops in a period or region, interpret the analytical dashboards with caution before making operational conclusions."
        ],
        es: [
          "Esta página indica si los datos seleccionados son suficientemente fiables para mapas, KPIs, filtros y exports.",
          "La completitud muestra campos críticos faltantes. La latencia compara cuándo ocurrió algo con cuándo se registró.",
          "Si la calidad baja en una zona o periodo, interpreta los dashboards analíticos con cautela antes de sacar conclusiones operativas."
        ]
      }
    },
    "dashboard_04_mobility_route.html": {
      title: { en: "How to interpret mobility evidence", es: "Cómo interpretar la movilidad" },
      bullets: {
        en: [
          "Distances are approximate straight-line sums between ordered points from the the same testimony.",
          "The values are rough estimates from recorded points and should be interpreted together with data quality.",
          "Use the distance charts as a rough mobility indicator and always check data-quality/readiness before using them in conclusions."
        ],
        es: [
          "Las distancias son sumas aproximadas en línea recta entre puntos ordenados de la mismo testimonio.",
          "Los valores son estimaciones aproximadas desde puntos registrados y deben interpretarse junto con la calidad de datos.",
          "Usa las gráficas de distancia como indicador aproximado de movilidad y revisa siempre la calidad/preparación del dato antes de concluir."
        ]
      }
    },
    "data_review_viewer.html": {
      title: { en: "Purpose of Data Review", es: "Para qué sirve Data Review" },
      bullets: {
        en: [
          "Use this page to inspect raw JSON inputs and verify whether frontend outputs match the source records.",
          "This is a developer/analyst view, not a presentation dashboard.",
          "When a KPI looks strange, check here first to confirm if the source data contains missing, duplicated or unexpected values."
        ],
        es: [
          "Usa esta página para inspeccionar los JSON de entrada y verificar si los resultados del frontend encajan con los registros fuente.",
          "Es una vista de desarrollador/analista, no un dashboard de presentación.",
          "Cuando un KPI parezca raro, revisa aquí primero si los datos fuente tienen valores faltantes, duplicados o inesperados."
        ]
      }
    }
  };

  const HELP = {
    "Database GET window": {
      en: "Defines the broad dataset requested from the backend/database. It is the outer limit for all dashboard filters.",
      es: "Define el dataset amplio que se pide al backend/BBDD. Es el límite externo para todos los filtros de los dashboards."
    },
    "Max records allowed": {
      en: "Safety limit for the initial database request. If the selected range contains more records than this value, loading is blocked.",
      es: "Límite de seguridad para el GET inicial a BBDD. Si el rango contiene más registros que este valor, se bloquea la carga."
    },
    "Check size": {
      en: "Asks the backend to estimate how many records would be loaded before saving the window.",
      es: "Pide al backend una estimación de cuántos registros se cargarían antes de guardar la ventana."
    },
    "Save load window": {
      en: "Saves the approved GET window in the browser so every dashboard uses the same loaded data range.",
      es: "Guarda la ventana de GET aprobada en el navegador para que todos los dashboards usen el mismo rango cargado."
    },
    "Use full dataset": {
      en: "Attempts to use the complete available dataset. This can fail if it exceeds the max-record safety limit.",
      es: "Intenta usar todo el dataset disponible. Puede fallar si supera el límite máximo de registros."
    },
    "Clear saved window": {
      en: "Deletes the saved initial window and forces you to choose a new load range.",
      es: "Borra la ventana inicial guardada y obliga a elegir un nuevo rango de carga."
    },
    "Time window": {
      en: "Filters the dashboard inside the already-loaded GET window. KPIs, charts and tables are recalculated after each change.",
      es: "Filtra el dashboard dentro de la ventana de GET ya cargada. KPIs, gráficas y tablas se recalculan con cada cambio."
    },
    "Granularity": {
      en: "Controls how time is grouped on charts: hour, day, week, month or year depending on the dashboard.",
      es: "Controla cómo se agrupa el tiempo en las gráficas: hora, día, semana, mes o año según el dashboard."
    },
    "Regions": {
      en: "Operational-zone filter. It uses the normalized region/zone field from the backend, not manual map drawing.",
      es: "Filtro de zona operativa. Usa la región/zona normalizada por backend, no selección manual en el mapa."
    },
    "Source": {
      en: "Input dataset currently feeding this dashboard. In local mode it usually comes from mock JSON files; in production it should come from the database/API.",
      es: "Dataset de entrada que alimenta el dashboard. En local suele venir de JSON mock; en producción debería venir de BBDD/API."
    },
    "Loaded window": {
      en: "Date range loaded by the initial database request. Dashboard filters can only work inside this window.",
      es: "Rango temporal cargado por el GET inicial a BBDD. Los filtros del dashboard solo trabajan dentro de esta ventana."
    },
    "Dataset coverage": {
      en: "First and last dates available in the loaded source data, before applying the dashboard filter panel.",
      es: "Primera y última fecha disponibles en los datos cargados, antes de aplicar los filtros del panel."
    },
    "Selected regions": {
      en: "Regions currently included in the calculations. All means no regional restriction is active.",
      es: "Regiones incluidas actualmente en los cálculos. Todo significa que no hay restricción regional activa."
    },
    "Status": {
      en: "Runtime status: confirms successful API loading or explains why the dashboard could not refresh.",
      es: "Estado de ejecución: confirma carga correcta por API o explica por qué el dashboard no se pudo refrescar."
    },
    "Export PDF report": {
      en: "Exports the current dashboard as a report, respecting the visible filters and theme.",
      es: "Exporta el dashboard actual como informe, respetando filtros visibles y tema."
    },
    "PNG": {
      en: "Exports this chart as an image for slides or quick sharing.",
      es: "Exporta esta gráfica como imagen para presentaciones o envío rápido."
    },
    "PDF": {
      en: "Exports this chart as a single-page PDF.",
      es: "Exporta esta gráfica como PDF de una página."
    },
    "CSV": {
      en: "Exports the underlying data shown by this chart/table so it can be analysed outside the dashboard.",
      es: "Exporta los datos base de esta gráfica/tabla para analizarlos fuera del dashboard."
    },
    "People represented": {
      en: "Estimated people volume represented by the selected testimonies/groups, usually based on party_size/numPersons.",
      es: "Volumen estimado de personas representadas por los testimonios/grupos seleccionados, normalmente basado en party_size/numPersons."
    },
    "This week · groups & people": {
      en: "Counts selected testimony/group records and the people represented by those records in the current time window.",
      es: "Cuenta registros de testimonios/grupos seleccionados y las personas representadas por esos registros en la ventana actual."
    },
    "Active regions this week": {
      en: "Number of operational zones with at least one selected testimony in the current period.",
      es: "Número de zonas operativas con al menos un testimonio seleccionado en el periodo actual."
    },
    "Coverage alerts": {
      en: "Flags whether any expected operational zone has recently stopped appearing in the selected data.",
      es: "Avisa si alguna zona operativa esperada deja de aparecer recientemente en los datos seleccionados."
    },
    "Activity trend": {
      en: "Shows how testimony volume changes over time. Use it to detect increases, drops and reporting peaks.",
      es: "Muestra cómo cambia el volumen de testimonios en el tiempo. Sirve para detectar aumentos, caídas y picos de registro."
    },
    "Regional load": {
      en: "Compares workload or data volume across operational zones within the selected window.",
      es: "Compara carga de trabajo o volumen de datos entre zonas operativas dentro de la ventana seleccionada."
    },
    "Average daily activity by hour": {
      en: "Shows the average number of testimonies recorded at each hour of the day. Useful for staffing patterns.",
      es: "Muestra la media de testimonios registrados por hora del día. Útil para patrones de personal/turnos."
    },
    "Gender distribution": {
      en: "People-weighted gender composition for the selected records. Unknown/not reported is a data-quality category.",
      es: "Composición de género ponderada por personas representadas para los registros seleccionados. Unknown/not reported es categoría de calidad de dato."
    },
    "Nationalities": {
      en: "Main nationalities represented in the selected records. Use regional/time tabs to see how composition changes.",
      es: "Principales nacionalidades representadas en los registros seleccionados. Usa pestañas de región/tiempo para ver cambios de composición."
    },
    "Vulnerability types": {
      en: "Shows reported vulnerability categories. None reported and unknown should not be interpreted as real vulnerability types.",
      es: "Muestra categorías de vulnerabilidad reportadas. None reported y unknown no deben interpretarse como vulnerabilidades reales."
    },
    "Health score": {
      en: "General health score distribution. Interpret it only where health data completeness is acceptable.",
      es: "Distribución de salud general. Interprétala solo cuando la completitud del campo salud sea aceptable."
    },
    "Events over time": {
      en: "Temporal evolution of selected incident/need events. Recalculated by date, region and granularity filters.",
      es: "Evolución temporal de incidentes/necesidades seleccionados. Se recalcula por fecha, región y granularidad."
    },
    "Incident / need prevalence by tag": {
      en: "Tag prevalence among selected events. One event can include several tags, so tag percentages do not need to add up to 100%.",
      es: "Prevalencia de etiquetas entre eventos seleccionados. Un evento puede tener varias etiquetas, así que los porcentajes no tienen que sumar 100%."
    },
    "Incidents by point type": {
      en: "Breakdown by point_type. This helps separate risks, assistance needs and contextual markers.",
      es: "Desglose por point_type. Ayuda a separar riesgos, necesidades de asistencia y marcadores de contexto."
    },
    "Tag detail": {
      en: "Detailed table of tags, categories, event counts, affected people and prevalence.",
      es: "Tabla detallada de etiquetas, categorías, recuento de eventos, personas afectadas y prevalencia."
    },
    "Data quality over time": {
      en: "Tracks whether completeness, latency or record volume improves or worsens over the selected period.",
      es: "Mide si completitud, latencia o volumen de registros mejora o empeora en el periodo seleccionado."
    },
    "Latency distribution": {
      en: "Shows how long it takes to record events after they occur. High latency means less real-time reliability.",
      es: "Muestra cuánto tarda en registrarse un evento desde que ocurre. Latencia alta implica menor fiabilidad en tiempo real."
    },
    "Field completeness": {
      en: "Percentage of records where each critical field is present. Low completeness can make charts misleading.",
      es: "Porcentaje de registros donde cada campo crítico está presente. Completitud baja puede hacer que las gráficas engañen."
    },
    "Completeness by region": {
      en: "Compares data completeness between operational zones to detect where collection quality needs improvement.",
      es: "Compara completitud entre zonas operativas para detectar dónde mejorar la recogida de datos."
    },
    "Avg. latency by region": {
      en: "Average recording delay per region. Use it to find areas where data arrives late.",
      es: "Retraso medio de registro por región. Sirve para detectar zonas donde los datos llegan tarde."
    },
    "Movement evidence over time": {
      en: "Shows when recorded trajectory points appear. This is evidence of recorded movement data, not a confirmed route map.",
      es: "Muestra cuándo aparecen puntos de trayectoria registrados. Es evidencia de datos de movimiento, no un mapa de ruta confirmada."
    },
    "People and entities observed by zone": {
      en: "Coverage comparison by zone. It shows where records and represented people are concentrated, not a directional flow view.",
      es: "Comparación de cobertura por zona. Muestra dónde se concentran registros y personas representadas, no una vista de flujo direccional."
    },
    "Approximate distance distribution": {
      en: "Distribution of approximate straight-line distance per testimony. Bins adapt to the selected data range.",
      es: "Distribución de distancia aproximada en línea recta por testimonio. Las bandas se adaptan al rango de datos seleccionado."
    },
    "Zone coverage summary": {
      en: "Table of observed volume by zone. It should be read as coverage, not as movement between zones.",
      es: "Tabla de volumen observado por zona. Debe leerse como cobertura, no como movimiento entre zonas."
    },
    "Approximate distance records": {
      en: "Records with calculable approximate distance based on 2+ ordered points from the the same testimony.",
      es: "Registros con distancia aproximada calculable a partir de 2+ puntos ordenados de la mismo testimonio."
    }
  };

  const norm = value => String(value || "").replace(/\s+/g, " ").trim();

  function lang() {
    try { return window.HFOPrefs && window.HFOPrefs.load().language === "es" ? "es" : "en"; }
    catch (_) { return document.documentElement.lang === "es" ? "es" : "en"; }
  }

  function pick(text) {
    const key = norm(text);
    const entry = HELP[key];
    return entry ? entry[lang()] || entry.en : "";
  }

  function pageKey() {
    const name = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    return name || "index.html";
  }

  function removeExistingHelp() {
    document.querySelectorAll(".hfo-help-badge,.dashboard-guide,.sidebar-help-box").forEach(el => el.remove());
  }

  function createBadge(text) {
    const help = text && text.en ? (text[lang()] || text.en) : pick(text);
    if (!help) return null;
    const badge = document.createElement("span");
    badge.className = "hfo-help-badge";
    badge.tabIndex = 0;
    badge.setAttribute("role", "button");
    badge.setAttribute("aria-label", lang() === "es" ? "Ayuda" : "Help");

    const mark = document.createElement("span");
    mark.className = "hfo-help-mark";
    mark.textContent = "?";

    const tooltip = document.createElement("span");
    tooltip.className = "hfo-help-tooltip";
    tooltip.textContent = help;

    badge.appendChild(mark);
    badge.appendChild(tooltip);
    return badge;
  }

  function addBadge(el, keyText) {
    if (!el || el.querySelector(":scope > .hfo-help-badge")) return;
    const badge = createBadge(keyText || el.dataset.helpKey || el.textContent);
    if (!badge) return;
    el.classList.add("hfo-help-target");
    el.appendChild(document.createTextNode(" "));
    el.appendChild(badge);
  }

  function addGuide() {
    const guide = PAGE_GUIDES[pageKey()];
    const subtitle = document.querySelector(".subtitle");
    if (!guide || !subtitle) return;

    const box = document.createElement("section");
    box.className = "dashboard-guide";
    box.setAttribute("aria-label", guide.title[lang()] || guide.title.en);

    const title = document.createElement("div");
    title.className = "dashboard-guide-title";
    title.textContent = guide.title[lang()] || guide.title.en;

    const list = document.createElement("ul");
    (guide.bullets[lang()] || guide.bullets.en).forEach(item => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });

    box.appendChild(title);
    box.appendChild(list);
    subtitle.insertAdjacentElement("afterend", box);
  }

  function addSidebarHelp() {
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;
    const box = document.createElement("div");
    box.className = "sidebar-help-box";
    box.innerHTML = lang() === "es"
      ? `<strong>Lectura rápida</strong><br>1) Cambia filtros en la izquierda.<br>2) Todo el dashboard se recalcula.<br>3) Los resultados siempre quedan dentro de la ventana inicial cargada desde Home.`
      : `<strong>Quick read</strong><br>1) Change filters on the left.<br>2) The whole dashboard recalculates.<br>3) Results always stay inside the initial load window selected from Home.`;
    const meta = sidebar.querySelector(".meta-boxes");
    if (meta) sidebar.insertBefore(box, meta);
    else sidebar.appendChild(box);
  }

  function enhanceStaticText() {
    document.querySelectorAll(".field-label,.label,.mini-box .k,.panel h2,.content-card h2,.analysis-form-grid label > span,.analysis-load-card h2,.chart-panel-actions .button,.chart-export-button,.top-actions .button").forEach(el => addBadge(el));

    document.querySelectorAll("button").forEach(button => {
      const key = norm(button.textContent);
      if (["PNG", "PDF", "CSV", "Check size", "Save load window", "Use full dataset", "Clear saved window"].includes(key)) addBadge(button, key);
    });

    const homeCards = document.querySelectorAll(".home-card strong");
    homeCards.forEach(strong => addBadge(strong));
  }

  function refresh() {
    removeExistingHelp();
    addGuide();
    addSidebarHelp();
    enhanceStaticText();
  }

  function init() {
    refresh();
    window.addEventListener("dashboardPrefsChanged", refresh);
    setTimeout(refresh, 250);
    setTimeout(refresh, 900);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
