(function () {
  "use strict";

  const HTML2CANVAS_CDN = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  const JSPDF_CDN = "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js";
  const REPORT_WIDTH = 1240;
  const REPORT_HEIGHT = 1754;

  const TEXT = {
    en: {
      exportPng: "PNG",
      exportChartPdf: "PDF",
      exportCsv: "CSV",
      exportDashboardCsv: "Export CSV data",
      exportPdf: "Export PDF report",
      exporting: "Exporting...",
      exportedReport: "Human Flow Observatory | Analytical Report",
      generated: "Generated",
      timeRange: "Time range",
      regions: "Regions",
      granularity: "Granularity",
      source: "Source",
      theme: "Theme",
      allRegions: "All regions",
      all: "All",
      light: "Light",
      dark: "Dark",
      page: "Page",
      kpis: "Key indicators",
      visualizations: "Visualizations",
      tables: "Tables",
      noCharts: "No charts available for export.",
      noData: "No data available for export.",
      chartData: "Chart data",
      dashboardData: "Dashboard data",
      filtersApplied: "Filters applied",
      reportSubtitle: "Automatic report generated from the current filtered dashboard view.",
      chartSubtitle: "Export generated from the current filtered chart view.",
      tableSubtitle: "Export generated from the current filtered table view.",
      currentView: "Current view",
      tableData: "Table data",
      reportFooter: "Human Flow Observatory · HFO Analytics",
      errorExport: "Unable to complete the export.",
      filenameReport: "report",
      filenameData: "data",
      last30: "Last 30 days",
      last90: "Last 90 days",
      last180: "Last 180 days",
      last365: "Last 365 days",
      custom: "Custom"
    },
    es: {
      exportPng: "PNG",
      exportChartPdf: "PDF",
      exportCsv: "CSV",
      exportDashboardCsv: "Exportar datos CSV",
      exportPdf: "Exportar informe PDF",
      exporting: "Exportando...",
      exportedReport: "Human Flow Observatory | Informe analítico",
      generated: "Generado",
      timeRange: "Rango temporal",
      regions: "Regiones",
      granularity: "Granularidad",
      source: "Fuente",
      theme: "Modo",
      allRegions: "Todas las regiones",
      all: "Todo",
      light: "Claro",
      dark: "Oscuro",
      page: "Página",
      kpis: "Indicadores clave",
      visualizations: "Visualizaciones",
      tables: "Tablas",
      noCharts: "No hay gráficas disponibles para exportar.",
      noData: "No hay datos disponibles para exportar.",
      chartData: "Datos de la gráfica",
      dashboardData: "Datos del dashboard",
      filtersApplied: "Filtros aplicados",
      reportSubtitle: "Informe automático generado desde la vista filtrada actual del dashboard.",
      chartSubtitle: "Exportación generada desde la vista filtrada actual de la gráfica.",
      tableSubtitle: "Exportación generada desde la vista filtrada actual de la tabla.",
      currentView: "Vista actual",
      tableData: "Datos de la tabla",
      reportFooter: "Human Flow Observatory · HFO Analytics",
      errorExport: "No se ha podido completar la exportación.",
      filenameReport: "informe",
      filenameData: "datos",
      last30: "Últimos 30 días",
      last90: "Últimos 90 días",
      last180: "Últimos 180 días",
      last365: "Últimos 365 días",
      custom: "Personalizado"
    }
  };

  function getPrefs() {
    try {
      if (window.HFOPrefs && typeof window.HFOPrefs.load === "function") return window.HFOPrefs.load();
      const raw = localStorage.getItem("hfo_dashboard_prefs");
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function getLang() {
    return getPrefs().language === "es" ? "es" : "en";
  }

  function t(key) {
    const lang = getLang();
    return TEXT[lang][key] || TEXT.en[key] || key;
  }

  function getThemeMode() {
    const prefs = getPrefs();
    if (prefs.theme === "light" || prefs.theme === "dark") return prefs.theme;
    if (document.body.classList.contains("light-mode")) return "light";
    return "dark";
  }

  function getThemeTokens(mode = getThemeMode()) {
    if (mode === "light") {
      return {
        page: "#f4f8ff",
        surface: "#ffffff",
        surface2: "#eef4ff",
        border: "#cfdbef",
        text: "#0f172a",
        muted: "#475569",
        accent: "#2563eb",
        accentText: "#ffffff",
        pill: "#eaf2ff"
      };
    }
    return {
      page: "#06122a",
      surface: "#0f2348",
      surface2: "#122b57",
      border: "#2b4b84",
      text: "#f8fbff",
      muted: "#c2d1f1",
      accent: "#75b8ff",
      accentText: "#07152d",
      pill: "#17366d"
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeFilename(value) {
    return String(value || "hfo-export")
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 110);
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const existing = Array.from(document.scripts).find((script) => script.src === src);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.loaded = "false";
      script.addEventListener("load", () => {
        script.dataset.loaded = "true";
        resolve();
      });
      script.addEventListener("error", () => reject(new Error(`Unable to load ${src}`)), { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureExportLibraries(requirePdf = false) {
    if (!window.html2canvas) await loadScriptOnce(HTML2CANVAS_CDN);
    if (requirePdf && !(window.jspdf && window.jspdf.jsPDF) && !window.jsPDF) {
      await loadScriptOnce(JSPDF_CDN);
    }
    if (!window.html2canvas) throw new Error("html2canvas could not be loaded.");
    if (requirePdf && !(window.jspdf && window.jspdf.jsPDF) && !window.jsPDF) {
      throw new Error("jsPDF could not be loaded.");
    }
  }

  function injectExportStyles() {
    if (document.getElementById("hfo-export-styles")) return;
    const style = document.createElement("style");
    style.id = "hfo-export-styles";
    style.textContent = `
      .hfo-export-actions,
      .hfo-panel-export-actions,
      .hfo-page-export-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .hfo-panel-export-actions{justify-content:flex-end;margin:8px 0 12px}
      .hfo-page-export-actions{justify-content:flex-end}
      .hfo-export-btn{
        border:1px solid var(--line,#d1d9e6);border-radius:999px;padding:8px 12px;font:inherit;
        font-size:13px;font-weight:800;cursor:pointer;transition:all .16s ease;min-height:36px;
        background:var(--accent,#6fb7ff);color:#06122a;box-shadow:0 8px 20px rgba(37,99,235,.16)
      }
      .hfo-export-btn.secondary{background:transparent;color:var(--text,#f8fbff);border-color:var(--line,#456);box-shadow:none}
      body.light-mode .hfo-export-btn.secondary{color:#1e293b}
      .hfo-export-btn:hover{transform:translateY(-1px);filter:brightness(1.03)}
      .hfo-export-btn:disabled{opacity:.7;cursor:wait;transform:none}
      .hfo-page-export-actions .hfo-export-btn{white-space:nowrap}
      .hfo-page-export-actions [data-export-pdf]{order:1}
      .hfo-page-export-actions [data-export-dashboard-csv]{order:2}
      .hfo-export-report-root{position:fixed;top:0;left:-200vw;width:${REPORT_WIDTH}px;z-index:-1}
      .hfo-export-report-root,
      .hfo-export-single-root{position:fixed;top:0;left:-200vw;z-index:-1}
      .hfo-export-page{
        width:${REPORT_WIDTH}px;height:${REPORT_HEIGHT}px;box-sizing:border-box;padding:54px 58px;overflow:hidden;
        font-family:Inter,Segoe UI,Arial,sans-serif;background:var(--exp-page);color:var(--exp-text)
      }
      .hfo-export-single-root{width:1180px}
      .hfo-export-report-root.theme-light,
      .hfo-export-single-root.theme-light{--exp-page:#f4f8ff;--exp-surface:#ffffff;--exp-surface-2:#eef4ff;--exp-border:#cfdbef;--exp-text:#0f172a;--exp-muted:#475569;--exp-accent:#2563eb;--exp-accent-text:#ffffff;--exp-pill:#eaf2ff}
      .hfo-export-report-root.theme-dark,
      .hfo-export-single-root.theme-dark{--exp-page:#06122a;--exp-surface:#0f2348;--exp-surface-2:#122b57;--exp-border:#2b4b84;--exp-text:#f8fbff;--exp-muted:#c2d1f1;--exp-accent:#75b8ff;--exp-accent-text:#07152d;--exp-pill:#17366d}
      .hfo-export-header{background:var(--exp-surface);border:1px solid var(--exp-border);border-radius:24px;padding:28px 30px;margin-bottom:22px}
      .hfo-export-header-row{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}
      .hfo-export-kicker{font-size:13px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:var(--exp-accent);margin-bottom:8px}
      .hfo-export-title{font-size:32px;line-height:1.15;margin:0;color:var(--exp-text)}
      .hfo-export-subtitle{margin:10px 0 0;color:var(--exp-muted);font-size:16px;line-height:1.45}
      .hfo-export-meta{font-size:13px;color:var(--exp-muted);font-weight:700;white-space:nowrap}
      .hfo-export-chip-row{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
      .hfo-export-chip{display:inline-flex;gap:8px;align-items:center;padding:8px 12px;border-radius:999px;background:var(--exp-pill);border:1px solid var(--exp-border);font-size:13px;color:var(--exp-text)}
      .hfo-export-chip strong{color:var(--exp-text)}
      .hfo-export-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:22px}
      .hfo-export-kpi{background:var(--exp-surface);border:1px solid var(--exp-border);border-radius:20px;padding:18px 18px 16px}
      .hfo-export-kpi-label{font-size:12px;line-height:1.4;text-transform:uppercase;letter-spacing:.05em;color:var(--exp-muted);font-weight:800}
      .hfo-export-kpi-value{font-size:28px;line-height:1.15;color:var(--exp-text);font-weight:850;margin-top:10px;word-break:break-word}
      .hfo-export-section-title{font-size:22px;color:var(--exp-text);margin:6px 0 14px}
      .hfo-export-chart-stack{display:grid;grid-template-columns:1fr;gap:16px}
      .hfo-export-chart-card,.hfo-export-table-card,.hfo-export-single-card{background:var(--exp-surface);border:1px solid var(--exp-border);border-radius:24px;padding:22px}
      .hfo-export-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
      .hfo-export-card-title{font-size:20px;font-weight:800;color:var(--exp-text);margin:0 0 8px}
      .hfo-export-note{font-size:14px;line-height:1.5;color:var(--exp-muted);margin:0 0 14px;min-height:20px}
      .hfo-export-chart-img-wrap{background:var(--exp-surface-2);border:1px solid var(--exp-border);border-radius:18px;padding:16px;display:flex;align-items:center;justify-content:center;min-height:300px}
      .hfo-export-chart-img{max-width:100%;max-height:400px;display:block}
      .hfo-export-table{width:100%;border-collapse:collapse;font-size:13px;color:var(--exp-text)}
      .hfo-export-table th,.hfo-export-table td{border:1px solid var(--exp-border);padding:8px 10px;text-align:left;vertical-align:top}
      .hfo-export-table thead th{background:var(--exp-surface-2);font-weight:800}
      .hfo-export-table tbody tr:nth-child(even){background:rgba(127,127,127,.05)}
      .hfo-export-footer{position:absolute;left:58px;right:58px;bottom:30px;padding-top:12px;border-top:1px solid var(--exp-border);display:flex;justify-content:space-between;font-size:12px;color:var(--exp-muted)}
      .hfo-export-empty{background:var(--exp-surface);border:1px dashed var(--exp-border);border-radius:22px;padding:36px;color:var(--exp-muted);font-size:16px}
      .hfo-export-single-card{padding:26px}
      .hfo-export-single-card .hfo-export-chart-img-wrap{min-height:440px}
      .hfo-export-single-card .hfo-export-note{min-height:0}
      .hfo-export-hidden{display:none !important}
    `;
    document.head.appendChild(style);
  }

  function showExportError(message, error) {
    console.error(message, error || "");
    alert(message);
  }

  function isVisible(element) {
    if (!element) return false;
    if (element.closest(".hfo-export-hidden, .hfo-export-report-root, .hfo-export-single-root")) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getDashboardTitle() {
    const h1 = document.querySelector("h1");
    if (h1 && h1.textContent.trim()) return h1.textContent.trim();
    return document.title.replace(/^HFO Analytics\s*[-—]?\s*/i, "").trim() || "HFO Analytics";
  }

  function getDashboardSubtitle() {
    const subtitle = document.querySelector(".subtitle");
    if (subtitle && subtitle.textContent.trim()) return subtitle.textContent.trim();
    const paragraph = document.querySelector("header p, main > p");
    if (paragraph && paragraph.textContent.trim()) return paragraph.textContent.trim();
    return t("reportSubtitle");
  }

  function getCurrentTimeLabel() {
    return new Date().toLocaleString(getLang() === "es" ? "es-ES" : "en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getTimeRangeLabel(prefs) {
    const selected = prefs.selectedTimeRange || prefs.timeRange || "all";
    if (selected === "last30" || selected === "30d") return t("last30");
    if (selected === "last90" || selected === "90d") return t("last90");
    if (selected === "last180" || selected === "180d") return t("last180");
    if (selected === "last365" || selected === "365d") return t("last365");
    if (selected === "custom") {
      const from = prefs.customFrom || prefs.fromDate || "";
      const to = prefs.customTo || prefs.toDate || "";
      if (from || to) return `${t("custom")}: ${from || "—"} → ${to || "—"}`;
      return t("custom");
    }
    return t("all");
  }

  function getRegionLabel(prefs) {
    const regions = prefs.selectedRegions || prefs.regions || [];
    if (Array.isArray(regions) && regions.length) return regions.join(", ");
    return t("allRegions");
  }

  function getGranularityLabel(prefs) {
    const value = (prefs.selectedGranularity || prefs.granularity || "").toString();
    return value ? value.charAt(0).toUpperCase() + value.slice(1) : "—";
  }

  function inferSourceLabel() {
    const labelCard = Array.from(document.querySelectorAll(".card, .panel, .info-card"))
      .find((card) => /source/i.test(card.textContent || ""));
    if (!labelCard) return "data source";
    const lines = labelCard.textContent.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    const sourceLine = lines.find((line) => !/^source$/i.test(line));
    return sourceLine || "data source";
  }

  function buildFilterSummary(extra = {}) {
    const prefs = getPrefs();
    return [
      { label: t("timeRange"), value: getTimeRangeLabel(prefs) },
      { label: t("regions"), value: getRegionLabel(prefs) },
      { label: t("granularity"), value: getGranularityLabel(prefs) },
      { label: t("theme"), value: getThemeMode() === "light" ? t("light") : t("dark") },
      { label: t("source"), value: extra.source || inferSourceLabel() },
      { label: t("generated"), value: getCurrentTimeLabel() }
    ].filter((chip) => chip.value);
  }

  function getVisibleDateRangeForFilename(prefs) {
    const fromInput = document.querySelector('[data-filter-from], #filterFrom, #fromDate, input[name="from"]');
    const toInput = document.querySelector('[data-filter-to], #filterTo, #toDate, input[name="to"]');
    const from = prefs.customFrom || prefs.fromDate || fromInput?.value || "";
    const to = prefs.customTo || prefs.toDate || toInput?.value || "";
    if (from && to) return `${from}-to-${to}`;
    return getTimeRangeLabel(prefs);
  }

  function getFilenameContext() {
    const prefs = getPrefs();
    const dashboard = safeFilename(getDashboardTitle());
    const range = safeFilename(getVisibleDateRangeForFilename(prefs));
    const regions = safeFilename(getRegionLabel(prefs));
    return { dashboard, range: range || "all", regions: regions || "all-regions" };
  }

  function findPanelForElement(element) {
    return (
      element.closest(".panel") ||
      element.closest(".card") ||
      element.closest("section") ||
      element.parentElement ||
      document.body
    );
  }

  function getElementTitle(element, fallbackPrefix = "Item") {
    const panel = findPanelForElement(element);
    const titleElement = panel.querySelector("h2, h3, .section-title, .panel-title, .chart-title, caption");
    return titleElement?.textContent.trim() || `${fallbackPrefix}`;
  }

  function getElementNote(element) {
    const panel = findPanelForElement(element);
    const candidates = [
      ".panel-subtitle",
      ".small",
      ".chart-note",
      ".caption",
      "p"
    ];
    for (const selector of candidates) {
      const node = panel.querySelector(selector);
      if (node && node.textContent.trim()) return node.textContent.trim();
    }
    return "";
  }

  function getChartInstance(canvas) {
    if (!canvas) return null;
    if (canvas._ci) return canvas._ci;
    if (window.Chart && typeof window.Chart.getChart === "function") {
      return window.Chart.getChart(canvas) || null;
    }
    return null;
  }

  function cloneJson(value, fallback) {
    try {
      if (typeof structuredClone === "function") return structuredClone(value);
    } catch (error) {
      // Fall back to JSON cloning below.
    }
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return fallback;
    }
  }

  function applyChartThemeToOptions(options, tokens) {
    const themed = options || {};
    themed.responsive = false;
    themed.maintainAspectRatio = false;
    themed.animation = false;
    themed.color = tokens.text;

    themed.plugins = themed.plugins || {};
    themed.plugins.legend = themed.plugins.legend || {};
    themed.plugins.legend.labels = {
      ...(themed.plugins.legend.labels || {}),
      color: tokens.text,
      boxWidth: 14,
      boxHeight: 14,
      font: { size: 13, weight: "700" }
    };
    themed.plugins.title = themed.plugins.title || {};
    themed.plugins.title.color = tokens.text;
    themed.plugins.subtitle = themed.plugins.subtitle || {};
    themed.plugins.subtitle.color = tokens.muted;
    themed.plugins.tooltip = themed.plugins.tooltip || {};
    themed.plugins.tooltip.backgroundColor = getThemeMode() === "dark" ? "#020617" : "#ffffff";
    themed.plugins.tooltip.titleColor = getThemeMode() === "dark" ? "#ffffff" : "#0f172a";
    themed.plugins.tooltip.bodyColor = getThemeMode() === "dark" ? "#e5eefc" : "#1e293b";
    themed.plugins.tooltip.borderColor = tokens.border;
    themed.plugins.tooltip.borderWidth = 1;

    if (themed.scales) {
      Object.values(themed.scales).forEach((scale) => {
        if (!scale || typeof scale !== "object") return;
        scale.ticks = { ...(scale.ticks || {}), color: tokens.muted, font: { size: 12, weight: "650" } };
        scale.grid = { ...(scale.grid || {}), color: getThemeMode() === "dark" ? "rgba(194, 209, 241, 0.28)" : "rgba(100, 116, 139, 0.18)" };
        scale.title = { ...(scale.title || {}), color: tokens.text, font: { size: 13, weight: "750" } };
        scale.border = { ...(scale.border || {}), color: tokens.border };
      });
    }

    return themed;
  }

  function getChartDataUrl(canvas) {
    const chart = getChartInstance(canvas);
    const mode = getThemeMode();
    const tokens = getThemeTokens(mode);

    try {
      if (!chart || !window.Chart) {
        return canvas.toDataURL("image/png", 1);
      }

      const sourceWidth = canvas.width || canvas.getBoundingClientRect().width || 1000;
      const sourceHeight = canvas.height || canvas.getBoundingClientRect().height || 520;
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.max(1200, Math.round(sourceWidth));
      exportCanvas.height = Math.max(620, Math.round(sourceHeight));
      exportCanvas.style.width = `${exportCanvas.width}px`;
      exportCanvas.style.height = `${exportCanvas.height}px`;

      const data = cloneJson(chart.data, chart.data);
      const options = applyChartThemeToOptions(cloneJson(chart.options, {}), tokens);
      const backgroundPlugin = {
        id: "hfoExportContrastBackground",
        beforeDraw(chartInstance) {
          const ctx = chartInstance.ctx;
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.fillStyle = tokens.surface;
          ctx.fillRect(0, 0, chartInstance.width, chartInstance.height);
          ctx.restore();
        }
      };

      const tempChart = new window.Chart(exportCanvas, {
        type: chart.config.type,
        data,
        options,
        plugins: [backgroundPlugin]
      });
      tempChart.update("none");
      const dataUrl = exportCanvas.toDataURL("image/png", 1);
      tempChart.destroy();
      return dataUrl;
    } catch (error) {
      console.warn("Unable to render themed chart image, falling back to canvas.", error);
      try {
        if (chart && typeof chart.update === "function") chart.update("none");
        if (chart && typeof chart.toBase64Image === "function") return chart.toBase64Image("image/png", 1);
        return canvas.toDataURL("image/png", 1);
      } catch (fallbackError) {
        console.warn("Unable to read chart image", fallbackError);
        return "";
      }
    }
  }

  function cleanText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function collectKpiCards() {
    const selectors = [".cards .card", ".kpi-cards .card", ".metric-card", "[data-kpi-card]"];
    const found = [];
    const seen = new Set();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((card) => {
        if (seen.has(card) || !isVisible(card)) return;
        seen.add(card);
        if (card.querySelector("canvas, table")) return;
        const labelElement = card.querySelector(".label, [data-kpi-label], span, .kpi-label");
        const explicitValue = card.querySelector(".value, [data-kpi-value], .kpi-value");
        const label = cleanText(labelElement ? labelElement.textContent : "");
        let value = cleanText(explicitValue ? explicitValue.textContent : "");
        if (!value) {
          value = cleanText(card.textContent || "");
          if (label && value.toLowerCase().startsWith(label.toLowerCase())) value = cleanText(value.slice(label.length));
        }
        if (value || label) found.push({ label: label || "Metric", value: value || "—" });
      });
    });
    return found.slice(0, 12);
  }

  function collectChartItems() {
    return Array.from(document.querySelectorAll("canvas"))
      .filter((canvas) => isVisible(canvas))
      .filter((canvas) => !canvas.closest(".hfo-export-report-root, .hfo-export-single-root"))
      .map((canvas, index) => ({
        canvas,
        title: getElementTitle(canvas, `Chart ${index + 1}`),
        note: getElementNote(canvas),
        dataUrl: getChartDataUrl(canvas)
      }))
      .filter((item) => item.dataUrl);
  }

  function cloneTableForReport(table, maxRows = 18) {
    const cloned = table.cloneNode(true);
    cloned.querySelectorAll("button, input, select, textarea, svg").forEach((node) => node.remove());
    cloned.querySelectorAll("tbody").forEach((tbody) => {
      Array.from(tbody.querySelectorAll("tr")).slice(maxRows).forEach((row) => row.remove());
    });
    cloned.classList.add("hfo-export-table");
    return cloned.outerHTML;
  }

  function collectTableItems() {
    return Array.from(document.querySelectorAll("table"))
      .filter((table) => isVisible(table))
      .filter((table) => !table.closest(".hfo-export-report-root, .hfo-export-single-root"))
      .map((table, index) => {
        const rows = table.querySelectorAll("tbody tr").length;
        return {
          table,
          title: getElementTitle(table, `Table ${index + 1}`),
          note: rows > 18 ? `Showing first 18 rows of ${rows}.` : getElementNote(table),
          html: cloneTableForReport(table, 18)
        };
      });
  }

  function chartDataRows(chart) {
    if (!chart || !chart.data) return [];
    const labels = Array.isArray(chart.data.labels) ? chart.data.labels : [];
    const datasets = Array.isArray(chart.data.datasets) ? chart.data.datasets : [];
    return labels.map((label, index) => {
      const row = { label };
      datasets.forEach((dataset, dsIndex) => {
        const key = dataset.label || `series_${dsIndex + 1}`;
        const value = Array.isArray(dataset.data) ? dataset.data[index] : "";
        if (value && typeof value === "object") {
          row[key] = value.y ?? value.value ?? JSON.stringify(value);
        } else {
          row[key] = value ?? "";
        }
      });
      return row;
    });
  }

  function csvEscape(value) {
    const stringValue = value === null || value === undefined ? "" : String(value);
    if (/[",\n;]/.test(stringValue)) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }
    return stringValue;
  }

  function rowsToCsv(rows) {
    if (!rows.length) return "";
    const headers = Array.from(rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set()));
    const lines = [headers.map(csvEscape).join(",")];
    rows.forEach((row) => {
      lines.push(headers.map((key) => csvEscape(row[key] ?? "")).join(","));
    });
    return lines.join("\n");
  }

  function buildCsvSection(title, rows) {
    if (!rows || !rows.length) return `# ${title}\n`;
    return `# ${title}\n${rowsToCsv(rows)}\n`;
  }

  function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildHeaderHtml(title, subtitle) {
    const chips = buildFilterSummary();
    return `
      <header class="hfo-export-header">
        <div class="hfo-export-header-row">
          <div>
            <div class="hfo-export-kicker">${escapeHtml(t("exportedReport"))}</div>
            <h1 class="hfo-export-title">${escapeHtml(title)}</h1>
            <p class="hfo-export-subtitle">${escapeHtml(subtitle)}</p>
          </div>
          <div class="hfo-export-meta">${escapeHtml(getCurrentTimeLabel())}</div>
        </div>
        <div class="hfo-export-chip-row">
          ${chips.map((chip) => `<span class="hfo-export-chip"><strong>${escapeHtml(chip.label)}:</strong> ${escapeHtml(chip.value)}</span>`).join("")}
        </div>
      </header>
    `;
  }

  function buildSingleChartRoot(canvas) {
    const mode = getThemeMode();
    const title = getElementTitle(canvas, t("chartData"));
    const note = getElementNote(canvas) || t("chartSubtitle");
    const dataUrl = getChartDataUrl(canvas);
    if (!dataUrl) throw new Error(t("noData"));

    const root = document.createElement("div");
    root.className = `hfo-export-single-root theme-${mode}`;
    root.innerHTML = `
      <section class="hfo-export-single-card">
        ${buildHeaderHtml(title, t("chartSubtitle"))}
        <article class="hfo-export-chart-card">
          <h2 class="hfo-export-card-title">${escapeHtml(title)}</h2>
          <p class="hfo-export-note">${escapeHtml(note)}</p>
          <div class="hfo-export-chart-img-wrap">
            <img class="hfo-export-chart-img" src="${dataUrl}" alt="${escapeHtml(title)}" />
          </div>
        </article>
      </section>
    `;
    document.body.appendChild(root);
    return { root, title };
  }

  async function renderDomToCanvas(node, options = {}) {
    await ensureExportLibraries(Boolean(options.requirePdf));
    return window.html2canvas(node, {
      backgroundColor: null,
      scale: options.scale || 2,
      useCORS: true,
      logging: false,
      width: options.width || node.scrollWidth,
      height: options.height || node.scrollHeight,
      windowWidth: options.width || node.scrollWidth,
      windowHeight: options.height || node.scrollHeight
    });
  }

  async function exportChartPng(canvas) {
    const wrapper = buildSingleChartRoot(canvas);
    try {
      const imageCanvas = await renderDomToCanvas(wrapper.root, { scale: 2.2 });
      const ctx = getFilenameContext();
      const filename = `hfo-${ctx.dashboard}-${safeFilename(wrapper.title)}-${ctx.range}-${ctx.regions}-${todayIso()}.png`;
      downloadDataUrl(imageCanvas.toDataURL("image/png", 1), filename);
    } finally {
      wrapper.root.remove();
    }
  }

  async function exportChartPdf(canvas) {
    const wrapper = buildSingleChartRoot(canvas);
    try {
      await ensureExportLibraries(true);
      const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
      const imageCanvas = await renderDomToCanvas(wrapper.root, { scale: 2.2, requirePdf: true });
      const imageData = imageCanvas.toDataURL("image/png", 1);
      const orientation = imageCanvas.width >= imageCanvas.height ? "landscape" : "portrait";
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = Math.min(pageWidth / imageCanvas.width, pageHeight / imageCanvas.height);
      const imgWidth = imageCanvas.width * ratio;
      const imgHeight = imageCanvas.height * ratio;
      const x = (pageWidth - imgWidth) / 2;
      const y = (pageHeight - imgHeight) / 2;
      pdf.addImage(imageData, "PNG", x, y, imgWidth, imgHeight, undefined, "FAST");
      const ctx = getFilenameContext();
      const filename = `hfo-${ctx.dashboard}-${safeFilename(wrapper.title)}-${ctx.range}-${ctx.regions}-${todayIso()}.pdf`;
      pdf.save(filename);
    } finally {
      wrapper.root.remove();
    }
  }

  function exportChartCsv(canvas) {
    const chart = getChartInstance(canvas);
    const rows = chartDataRows(chart);
    if (!rows.length) throw new Error(t("noData"));

    const metadata = [
      { field: "dashboard", value: getDashboardTitle() },
      { field: "chart", value: getElementTitle(canvas, t("chartData")) },
      { field: "generated", value: getCurrentTimeLabel() },
      { field: "time_range", value: getTimeRangeLabel(getPrefs()) },
      { field: "regions", value: getRegionLabel(getPrefs()) },
      { field: "granularity", value: getGranularityLabel(getPrefs()) },
      { field: "theme", value: getThemeMode() }
    ];

    const content = `${buildCsvSection("metadata", metadata)}\n${buildCsvSection(getElementTitle(canvas, t("chartData")), rows)}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const ctx = getFilenameContext();
    const filename = `hfo-${ctx.dashboard}-${safeFilename(getElementTitle(canvas, t("chartData")))}-${ctx.range}-${ctx.regions}-${todayIso()}.csv`;
    downloadBlob(blob, filename);
  }

  function tableToRows(table) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => th.textContent.trim());
    return Array.from(table.querySelectorAll("tbody tr"))
      .map((row) => {
        const cells = Array.from(row.querySelectorAll("th, td")).map((cell) => cell.textContent.trim());
        const obj = {};
        if (headers.length) {
          headers.forEach((header, index) => { obj[header || `col_${index + 1}`] = cells[index] ?? ""; });
        } else {
          cells.forEach((cell, index) => { obj[`col_${index + 1}`] = cell; });
        }
        return obj;
      });
  }

  function exportTableCsv(table) {
    const rows = tableToRows(table);
    if (!rows.length) throw new Error(t("noData"));
    const metadata = [
      { field: "dashboard", value: getDashboardTitle() },
      { field: "table", value: getElementTitle(table, t("tableData")) },
      { field: "generated", value: getCurrentTimeLabel() },
      { field: "time_range", value: getTimeRangeLabel(getPrefs()) },
      { field: "regions", value: getRegionLabel(getPrefs()) },
      { field: "granularity", value: getGranularityLabel(getPrefs()) },
      { field: "theme", value: getThemeMode() }
    ];
    const content = `${buildCsvSection("metadata", metadata)}\n${buildCsvSection(getElementTitle(table, t("tableData")), rows)}`;
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const ctx = getFilenameContext();
    const filename = `hfo-${ctx.dashboard}-${safeFilename(getElementTitle(table, t("tableData")))}-${ctx.range}-${ctx.regions}-${todayIso()}.csv`;
    downloadBlob(blob, filename);
  }

  function exportDashboardCsv() {
    const metadataRows = buildFilterSummary().map((chip) => ({ label: chip.label, value: chip.value }));
    const kpiRows = collectKpiCards().map((item) => ({ metric: item.label, value: item.value }));
    const sections = [buildCsvSection("metadata", metadataRows)];
    if (kpiRows.length) sections.push(buildCsvSection("kpis", kpiRows));

    collectChartItems().forEach((item) => {
      const rows = chartDataRows(getChartInstance(item.canvas));
      if (rows.length) sections.push(buildCsvSection(item.title, rows));
    });
    collectTableItems().forEach((item) => {
      const rows = tableToRows(item.table);
      if (rows.length) sections.push(buildCsvSection(item.title, rows));
    });

    const content = sections.join("\n");
    if (!content.trim()) throw new Error(t("noData"));
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const ctx = getFilenameContext();
    const filename = `hfo-${ctx.dashboard}-${t("filenameData")}-${ctx.range}-${ctx.regions}-${todayIso()}.csv`;
    downloadBlob(blob, filename);
  }

  function waitForImages(root) {
    return Promise.all(Array.from(root.querySelectorAll("img")).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
  }

  function createReportPage(innerHtml) {
    const page = document.createElement("section");
    page.className = "hfo-export-page";
    page.innerHTML = innerHtml;
    return page;
  }

  function buildCardsHtml(cards) {
    if (!cards.length) return "";
    return `
      <section>
        <h2 class="hfo-export-section-title">${escapeHtml(t("kpis"))}</h2>
        <div class="hfo-export-cards">
          ${cards.map((card) => `
            <article class="hfo-export-kpi">
              <div class="hfo-export-kpi-label">${escapeHtml(card.label)}</div>
              <div class="hfo-export-kpi-value">${escapeHtml(card.value)}</div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function buildChartCardHtml(item) {
    return `
      <article class="hfo-export-chart-card">
        <h3 class="hfo-export-card-title">${escapeHtml(item.title)}</h3>
        <p class="hfo-export-note">${escapeHtml(item.note || "")}</p>
        <div class="hfo-export-chart-img-wrap">
          <img class="hfo-export-chart-img" src="${item.dataUrl}" alt="${escapeHtml(item.title)}" />
        </div>
      </article>
    `;
  }

  function buildTableCardHtml(item) {
    return `
      <article class="hfo-export-table-card">
        <h3 class="hfo-export-card-title">${escapeHtml(item.title)}</h3>
        <p class="hfo-export-note">${escapeHtml(item.note || "")}</p>
        ${item.html}
      </article>
    `;
  }

  function buildFooterHtml(pageNumber, totalPages) {
    return `<footer class="hfo-export-footer"><span>${escapeHtml(t("reportFooter"))}</span><span>${escapeHtml(t("page"))} ${pageNumber} / ${totalPages}</span></footer>`;
  }

  function buildMixedReportItem(item) {
    return item.kind === "chart" ? buildChartCardHtml(item) : buildTableCardHtml(item);
  }

  function buildReportDom() {
    const mode = getThemeMode();
    const charts = collectChartItems().map((item) => ({ ...item, kind: "chart" }));
    const tables = collectTableItems().map((item) => ({ ...item, kind: "table" }));
    const cards = collectKpiCards();
    const root = document.createElement("div");
    root.className = `hfo-export-report-root theme-${mode}`;

    const pages = [];
    if (!charts.length && !tables.length) {
      pages.push(createReportPage(`
        ${buildHeaderHtml(getDashboardTitle(), getDashboardSubtitle())}
        ${buildCardsHtml(cards)}
        <div class="hfo-export-empty">${escapeHtml(t("noCharts"))}</div>
      `));
    } else {
      const firstCharts = charts.slice(0, 2);
      pages.push(createReportPage(`
        ${buildHeaderHtml(getDashboardTitle(), getDashboardSubtitle())}
        ${buildCardsHtml(cards)}
        <h2 class="hfo-export-section-title">${escapeHtml(t("visualizations"))}</h2>
        <section class="hfo-export-chart-grid">
          ${firstCharts.map(buildChartCardHtml).join("")}
        </section>
      `));

      const remainingItems = [...charts.slice(2), ...tables];
      for (let i = 0; i < remainingItems.length; i += 3) {
        const group = remainingItems.slice(i, i + 3);
        const hasCharts = group.some((item) => item.kind === "chart");
        const hasTables = group.some((item) => item.kind === "table");
        const title = hasCharts && hasTables
          ? `${t("visualizations")} & ${t("tables")}`
          : hasCharts ? t("visualizations") : t("tables");
        pages.push(createReportPage(`
          <h2 class="hfo-export-section-title">${escapeHtml(title)}</h2>
          <section class="hfo-export-chart-stack">
            ${group.map(buildMixedReportItem).join("")}
          </section>
        `));
      }
    }

    const total = pages.length;
    pages.forEach((page, index) => {
      page.insertAdjacentHTML("beforeend", buildFooterHtml(index + 1, total));
      root.appendChild(page);
    });
    document.body.appendChild(root);
    return { root, pages };
  }

  async function exportCurrentPageToPdf(config = {}) {
    const button = config.triggerButton || null;
    const previous = button ? button.textContent : "";
    try {
      if (button) {
        button.disabled = true;
        button.textContent = t("exporting");
      }
      await ensureExportLibraries(true);
      const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
      const report = buildReportDom();
      await waitForImages(report.root);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < report.pages.length; i += 1) {
        const page = report.pages[i];
        const canvas = await renderDomToCanvas(page, {
          requirePdf: true,
          scale: 2,
          width: REPORT_WIDTH,
          height: REPORT_HEIGHT
        });
        const image = canvas.toDataURL("image/png", 1);
        if (i > 0) pdf.addPage("a4", "portrait");
        pdf.addImage(image, "PNG", 0, 0, pageWidth, pageHeight, undefined, "FAST");
      }
      const ctx = getFilenameContext();
      pdf.save(`hfo-${ctx.dashboard}-${t("filenameReport")}-${ctx.range}-${ctx.regions}-${todayIso()}.pdf`);
      report.root.remove();
    } catch (error) {
      showExportError(error.message || t("errorExport"), error);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = previous || t("exportPdf");
      }
    }
  }

  function findTopExportHost() {
    return (
      document.querySelector(".top-settings") ||
      document.querySelector(".page-actions") ||
      document.querySelector(".header-actions") ||
      document.querySelector(".topbar") ||
      document.querySelector(".toolbar") ||
      document.querySelector(".dashboard-nav") ||
      document.querySelector("header") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function normalizePageExportHost() {
    let host = document.querySelector(".hfo-page-export-actions");
    if (host) return host;
    let existingPdfButton = document.querySelector("#exportPagePdfBtn, [data-export-pdf], [data-export-page-pdf]");
    if (!existingPdfButton) {
      existingPdfButton = Array.from(document.querySelectorAll("button"))
        .find((button) => /export\s+(pdf\s+)?report|exportar\s+informe/i.test(button.textContent || ""));
    }
    if (existingPdfButton && existingPdfButton.parentElement) {
      host = document.createElement("div");
      host.className = "hfo-page-export-actions";
      existingPdfButton.parentElement.insertBefore(host, existingPdfButton);
      existingPdfButton.dataset.exportPdf = "true";
      existingPdfButton.dataset.exportPagePdf = "true";
      existingPdfButton.classList.add("hfo-export-btn");
      host.appendChild(existingPdfButton);
      return host;
    }
    const topHost = findTopExportHost();
    if (!topHost) return null;
    host = document.createElement("div");
    host.className = "hfo-page-export-actions";
    topHost.appendChild(host);
    return host;
  }

  function ensurePageButtons() {
    const host = normalizePageExportHost();
    if (!host) return;

    let pdfButton = host.querySelector("[data-export-pdf]");
    if (!pdfButton) {
      pdfButton = document.createElement("button");
      pdfButton.type = "button";
      pdfButton.className = "hfo-export-btn";
      pdfButton.dataset.exportPdf = "true";
      host.appendChild(pdfButton);
    }
    pdfButton.classList.add("hfo-export-btn");
    pdfButton.textContent = t("exportPdf");
    if (pdfButton.dataset.hfoBound !== "true") {
      pdfButton.dataset.hfoBound = "true";
      pdfButton.addEventListener("click", () => exportCurrentPageToPdf({ triggerButton: pdfButton }));
    }

    let csvButton = host.querySelector("[data-export-dashboard-csv]");
    if (!csvButton) {
      csvButton = document.createElement("button");
      csvButton.type = "button";
      csvButton.className = "hfo-export-btn secondary";
      csvButton.dataset.exportDashboardCsv = "true";
      host.appendChild(csvButton);
    }
    csvButton.textContent = t("exportDashboardCsv");
    if (csvButton.dataset.hfoBound !== "true") {
      csvButton.dataset.hfoBound = "true";
      csvButton.addEventListener("click", () => {
        try {
          exportDashboardCsv();
        } catch (error) {
          showExportError(error.message || t("errorExport"), error);
        }
      });
    }
  }

  function ensurePanelActions(panel) {
    let actions = panel.querySelector(".hfo-panel-export-actions");
    if (actions) return actions;
    actions = document.createElement("div");
    actions.className = "hfo-panel-export-actions";
    const title = panel.querySelector("h2, h3, .section-title");
    if (title && title.parentNode) title.parentNode.insertBefore(actions, title.nextSibling);
    else panel.insertBefore(actions, panel.firstChild);
    return actions;
  }

  function addButton(actions, key, onClick, secondary = false) {
    let button = actions.querySelector(`[data-export-kind="${key}"]`);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = `hfo-export-btn${secondary ? " secondary" : ""}`;
      button.dataset.exportKind = key;
      actions.appendChild(button);
    }
    const labelMap = {
      chart_png: t("exportPng"),
      chart_pdf: t("exportChartPdf"),
      chart_csv: t("exportCsv"),
      table_csv: t("exportCsv")
    };
    button.textContent = labelMap[key] || key;
    if (button.dataset.hfoBound !== "true") {
      button.dataset.hfoBound = "true";
      button.addEventListener("click", async () => {
        const previous = button.textContent;
        try {
          button.disabled = true;
          button.textContent = t("exporting");
          await onClick();
        } catch (error) {
          showExportError(error.message || t("errorExport"), error);
        } finally {
          button.disabled = false;
          button.textContent = previous;
        }
      });
    }
    return button;
  }

  function attachChartExportButtons() {
    Array.from(document.querySelectorAll("canvas"))
      .filter((canvas) => isVisible(canvas))
      .filter((canvas) => !canvas.closest(".hfo-export-report-root, .hfo-export-single-root"))
      .forEach((canvas) => {
        const panel = findPanelForElement(canvas);
        if (!panel) return;
        const actions = ensurePanelActions(panel);
        addButton(actions, "chart_png", () => exportChartPng(canvas));
        addButton(actions, "chart_pdf", () => exportChartPdf(canvas), true);
        addButton(actions, "chart_csv", () => Promise.resolve(exportChartCsv(canvas)), true);
      });
  }

  function attachTableExportButtons() {
    Array.from(document.querySelectorAll("table"))
      .filter((table) => isVisible(table))
      .filter((table) => !table.closest(".hfo-export-report-root, .hfo-export-single-root"))
      .forEach((table) => {
        const panel = findPanelForElement(table);
        if (!panel || panel.querySelector("canvas")) return;
        const actions = ensurePanelActions(panel);
        addButton(actions, "table_csv", () => Promise.resolve(exportTableCsv(table)), true);
      });
  }

  function refreshLabels() {
    document.querySelectorAll('[data-export-kind="chart_png"]').forEach((button) => { if (!button.disabled) button.textContent = t("exportPng"); });
    document.querySelectorAll('[data-export-kind="chart_pdf"]').forEach((button) => { if (!button.disabled) button.textContent = t("exportChartPdf"); });
    document.querySelectorAll('[data-export-kind="chart_csv"], [data-export-kind="table_csv"]').forEach((button) => { if (!button.disabled) button.textContent = t("exportCsv"); });
    const pdfButton = document.querySelector("[data-export-pdf]");
    if (pdfButton && !pdfButton.disabled) pdfButton.textContent = t("exportPdf");
    const csvButton = document.querySelector("[data-export-dashboard-csv]");
    if (csvButton && !csvButton.disabled) csvButton.textContent = t("exportDashboardCsv");
  }

  function rebuildPanelExportActions() {
    document.querySelectorAll(".hfo-panel-export-actions").forEach((node) => node.remove());
    document.querySelectorAll("canvas").forEach((canvas) => {
      canvas.dataset.hfoChartExportBound = "";
    });
    document.querySelectorAll("table").forEach((table) => {
      table.dataset.hfoTableExportBound = "";
    });
    document.querySelectorAll(".panel, .card, section").forEach((panel) => {
      panel.dataset.hfoChartExports = "";
    });
  }

  let hfoExportInitRunning = false;

  function init() {
    if (hfoExportInitRunning) return;
    hfoExportInitRunning = true;
    try {
      injectExportStyles();
      ensurePageButtons();
      rebuildPanelExportActions();
      attachChartExportButtons();
      attachTableExportButtons();
      refreshLabels();
    } finally {
      hfoExportInitRunning = false;
    }
  }

  function installLateRenderWatcher() {
    if (window.__hfoExportWatcherInstalled) return;
    window.__hfoExportWatcherInstalled = true;

    let timer = null;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { init(); } catch (error) { console.warn("HFO export init failed", error); }
      }, 250);
    };

    const observer = new MutationObserver((mutations) => {
      const relevant = mutations.some((mutation) =>
        Array.from(mutation.addedNodes || []).some((node) => {
          if (!(node instanceof Element)) return false;
          if (node.closest && node.closest(".hfo-export-report-root, .hfo-export-single-root, .hfo-panel-export-actions, .hfo-page-export-actions")) return false;
          return node.matches?.("canvas, table") || node.querySelector?.("canvas, table");
        })
      );
      if (relevant) schedule();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    [300, 900, 1800, 3200, 5000, 8000].forEach((delay) => setTimeout(schedule, delay));
  }

  window.HFOExport = {
    version: "2026-05-07-export-v6",
    ensureExportLibraries,
    exportChartPng,
    exportChartPdf,
    exportChartCsv,
    exportDashboardCsv,
    exportTableCsv,
    exportCurrentPageToPdf,
    init,
    installLateRenderWatcher
  };

  document.addEventListener("DOMContentLoaded", () => {
    init();
    installLateRenderWatcher();
    setTimeout(init, 700);
    setTimeout(init, 1800);
  });

  window.addEventListener("dashboardPrefsChanged", () => {
    setTimeout(init, 150);
  });

  window.addEventListener("hfo:dashboard-rendered", () => {
    setTimeout(init, 150);
  });

  window.addEventListener("load", () => {
    installLateRenderWatcher();
    setTimeout(init, 500);
  });
  console.info("HFO export module loaded", window.HFOExport.version);
})();
