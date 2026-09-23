(function () {
  "use strict";

  const PREFS_KEY = "hfo_dashboard_prefs";

  function readPrefs() {
    try {
      return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    } catch (_) {
      return {};
    }
  }

  function isIndexPage() {
    const path = window.location.pathname.toLowerCase();
    return path.endsWith("/frontend/dashboards/") || path.endsWith("/frontend/dashboards/index.html") || path.endsWith("/dashboards/") || path.endsWith("/dashboards/index.html");
  }

  function isDashboardPage() {
    const path = window.location.pathname.toLowerCase();
    return path.includes("/dashboards/") && path.endsWith(".html") && !isIndexPage();
  }

  function requireAnalysisWindow() {
    if (!isDashboardPage()) return;
    const prefs = readPrefs();
    if (prefs.analysisWindowConfirmed && prefs.analysisWindowFrom && prefs.analysisWindowTo) return;

    try {
      sessionStorage.setItem("hfo_next_dashboard", window.location.pathname + window.location.search + window.location.hash);
    } catch (_) {
      // Ignore storage issues; redirect still works.
    }

    window.location.replace("./index.html");
  }

  requireAnalysisWindow();
})();
