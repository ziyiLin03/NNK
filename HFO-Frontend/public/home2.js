(function () {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;

  function lang() { return window.HFOPrefs?.load?.()?.language === "es" ? "es" : "en"; }
  function t(en, es) { return lang() === "es" ? (es || en) : en; }
  function fmt(n) { return window.HFOFormat?.number?.(n) || new Intl.NumberFormat(lang() === "es" ? "es-ES" : "en-US").format(Number(n || 0)); }
  function dateOnly(iso) { return iso ? String(iso).slice(0, 10) : ""; }
  function startOf(value) { return value ? `${value}T00:00:00` : ""; }
  function endOf(value) { return value ? `${value}T23:59:59` : ""; }
  function qs(id) { return document.getElementById(id); }

  let fullMeta = null;
  let lastCheck = null;
  let timer = null;

  function setStatus(message, kind) {
    const el = qs("analysisWindowStatus");
    if (!el) return;
    el.className = `status ${kind || ""}`.trim();
    el.textContent = message || "";
  }

  function setSummary(html) {
    const el = qs("analysisWindowSummary");
    if (el) el.innerHTML = html;
  }

  function setButtonsEnabled(enabled) {
    ["saveAnalysisWindowBtn", "useFullDatasetBtn"].forEach(id => {
      const button = qs(id);
      if (button) button.disabled = !enabled;
    });
  }

  function datasetMin() { return dateOnly(fullMeta?.dataset_min); }
  function datasetMax() { return dateOnly(fullMeta?.dataset_max); }

  function getForm() {
    return {
      from: qs("analysisFrom")?.value || "",
      to: qs("analysisTo")?.value || "",
      maxRecords: Math.max(1, Number(qs("analysisMaxRecords")?.value || 6000))
    };
  }

  function setForm(from, to, maxRecords) {
    if (qs("analysisFrom")) qs("analysisFrom").value = from || "";
    if (qs("analysisTo")) qs("analysisTo").value = to || "";
    if (qs("analysisMaxRecords")) qs("analysisMaxRecords").value = maxRecords || 6000;
  }

  function validateDateOrder(from, to) {
    if (!from || !to) return false;
    return new Date(`${from}T00:00:00`).getTime() <= new Date(`${to}T23:59:59`).getTime();
  }

  async function checkWindow() {
    const form = getForm();
    if (!fullMeta) {
      setStatus(t("Load dataset metadata first.", "Primero carga la metadata del dataset."), "error");
      return null;
    }
    if (!validateDateOrder(form.from, form.to)) {
      setStatus(t("Invalid date range.", "Rango de fechas no válido."), "error");
      setButtonsEnabled(false);
      return null;
    }

    setStatus(t("Checking selected load window...", "Comprobando ventana de carga seleccionada..."), "");
    const meta = await window.HFOApi.getMeta({ from: startOf(form.from), to: endOf(form.to), max_records: form.maxRecords });
    lastCheck = meta;

    const rawCounts = meta.counts ?? {};
const normalizedSources = Object.fromEntries(
  Object.entries(rawCounts).map(([name, val]) => [
    name,
    typeof val === "object" ? val : { records: val }
  ])
);

const normalized = {
  ...meta,
  estimated_records: meta.estimated_records 
    ?? Object.values(rawCounts).reduce((a, b) => a + (typeof b === "number" ? b : b.records ?? 0), 0),
  dataset_min: meta.meta?.dataset_min ?? meta.dataset_min,
  dataset_max: meta.meta?.dataset_max ?? meta.dataset_max,
  sources: meta.sources ?? normalizedSources,
};

    const parts = Object.entries(normalized.sources || {})
      .map(([name, src]) => `${name}: <strong>${fmt(src.records)}</strong>`)
      .join(" · ");
    setSummary(`${t("Selected load estimate", "Estimación de carga seleccionada")}: <strong>${fmt(normalized.estimated_records)}</strong> ${t("records", "registros")} · ${parts}`);

    if (normalized.too_large) {
      setStatus(t(
        `Warning: this load window contains ${fmt(normalized.estimated_records)} records, above the recommended threshold of ${fmt(form.maxRecords)}. You can still save and continue if the app can handle it.`,
        `Aviso: esta ventana contiene ${fmt(normalized.estimated_records)} registros, por encima del umbral recomendado de ${fmt(form.maxRecords)}. Puedes guardarla y continuar si la app lo puede soportar.`
      ), "warning");
      setButtonsEnabled(true);
      return normalized;
    }

    setStatus(t(
      `OK. Estimated load: ${fmt(normalized.estimated_records)} / ${fmt(form.maxRecords)} recommended records.`,
      `OK. Carga estimada: ${fmt(normalized.estimated_records)} / ${fmt(form.maxRecords)} registros recomendados.`
    ), "ok");
    setButtonsEnabled(true);
    return normalized;
  }

  function scheduleCheck() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => checkWindow().catch(err => {
      console.error(err);
      setButtonsEnabled(false);
      setStatus(t("Unable to check load window. Start python backend/api_server.py and refresh.", "No se puede comprobar la ventana de carga. Ejecuta python backend/api_server.py y refresca."), "error");
    }), 250);
  }

  async function saveWindow() {
    const meta = await checkWindow();
    const form = getForm();
    if (!meta) return;
    window.HFOPrefs.save({
      analysisFrom: form.from,
      analysisTo: form.to,
      analysisMaxRecords: form.maxRecords,
      analysisEstimatedRecords: meta.estimated_records,
      analysisLoadWarning: Boolean(meta.too_large),
      analysisWindowSaved: true,
      selectedTimeRange: "all",
      customFrom: form.from,
      customTo: form.to
    });
    renderSavedState();
    setStatus(meta.too_large
      ? t("Analysis window saved with warning. Dashboards will load this range, but performance may be slower.", "Ventana de análisis guardada con aviso. Los dashboards cargarán este rango, pero el rendimiento puede ser más lento.")
      : t("Analysis window saved. Dashboards will load data only inside this range.", "Ventana de análisis guardada. Los dashboards cargarán datos solo dentro de este rango."),
      meta.too_large ? "warning" : "ok"
    );
  }

  async function useFullDataset() {
    setForm(datasetMin(), datasetMax(), getForm().maxRecords);
    await saveWindow();
  }

  function clearWindow() {
    window.HFOPrefs.clearAnalysisWindow();
    renderSavedState();
    setStatus(t("Saved load window cleared. Select a new one before opening dashboards.", "Ventana de carga borrada. Selecciona una nueva antes de abrir los dashboards."), "error");
    setButtonsEnabled(false);
  }

  function renderSavedState() {
    const prefs = window.HFOPrefs.load();
    const saved = Boolean(prefs.analysisWindowSaved && prefs.analysisFrom && prefs.analysisTo);
    const el = qs("savedAnalysisWindow");
    if (!el) return;
    if (!saved) {
      el.innerHTML = `<strong>${t("No active initial load window.", "No hay ventana inicial de carga activa.")}</strong><br>${t("Choose a range and save it before opening dashboards.", "Elige un rango y guárdalo antes de abrir los dashboards.")}`;
      el.className = "analysis-saved-state warning";
      return;
    }
    const tone = prefs.analysisLoadWarning ? "warning" : "ok";
    const warningText = prefs.analysisLoadWarning
      ? `<br><strong>${t("Performance warning", "Aviso de rendimiento")}</strong>: ${t("selected load is above the recommended threshold.", "la carga seleccionada supera el umbral recomendado.")}`
      : "";
    el.innerHTML = `<strong>${t("Active initial load window", "Ventana inicial de carga activa")}</strong><br>${prefs.analysisFrom} → ${prefs.analysisTo} · ${fmt(prefs.analysisEstimatedRecords || 0)} / ${fmt(prefs.analysisMaxRecords || 6000)} ${t("recommended records", "registros recomendados")}${warningText}`;
    el.className = `analysis-saved-state ${tone}`;
  }

  function guardDashboardLinks() {
    document.querySelectorAll("[data-requires-analysis-window]").forEach(link => {
      link.addEventListener("click", event => {
        const prefs = window.HFOPrefs.load();
        if (!window.HFOPrefs.hasAnalysisWindow(prefs)) {
          event.preventDefault();
          setStatus(t("Select and save the initial data load window before opening a dashboard.", "Selecciona y guarda la ventana inicial de carga antes de abrir un dashboard."), "error");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      });
    });
  }

  async function init() {
    window.HFOPrefs.initBaseControls({ onLanguageChange: () => renderSavedState() });
    guardDashboardLinks();
    setButtonsEnabled(false);
    renderSavedState();

    try {
      setStatus(t("Loading dataset metadata...", "Cargando metadata del dataset..."), "");
      fullMeta = await window.HFOApi.getMeta({ max_records: getForm().maxRecords });
      const min = datasetMin();
      const max = datasetMax();
      ["analysisFrom", "analysisTo"].forEach(id => {
        const input = qs(id);
        if (!input) return;
        input.min = min;
        input.max = max;
      });

      const prefs = window.HFOPrefs.load();
      const defaultFrom = prefs.analysisFrom || new Date(new Date(`${max}T12:00:00`).getTime() - 365 * DAY_MS).toISOString().slice(0, 10);
      const boundedFrom = defaultFrom < min ? min : defaultFrom;
      setForm(boundedFrom, prefs.analysisTo || max, prefs.analysisMaxRecords || 6000);
      setSummary(`${t("Dataset coverage", "Cobertura del dataset")}: <strong>${min}</strong> → <strong>${max}</strong> · ${t("Full local mock total", "Total local mock completo")}: <strong>${fmt(fullMeta.estimated_records)}</strong> ${t("records", "registros")}`);
      scheduleCheck();
    } catch (error) {
      console.error(error);
      setStatus(t("Select the dates first.", "Selecciona las fechas primero."), "error");
      setButtonsEnabled(false);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    init();
    ["analysisFrom", "analysisTo", "analysisMaxRecords"].forEach(id => {
      const input = qs(id);
      if (!input) return;
      input.addEventListener("change", () => { scheduleCheck(); });
      input.addEventListener("input", scheduleCheck);
    });
    qs("saveAnalysisWindowBtn")?.addEventListener("click", () => saveWindow().catch(console.error));
    qs("refreshAnalysisEstimateBtn")?.addEventListener("click", () => checkWindow().catch(console.error));
    qs("useFullDatasetBtn")?.addEventListener("click", () => useFullDataset().catch(console.error));
    qs("clearAnalysisWindowBtn")?.addEventListener("click", clearWindow);
  });
})();
