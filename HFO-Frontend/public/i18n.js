(function () {
  const translations = {
    es: {
      "Language": "Idioma",
      "Dark mode": "Modo oscuro",
      "Light mode": "Modo claro",
      "Home": "Inicio",
      "Volume & Coverage": "Volumen y Cobertura",
      "Demographics": "Demografía",
      "Data Review": "Revisión de datos",
      "HFO Analytics - Volume & Coverage": "HFO Analytics - Volumen y Cobertura",
      "HFO Analytics - Demographics": "HFO Analytics - Demografía",
      "HFO Analytics - Data Review": "HFO Analytics - Revisión de datos",
      "Dashboards backed by Python-generated KPI contracts and an optional local Python API.": "Dashboards apoyados por contratos KPI generados en Python y una API local opcional.",
      "Operational KPIs, time series, activity curve and regional coverage.": "KPIs operacionales, serie temporal, curva de actividad y cobertura regional.",
      "Weighted demographic, vulnerability and health distributions.": "Distribuciones demográficas, de vulnerabilidad y salud ponderadas.",
      "Inspect source JSONs, output contracts and preview rows.": "Inspección de JSONs fuente, contratos de salida y filas de vista previa.",
      "Operational KPI view. Filters are sent to the Python API when available; otherwise the dashboard falls back to static output JSON.": "Vista de KPIs operacionales. Los filtros se envían a la API de Python cuando está disponible; si no, se usa el JSON estático de outputs/.",
      "Weighted demographic, legal, vulnerability and health indicators based on testimony data.": "Indicadores demográficos, legales, de vulnerabilidad y salud basados en datos de testimonios.",
      "Manual inspection of source JSONs and generated KPI contracts.": "Inspección manual de JSONs fuente y contratos KPI generados.",
      "Filters": "Filtros",
      "Time window": "Ventana temporal",
      "Granularity": "Granularidad",
      "Regions": "Regiones",
      "All": "Todo",
      "Custom": "Personalizado",
      "Reset filters": "Restablecer filtros",
      "Source": "Fuente",
      "Loaded window": "Ventana cargada",
      "Dataset coverage": "Cobertura del dataset",
      "Selected regions": "Regiones seleccionadas",
      "Status": "Estado",
      "People represented": "Personas representadas",
      "Testimonies": "Testimonios",
      "Active buckets": "Periodos activos",
      "Entities": "Entidades",
      "Avg. health": "Salud media",
      "No data matches the current filters.": "No hay datos para los filtros actuales.",
      "Testimonies over time": "Testimonios en el tiempo",
      "Bars show people represented; line shows testimony records.": "Las barras muestran personas representadas; la línea muestra registros de testimonios.",
      "Activity by hour": "Actividad por hora",
      "Number of testimonies by recorded hour.": "Número de testimonios por hora de registro.",
      "Regional coverage": "Cobertura regional",
      "People represented by area.": "Personas representadas por zona.",
      "Region table": "Tabla por región",
      "Region": "Región",
      "Gender distribution": "Distribución por género",
      "Weighted by people represented.": "Ponderado por personas representadas.",
      "Top nationalities": "Principales nacionalidades",
      "Top categories weighted by people represented.": "Categorías principales ponderadas por personas representadas.",
      "Vulnerability types": "Tipos de vulnerabilidad",
      "Multiple vulnerabilities may be counted for one testimony.": "Un testimonio puede contar en varias vulnerabilidades.",
      "Health score": "Puntuación de salud",
      "General health score from 1 to 5.": "Puntuación general de salud de 1 a 5.",
      "Nationality table": "Tabla de nacionalidades",
      "Data quality": "Calidad de datos",
      "Label": "Etiqueta",
      "Share": "Porcentaje",
      "Field": "Campo",
      "Filled": "Completos",
      "Missing": "Faltantes",
      "Completeness": "Completitud",
      "File": "Archivo",
      "Rows shown": "Filas mostradas",
      "Type": "Tipo",
      "Path": "Ruta",
      "Select file": "Seleccionar archivo",
      "Preview": "Vista previa",
      "All regions": "Todas las regiones",
      "Selected window": "Ventana seleccionada",
      "Hour": "Hora",
      "Day": "Día",
      "Week": "Semana",
      "Month": "Mes",
      "Array": "Array",
      "Object": "Objeto",
      "Events": "Eventos",
      "Trajectories": "Trayectorias",
      "Operational output": "Output operacional",
      "Demographics output": "Output demográfico",
      "Loaded from Python API.": "Cargado desde la API de Python.",
      "API not available. Loaded from static outputs/ JSON.": "API no disponible. Cargado desde el JSON estático de outputs/.",
      "Loading operational KPIs...": "Cargando KPIs operacionales...",
      "Loading demographics KPIs...": "Cargando KPIs demográficos...",
      "Loading {file}...": "Cargando {file}...",
      "Loaded {file}. Showing first 100 rows.": "{file} cargado. Mostrando las primeras 100 filas.",
      "Export PDF report": "Exportar informe PDF",
      "Export PNG": "Exportar PNG",
      "Export this chart as PNG": "Exportar esta gráfica como PNG",
      "Exported report": "Informe exportado",
      "HFO Analytics dashboard export.": "Exportación del dashboard HFO Analytics.",
      "Generated": "Generado",
      "Last 30 days": "Últimos 30 días",
      "Last 90 days": "Últimos 90 días",
      "Last 180 days": "Últimos 180 días",
      "Last 365 days": "Últimos 365 días",
      "Exporting PDF...": "Exportando PDF...",
      "No chart available to export.": "No hay gráfica disponible para exportar.",
      "Chart export failed.": "La exportación de la gráfica ha fallado.",
      "PDF export libraries are not available.": "Las librerías de exportación PDF no están disponibles.",
      "PDF export failed.": "La exportación PDF ha fallado.",
      "Unable to load {file}: {message}": "No se ha podido cargar {file}: {message}",
      "Unable to load operational KPIs: {message}": "No se han podido cargar los KPIs operacionales: {message}",
      "Unable to load demographics KPIs: {message}": "No se han podido cargar los KPIs demográficos: {message}",
      "Incident & Needs": "Incidentes y Necesidades",
      "Data Quality": "Calidad de Datos",
      "Mobility Evidence": "Evidencia de movilidad",
      "Incident frequency, detected needs and event type distribution by region.": "Frecuencia de incidentes, necesidades detectadas y distribución de tipos de evento por región.",
      "Recording latency, field completeness and temporal evolution of data quality.": "Latencia de registro, completitud de campos y evolución temporal de la calidad de datos.",
      "Approximate distance from ordered trajectory points and mobility evidence by zone.": "Distancia aproximada desde puntos de trayectoria ordenados y evidencia de movilidad por zona.",
      "HFO Analytics - Incident & Needs": "HFO Analytics - Incidentes y Necesidades",
      "HFO Analytics - Data Quality": "HFO Analytics - Calidad de Datos",
      "Incident & Needs dashboard. Incident frequency, detected needs and event type distribution.": "Dashboard de Incidentes y Necesidades. Frecuencia de incidentes, necesidades detectadas y distribución de tipos de evento.",
      "Data Quality dashboard. Recording latency and field completeness.": "Dashboard de Calidad de Datos. Latencia de registro y completitud de campos.",
      "Loading incident & needs KPIs...": "Cargando KPIs de incidentes y necesidades...",
      "Loading data quality KPIs...": "Cargando KPIs de calidad de datos...",
      "Loading mobility evidence KPIs...": "Cargando KPIs de evidencia de movilidad...",
      "Total events": "Total de eventos",
      "People affected": "Personas afectadas",
      "Active regions": "Regiones activas",
      "Incident types": "Tipos de incidente",
      "Events over time": "Eventos en el tiempo",
      "Incident rate by tag": "Tasa de incidentes por etiqueta",
      "Incidents by point type": "Incidentes por tipo de punto",
      "Tag detail": "Detalle de etiquetas",
      "By tag": "Por etiqueta",
      "By category": "Por categoría",
      "Events": "Eventos",
      "People": "Personas",
      "Global completeness": "Completitud global",
      "Avg. latency": "Latencia media",
      "Median latency": "Latencia mediana",
      "Max latency": "Latencia máxima",
      "Data quality over time": "Calidad de datos en el tiempo",
      "Latency distribution": "Distribución de latencia",
      "Field completeness": "Completitud de campos",
      "Completeness by region": "Completitud por región",
      "Avg. latency by region": "Latencia media por región",
      "Region detail": "Detalle por región",
      "Latency": "Latencia",
      "Completeness": "Completitud",
      "Required": "Requerido",
      "Present": "Presentes",
      "Groups in movement": "Grupos en movimiento",
      "People in transit": "Personas en tránsito",
      "Without tracking": "Sin seguimiento",
      "Avg. duration": "Duración media",
      "% Without tracking by region": "% Sin seguimiento por región",
      "Tracking quality per group": "Calidad de seguimiento por grupo",
      "Top transit nodes": "Principales nodos de tránsito",
      "Series metric": "Métrica de serie",
      "Active filters": "Filtros activos",
      "Groups": "Grupos",
      "Route": "Ruta",
      "Coordinates": "Coordenadas",
      "Hours": "Horas",
      "Records": "Registros",
      "Completeness (%)": "Completitud (%)",
      "Avg. latency (h)": "Latencia media (h)",
      "% without tracking": "% sin seguimiento",
      "Temporal series of registered events. Scroll to zoom · drag to pan.": "Serie temporal de eventos registrados.",
      "Frequency per location tag · full dataset.": "Frecuencia por etiqueta de localización · dataset completo.",
      "Distribution of registered incident types · full dataset.": "Distribución de tipos de incidente registrados · dataset completo.",
      "Temporal evolution of latency, completeness or event volume.": "Evolución temporal de latencia, completitud o volumen de eventos.",
      "Number of records per latency range · full dataset.": "Número de registros por rango de latencia · dataset completo.",
      "Percentage of records with each field present · full dataset.": "Porcentaje de registros con cada campo presente · dataset completo.",
      "% of complete records per area · full dataset.": "% de registros completos por área · dataset completo.",
      "Average recording latency per area (hours) · full dataset.": "Latencia media de registro por área (horas) · dataset completo.",
      "Proportion of groups by tracking level recorded in the field.": "Proporción de grupos por nivel de seguimiento registrado en campo.",
      "GPS points with highest people volume · full dataset.": "Puntos GPS con mayor volumen de personas · dataset completo.",
      "People and groups in transit per period.": "Personas y grupos en tránsito por período.",
      "Incident & Needs dashboard. Incident frequency, detected needs and event type distribution.": "Dashboard de Incidentes y Necesidades.",
      "Mobility Evidence & Approximate Distance": "Evidencia de movilidad y distancia aproximada",
      "Approximate movement distance between ordered points from the same testimony · source: trajectories.json": "Distancia aproximada de movimiento entre puntos ordenados del mismo testimonio · fuente: trajectories.json",
      "Testimonies observed": "Testimonios observados",
      "Tracks with 2+ points": "Trayectorias con 2+ puntos",
      "Avg. approx. distance": "Distancia aprox. media",
      "Incident types tracked": "Tipos de incidente registrados",
      "Events in window": "Eventos en ventana",
      "Loading summary…": "Cargando resumen…",
      "home.subtitle": "Dashboards apoyados por contratos KPI generados en Python y una API local opcional.",
      "home.initial_load_kicker": "CARGA INICIAL DE DATOS",
      "home.initial_load_title": "Ventana del GET a BBDD",
      "home.initial_load_text": "Elige la ventana temporal grande que se pediría a la base de datos. Los filtros de los dashboards trabajarán dentro de este dataset cargado.",
      "home.from": "Desde",
      "home.to": "Hasta",
      "home.max_records": "Máx. registros recomendado",
      "home.max_records_hint": "Se usa como umbral visual de rendimiento. Puedes continuar aunque la estimación sea superior.",
      "home.save_window": "Guardar ventana de carga",
      "home.refresh_check": "Comprobar tamaño",
      "home.use_full_dataset": "Usar dataset completo",
      "home.clear_window": "Borrar ventana guardada",
      "INITIAL DATA LOAD": "CARGA INICIAL DE DATOS",
      "Database GET window": "Ventana del GET a BBDD",
      "Choose the large date window that would be requested from the database. Dashboard filters will work inside this loaded dataset.": "Elige la ventana temporal grande que se pediría a la base de datos. Los filtros de los dashboards trabajarán dentro de este dataset cargado.",
      "From": "Desde",
      "To": "Hasta",
      "Max records allowed": "Máximo de registros permitido",
      "Recommended max records": "Máx. registros recomendado",
      "Used as a performance warning threshold. You can continue even if the estimate is higher.": "Se usa como umbral visual de rendimiento. Puedes continuar aunque la estimación sea superior.",
      "Save load window": "Guardar ventana de carga",
      "Check size": "Comprobar tamaño",
      "Use full dataset": "Usar dataset completo",
      "Clear saved window": "Borrar ventana guardada"
    }
  };

  function lang() {
    try { return window.HFOPrefs && window.HFOPrefs.load().language === "es" ? "es" : "en"; }
    catch (_) { return "en"; }
  }

  function t(text, vars) {
    let out = lang() === "es" ? (translations.es[text] || text) : text;
    Object.entries(vars || {}).forEach(function (entry) {
      out = out.replaceAll("{" + entry[0] + "}", entry[1] == null ? "" : entry[1]);
    });
    return out;
  }

  function translateStatic() {
    document.documentElement.lang = lang();
    if (document.title) document.title = t(document.title);
    document.querySelectorAll("body *").forEach(function (el) {
      const explicitKey = el.dataset.i18n;
      if (explicitKey) {
        const translated = lang() === "es" ? (translations.es[explicitKey] || translations.es[el.textContent.trim()]) : null;
        if (!el.dataset.i18nOriginal) el.dataset.i18nOriginal = el.textContent.trim();
        if (translated) {
          if (el.children.length > 0) {
            const firstTextNode = Array.from(el.childNodes).find(function (node) { return node.nodeType === Node.TEXT_NODE; });
            if (firstTextNode) firstTextNode.textContent = translated + " ";
            else el.insertBefore(document.createTextNode(translated + " "), el.firstChild);
          } else {
            el.textContent = translated;
          }
        } else if (lang() !== "es" && el.dataset.i18nOriginal && el.children.length === 0) {
          el.textContent = el.dataset.i18nOriginal;
        }
        return;
      }
      if (el.children.length > 0) return;
      const original = el.dataset.i18nOriginal || el.textContent.trim();
      if (!original) return;
      if (!el.dataset.i18nOriginal && translations.es[original]) el.dataset.i18nOriginal = original;
      const key = el.dataset.i18nOriginal;
      if (key) el.textContent = t(key);
    });
    if (window.HFOPrefs && window.HFOPrefs.applyTheme) {
      window.HFOPrefs.applyTheme(window.HFOPrefs.load().theme);
    }
  }

  function init() {
    translateStatic();
    window.addEventListener("dashboardPrefsChanged", translateStatic);
  }

  window.HFOI18n = { t, translateStatic, init, lang };
  document.addEventListener("DOMContentLoaded", init);
})();
