(function () {
  const RANGE_DAYS = { last1: 1, last7: 7, last30: 30, last90: 90, last180: 180, last365: 365 };

  function toDateInputValue(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(iso).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function startOfDateInput(value) { return value ? `${value}T00:00:00` : ""; }
  function endOfDateInput(value) { return value ? `${value}T23:59:59` : ""; }

  function metaMin(meta) { return meta?.dataset_min_recorded_datetime || meta?.dataset_min || meta?.window_from || null; }
  function metaMax(meta) { return meta?.dataset_max_recorded_datetime || meta?.dataset_max || meta?.window_to || null; }

  function analysisMin(prefs) { return prefs?.analysisWindowSaved && prefs?.analysisFrom ? startOfDateInput(prefs.analysisFrom) : null; }
  function analysisMax(prefs) { return prefs?.analysisWindowSaved && prefs?.analysisTo ? endOfDateInput(prefs.analysisTo) : null; }

  function maxIso(a, b) {
    if (!a) return b || "";
    if (!b) return a || "";
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
  }

  function minIso(a, b) {
    if (!a) return b || "";
    if (!b) return a || "";
    return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
  }

  function clampWindow(win, prefs) {
    const aMin = analysisMin(prefs);
    const aMax = analysisMax(prefs);
    let from = maxIso(win.from, aMin);
    let to = minIso(win.to, aMax);
    if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
      from = aMin || win.from;
      to = aMax || win.to;
    }
    return { from, to };
  }

  function computeWindow(meta, prefs) {
    // datasetMax from stale meta must NOT cap the "to" date for non-custom ranges.
    // New reports created after the last API response would be excluded if we did.
    // We use it only to floor "from" so we don't request before the dataset starts.
    const datasetMax = analysisMax(prefs) || metaMax(meta) || new Date().toISOString();
    const datasetMin = analysisMin(prefs) || metaMin(meta) || datasetMax;
    const nowIso = new Date().toISOString();
    const min = new Date(datasetMin);

    // "All" range: from dataset start to NOW (not stale datasetMax)
    if (prefs.selectedTimeRange === "all") return clampWindow({ from: datasetMin, to: nowIso }, prefs);
    if (prefs.selectedTimeRange === "custom") {
      return clampWindow({
        from: prefs.customFrom ? startOfDateInput(prefs.customFrom) : datasetMin,
        to: prefs.customTo ? endOfDateInput(prefs.customTo) : nowIso
      }, prefs);
    }

    // Time-range presets: always roll up to NOW so new reports are included
    const to = new Date(nowIso);
    const days = RANGE_DAYS[prefs.selectedTimeRange] || 30;
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return clampWindow({ from: (from < min ? min : from).toISOString(), to: nowIso }, prefs);
  }

  function isInWindow(iso, fromIso, toIso) {
    if (!iso) return false;
    const time = new Date(iso).getTime();
    const from = fromIso ? new Date(fromIso).getTime() : -Infinity;
    const to = toIso ? new Date(toIso).getTime() : Infinity;
    return time >= from && time <= to;
  }

  function renderTimeButtons(containerId, prefs) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll("[data-range]").forEach((button) => {
      button.classList.toggle("active", button.dataset.range === prefs.selectedTimeRange);
      button.onclick = () => window.HFOPrefs.save({ selectedTimeRange: button.dataset.range });
    });
  }

  function renderRegionButtons(containerId, regions, selectedRegions) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const selected = new Set(selectedRegions || []);
    container.innerHTML = "";

    const allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = `filter-button ${selected.size === 0 ? "active" : ""}`;
    allButton.textContent = window.HFOI18n?.t?.("All regions") || "All regions";
    allButton.addEventListener("click", () => window.HFOPrefs.save({ selectedRegions: [] }));
    container.appendChild(allButton);

    (regions || []).forEach((region) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter-button ${selected.has(region) ? "active" : ""}`;
      button.textContent = region;
      button.addEventListener("click", () => {
        const next = new Set(selected);
        if (next.has(region)) next.delete(region); else next.add(region);
        window.HFOPrefs.save({ selectedRegions: Array.from(next) });
      });
      container.appendChild(button);
    });
  }

  function bindCustomDateInputs(fromId, toId, prefs, meta) {
    const fromInput = document.getElementById(fromId);
    const toInput = document.getElementById(toId);
    if (!fromInput || !toInput) return;
    fromInput.value = prefs.customFrom || "";
    toInput.value = prefs.customTo || "";
    fromInput.onchange = () => window.HFOPrefs.save({ selectedTimeRange: "custom", customFrom: fromInput.value });
    toInput.onchange = () => window.HFOPrefs.save({ selectedTimeRange: "custom", customTo: toInput.value });
    bindDateRangeSlider(fromInput, toInput, prefs, meta || {});
  }

  function bindDateRangeSlider(fromInput, toInput, prefs, meta) {
    const parent = fromInput.closest(".range-inputs");
    if (!parent) return;
    const prefsNow = window.HFOPrefs?.load?.() || prefs || {};
    const minIso = analysisMin(prefsNow) || metaMin(meta);
    const maxIso = analysisMax(prefsNow) || metaMax(meta);
    if (!minIso || !maxIso) return;

    const minDate = new Date(minIso);
    const maxDate = new Date(maxIso);
    if (Number.isNaN(minDate.getTime()) || Number.isNaN(maxDate.getTime()) || minDate >= maxDate) return;

    let wrap = parent.querySelector(".date-range-slider");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "date-range-slider";
      wrap.innerHTML = `
        <div class="date-range-slider-label"><span data-slider-from></span><span data-slider-to></span></div>
        <div class="date-range-slider-controls">
          <input type="range" min="0" max="1000" step="1" data-slider-min>
          <input type="range" min="0" max="1000" step="1" data-slider-max>
        </div>`;
      parent.appendChild(wrap);
    }

    const minSlider = wrap.querySelector("[data-slider-min]");
    const maxSlider = wrap.querySelector("[data-slider-max]");
    const labelFrom = wrap.querySelector("[data-slider-from]");
    const labelTo = wrap.querySelector("[data-slider-to]");
    const totalMs = maxDate.getTime() - minDate.getTime();
    let commitTimer = null;

    function valueFromDate(dateText, fallback) {
      if (!dateText) return fallback;
      const date = new Date(`${dateText}T12:00:00`);
      if (Number.isNaN(date.getTime())) return fallback;
      return Math.round(((date.getTime() - minDate.getTime()) / totalMs) * 1000);
    }

    function dateFromValue(value) {
      const v = Math.max(0, Math.min(1000, Number(value)));
      const date = new Date(minDate.getTime() + (v / 1000) * totalMs);
      return date.toISOString().slice(0, 10);
    }

    let a = valueFromDate(prefs.customFrom, 0);
    let b = valueFromDate(prefs.customTo, 1000);
    if (prefs.selectedTimeRange !== "custom") {
      const win = computeWindow(meta, prefs);
      a = valueFromDate(toDateInputValue(win.from), 0);
      b = valueFromDate(toDateInputValue(win.to), 1000);
    }
    if (a > b) [a, b] = [b, a];
    minSlider.value = a;
    maxSlider.value = b;

    function getOrderedValues() {
      let left = Number(minSlider.value);
      let right = Number(maxSlider.value);
      if (left > right) [left, right] = [right, left];
      return { left, right, from: dateFromValue(left), to: dateFromValue(right) };
    }

    function syncLabels() {
      const current = getOrderedValues();
      if (labelFrom) labelFrom.textContent = current.from;
      if (labelTo) labelTo.textContent = current.to;
      fromInput.value = current.from;
      toInput.value = current.to;
    }

    function commit() {
      const current = getOrderedValues();
      fromInput.value = current.from;
      toInput.value = current.to;
      window.HFOPrefs.save({ selectedTimeRange: "custom", customFrom: current.from, customTo: current.to });
    }

    function scheduleCommit() {
      syncLabels();
      window.clearTimeout(commitTimer);
      commitTimer = window.setTimeout(commit, 180);
    }

    minSlider.oninput = scheduleCommit;
    maxSlider.oninput = scheduleCommit;
    minSlider.onchange = commit;
    maxSlider.onchange = commit;
    syncLabels();
  }

  function buildApiParams(meta, prefs) {
    const currentPrefs = prefs || window.HFOPrefs?.load?.() || {};
    const params = {};
    const win = computeWindow(meta || {}, currentPrefs);

    if (win.from) params.from = win.from;
    if (win.to) params.to = win.to;

    if (currentPrefs.analysisWindowSaved && currentPrefs.analysisFrom && currentPrefs.analysisTo) {
      params.load_from = startOfDateInput(currentPrefs.analysisFrom);
      params.load_to = endOfDateInput(currentPrefs.analysisTo);
      params.max_records = currentPrefs.analysisMaxRecords || 6000;
    }

    if (currentPrefs.selectedRegions?.length) params.regions = currentPrefs.selectedRegions;
    if (currentPrefs.selectedGranularity) params.granularity = currentPrefs.selectedGranularity;
    params.max_points = 120;
    return params;
  }

  window.HFOFilters = {
    computeWindow,
    isInWindow,
    renderTimeButtons,
    renderRegionButtons,
    bindCustomDateInputs,
    toDateInputValue,
    buildApiParams,
    startOfDateInput,
    endOfDateInput
  };
})();