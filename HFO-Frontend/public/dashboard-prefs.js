(function () {
  const KEY = "hfo_dashboard_prefs";
  const DEFAULTS = {
    language: "en",
    theme: "light",
    selectedTimeRange: "last30",
    customFrom: "",
    customTo: "",
    selectedRegions: [],
    selectedGranularity: "week",
    analysisFrom: "",
    analysisTo: "",
    analysisMaxRecords: 6000,
    analysisEstimatedRecords: null,
    analysisLoadWarning: false,
    analysisWindowSaved: false
  };

  function load() {
    try {
      const stored = localStorage.getItem(KEY);
      if (!stored) return { ...DEFAULTS };
      const parsed = JSON.parse(stored);
      return { ...DEFAULTS, ...parsed };
    } catch (error) {
      console.warn("Unable to load dashboard prefs", error);
      return { ...DEFAULTS };
    }
  }

  function save(update) {
    try {
      const current = load();
      const next = { ...current, ...update };
      if (next.selectedRegions instanceof Set) next.selectedRegions = Array.from(next.selectedRegions);
      if (!Array.isArray(next.selectedRegions)) next.selectedRegions = [];
      localStorage.setItem(KEY, JSON.stringify(next));
      applyTheme(next.theme);
      window.dispatchEvent(new CustomEvent("dashboardPrefsChanged", { detail: next }));
      return next;
    } catch (error) {
      console.warn("Unable to save dashboard prefs", error);
      return load();
    }
  }

  function reset() {
    try {
      localStorage.removeItem(KEY);
      const prefs = load();
      applyTheme(prefs.theme);
      window.dispatchEvent(new CustomEvent("dashboardPrefsChanged", { detail: prefs }));
      return prefs;
    } catch (error) {
      console.warn("Unable to reset dashboard prefs", error);
      return load();
    }
  }

  function applyTheme(theme) {
    if (!document.body) return;
    const mode = theme === "light" ? "light" : "dark";
    
    // Solo necesitamos añadir la clase "dark" si el modo es oscuro.
    // Si es claro, se la quitamos (el CSS usará el :root por defecto).
    document.body.classList.toggle("dark", mode === "dark");
    
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      const label = mode === "light" ? "Dark mode" : "Light mode";
      button.textContent = window.HFOI18n?.t?.(label) || label;
    });
  }

  function initThemeToggle(id) {
    const button = document.getElementById(id);
    if (!button) return;
    applyTheme(load().theme);
    button.addEventListener("click", () => {
      const current = load();
      save({ theme: current.theme === "light" ? "dark" : "light" });
    });
  }

  function initLanguageSelect(id, onChange) {
    const select = document.getElementById(id);
    if (!select) return;
    select.value = load().language;
    select.addEventListener("change", () => {
      const next = save({ language: select.value });
      window.HFOI18n?.translateStatic?.();
      if (typeof onChange === "function") onChange(next.language);
    });
  }

  function enforceAnalysisWindow() {
    const path = window.location?.pathname || "";
    const isDashboardPage = path.includes("/frontend/dashboards/") || path.includes("/dashboards/");
    const isHome = path.endsWith("/index.html") || path.endsWith("/dashboards/") || path.endsWith("/dashboards");
    const isDataReview = path.includes("data_review_viewer.html");
    if (!isDashboardPage || isHome || isDataReview) return;
    if (!hasAnalysisWindow(load())) {
      window.location.href = "./index.html?missingAnalysisWindow=1";
    }
  }

  function initBaseControls(options = {}) {
    applyTheme(load().theme);
    enforceAnalysisWindow();
    initThemeToggle(options.themeToggleId || "themeToggleBtn");
    initLanguageSelect(options.languageSelectId || "languageSelect", options.onLanguageChange);
  }

  function hasAnalysisWindow(prefs = load()) {
    return Boolean(prefs.analysisWindowSaved && prefs.analysisFrom && prefs.analysisTo);
  }

  function clearAnalysisWindow() {
    return save({
      analysisFrom: "",
      analysisTo: "",
      analysisEstimatedRecords: null,
      analysisLoadWarning: false,
      analysisWindowSaved: false
    });
  }

  window.HFOPrefs = { load, save, reset, applyTheme, initThemeToggle, initLanguageSelect, initBaseControls, hasAnalysisWindow, clearAnalysisWindow, enforceAnalysisWindow };
})();
