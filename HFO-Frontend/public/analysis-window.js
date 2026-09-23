(function () {
  "use strict";

  const META_ENDPOINT = "/api/analytics/meta";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  let sliderMinDate = "";
  let sliderMaxDate = "";
  let sliderMaxIndex = 0;
  let sliderSyncing = false;

  function $(id) { return document.getElementById(id); }

  function toDateInputValue(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function fmt(iso) {
    return toDateInputValue(iso) || "n/a";
  }

  function parseDateValue(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const time = Date.UTC(year, month - 1, day);
    if (!Number.isFinite(time)) return null;
    return time;
  }

  function clamp(num, min, max) {
    return Math.min(Math.max(num, min), max);
  }

  function dateToIndex(value) {
    const minTime = parseDateValue(sliderMinDate);
    const time = parseDateValue(value);
    if (minTime == null || time == null) return 0;
    return clamp(Math.round((time - minTime) / MS_PER_DAY), 0, sliderMaxIndex);
  }

  function indexToDate(index) {
    const minTime = parseDateValue(sliderMinDate);
    if (minTime == null) return "";
    const date = new Date(minTime + Number(index || 0) * MS_PER_DAY);
    return date.toISOString().slice(0, 10);
  }

  function countText(counts) {
    if (!counts) return "";
    const parts = [];
    if (Number.isFinite(counts.testimonies)) parts.push(`${counts.testimonies.toLocaleString()} testimonies`);
    if (Number.isFinite(counts.events)) parts.push(`${counts.events.toLocaleString()} events`);
    if (Number.isFinite(counts.trajectories)) parts.push(`${counts.trajectories.toLocaleString()} trajectory points`);
    return parts.join(" · ");
  }

  async function loadMeta() {
    const base = window.HFOApi?.apiBase?.() || "";
    const url = `${base}${META_ENDPOINT}?_=${Date.now()}`;
    const data = await window.HFOApi.fetchJSON(url);
    window.HFOFilters?.rememberMeta?.(data?.meta);
    return data;
  }

  function setStatus(message, tone = "") {
    const el = $("analysisWindowStatus");
    if (!el) return;
    el.textContent = message || "";
    el.className = `analysis-window-status ${tone}`.trim();
  }

  function showModal(show) {
    const modal = $("analysisWindowModal");
    if (!modal) return;
    modal.classList.toggle("hide", !show);
  }

  function updateSummary(meta) {
    const prefs = window.HFOPrefs?.load?.() || {};
    const summary = $("analysisWindowSummary");
    const changeBtn = $("changeAnalysisWindowBtn");
    if (!summary) return;

    if (prefs.analysisWindowConfirmed && prefs.analysisWindowFrom && prefs.analysisWindowTo) {
      summary.innerHTML = `
        <strong>Analysis window:</strong>
        <span>${prefs.analysisWindowFrom} → ${prefs.analysisWindowTo}</span>
      `;
      if (changeBtn) changeBtn.classList.remove("hide");
    } else {
      const min = meta?.dataset_min_recorded_datetime || "";
      const max = meta?.dataset_max_recorded_datetime || "";
      summary.innerHTML = `
        <strong>Analysis window:</strong>
        <span>not selected${min && max ? ` · dataset ${fmt(min)} → ${fmt(max)}` : ""}</span>
      `;
      if (changeBtn) changeBtn.classList.remove("hide");
    }
  }

  function updateRangeVisual() {
    const startRange = $("analysisWindowStartRange");
    const endRange = $("analysisWindowEndRange");
    const fill = $("analysisWindowRangeFill");
    const hint = $("analysisWindowRangeHint");
    if (!startRange || !endRange || !fill) return;

    let start = Number(startRange.value || 0);
    let end = Number(endRange.value || 0);
    if (start > end) [start, end] = [end, start];

    const max = Math.max(1, Number(startRange.max || sliderMaxIndex || 1));
    const left = (start / max) * 100;
    const right = 100 - (end / max) * 100;
    fill.style.left = `${left}%`;
    fill.style.right = `${right}%`;

    if (hint) {
      hint.textContent = `Selected window: ${indexToDate(start)} → ${indexToDate(end)}`;
    }
  }

  function syncSliderFromInputs() {
    if (sliderSyncing) return;
    const from = $("analysisWindowFrom");
    const to = $("analysisWindowTo");
    const startRange = $("analysisWindowStartRange");
    const endRange = $("analysisWindowEndRange");
    if (!from || !to || !startRange || !endRange) return;

    sliderSyncing = true;
    const start = dateToIndex(from.value || sliderMinDate);
    const end = dateToIndex(to.value || sliderMaxDate);
    startRange.value = String(Math.min(start, end));
    endRange.value = String(Math.max(start, end));
    sliderSyncing = false;
    updateRangeVisual();
  }

  function syncInputsFromSlider(changed) {
    if (sliderSyncing) return;
    const from = $("analysisWindowFrom");
    const to = $("analysisWindowTo");
    const startRange = $("analysisWindowStartRange");
    const endRange = $("analysisWindowEndRange");
    if (!from || !to || !startRange || !endRange) return;

    sliderSyncing = true;
    let start = Number(startRange.value || 0);
    let end = Number(endRange.value || 0);

    if (start > end) {
      if (changed === "start") end = start;
      else start = end;
      startRange.value = String(start);
      endRange.value = String(end);
    }

    from.value = indexToDate(start);
    to.value = indexToDate(end);
    sliderSyncing = false;
    updateRangeVisual();
  }

  function setupRangeSlider(min, max) {
    const wrap = $("analysisWindowRangeWrap");
    const minLabel = $("analysisWindowRangeMin");
    const maxLabel = $("analysisWindowRangeMax");
    const startRange = $("analysisWindowStartRange");
    const endRange = $("analysisWindowEndRange");
    const from = $("analysisWindowFrom");
    const to = $("analysisWindowTo");
    if (!wrap || !startRange || !endRange || !min || !max) return;

    sliderMinDate = min;
    sliderMaxDate = max;
    const minTime = parseDateValue(min);
    const maxTime = parseDateValue(max);
    sliderMaxIndex = minTime != null && maxTime != null ? Math.max(0, Math.round((maxTime - minTime) / MS_PER_DAY)) : 0;

    [startRange, endRange].forEach((range) => {
      range.min = "0";
      range.max = String(sliderMaxIndex);
      range.step = "1";
    });

    if (minLabel) minLabel.textContent = min;
    if (maxLabel) maxLabel.textContent = max;
    wrap.classList.remove("hide");

    startRange.oninput = () => syncInputsFromSlider("start");
    endRange.oninput = () => syncInputsFromSlider("end");
    if (from) from.onchange = syncSliderFromInputs;
    if (to) to.onchange = syncSliderFromInputs;

    syncSliderFromInputs();
  }

  function fillInputs(payload) {
    const meta = payload?.meta || {};
    const counts = payload?.counts || {};
    const prefs = window.HFOPrefs?.load?.() || {};
    const min = toDateInputValue(meta.dataset_min_recorded_datetime);
    const max = toDateInputValue(meta.dataset_max_recorded_datetime);
    const from = $("analysisWindowFrom");
    const to = $("analysisWindowTo");
    const metaEl = $("analysisWindowMeta");

    if (from) {
      from.min = min;
      from.max = max;
      from.value = prefs.analysisWindowFrom || min;
    }
    if (to) {
      to.min = min;
      to.max = max;
      to.value = prefs.analysisWindowTo || max;
    }
    if (metaEl) {
      metaEl.textContent = `Available dataset: ${min || "n/a"} → ${max || "n/a"}${countText(counts) ? ` · ${countText(counts)}` : ""}`;
    }
    setupRangeSlider(min, max);
    updateSummary(meta);
  }

  function validateRange(fromValue, toValue) {
    if (!fromValue || !toValue) return "Select both start and end dates.";
    const start = new Date(`${fromValue}T00:00:00`).getTime();
    const end = new Date(`${toValue}T23:59:59`).getTime();
    if (Number.isNaN(start) || Number.isNaN(end)) return "Invalid date range.";
    if (start > end) return "Start date must be before end date.";
    return "";
  }

  function saveWindow(fromValue, toValue) {
    const error = validateRange(fromValue, toValue);
    if (error) {
      setStatus(error, "error");
      return;
    }

    window.HFOPrefs.save({
      analysisWindowConfirmed: true,
      analysisWindowFrom: fromValue,
      analysisWindowTo: toValue,
      selectedTimeRange: "all",
      customFrom: "",
      customTo: ""
    });
    setStatus("Analysis window saved. Dashboards will load only this date range.", "ok");
    showModal(false);
    updateSummary(window.HFOFilters?.readStoredMeta?.() || {});
  }

  function bind(payload) {
    const prefs = window.HFOPrefs?.load?.() || {};
    const openBtn = $("changeAnalysisWindowBtn");
    const saveBtn = $("saveAnalysisWindowBtn");
    const fullBtn = $("useFullDatasetBtn");
    const closeBtn = $("closeAnalysisWindowBtn");
    const from = $("analysisWindowFrom");
    const to = $("analysisWindowTo");
    const min = toDateInputValue(payload?.meta?.dataset_min_recorded_datetime);
    const max = toDateInputValue(payload?.meta?.dataset_max_recorded_datetime);

    openBtn?.addEventListener("click", () => {
      fillInputs(payload);
      showModal(true);
    });

    saveBtn?.addEventListener("click", () => saveWindow(from?.value || "", to?.value || ""));

    fullBtn?.addEventListener("click", () => {
      if (min && max) saveWindow(min, max);
    });

    closeBtn?.addEventListener("click", () => {
      if (prefs.analysisWindowConfirmed) showModal(false);
    });

    if (!prefs.analysisWindowConfirmed) showModal(true);
  }

  async function init() {
    if (!$("analysisWindowModal")) return;
    try {
      setStatus("Loading dataset metadata...", "");
      const payload = await loadMeta();
      fillInputs(payload);
      bind(payload);
      setStatus("Move the handles or type dates to select the analysis window.", "");
    } catch (error) {
      console.error("Unable to initialize analysis window", error);
      window.HFOAlerts?.show?.({
        title: "Unable to load dataset metadata.",
        detail: `${window.HFOApi?.backendHint?.() || "Start the Python backend."} Error: ${error.message}`,
        tone: "error"
      });
      setStatus("Unable to load metadata. Start python backend/api_server.py and refresh.", "error");
      showModal(true);
    }
  }

  window.HFOAnalysisWindow = { init };
})();
