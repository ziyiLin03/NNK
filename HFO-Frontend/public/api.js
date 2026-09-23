(function () {
  "use strict";

  const API_PATHS = {
    meta: "/api/analytics/meta",
    operational: "/api/analytics/operational-kpis",
    demographics: "/api/analytics/demographics-kpis",
    incidentNeeds: "/api/analytics/incident-needs",
    dataQuality: "/api/analytics/data-quality",
    mobilityRoute: "/api/analytics/mobility-route",
  };

  function withCacheBuster(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}_=${Date.now()}`;
  }

  function apiBase() {
  const host = window.location.hostname;
  const port = window.location.port;
  const customBase = window.API_BASE_URL;

  if (customBase) {
    return customBase;
  }

  if (host !== "127.0.0.1" && host !== "localhost") {
    return "https://hfobackend-production.up.railway.app";
  }

  if (port && port !== "8000") {
    return "http://localhost:8000";
  }

  return "";
}

  function backendHint() {
    return [
      "Dynamic filters require the Python analytics backend.",
      "Run: python backend/api_server.py",
      "Open: http://localhost:8000/frontend/dashboards/index.html",
      `Current page: ${window.location.origin}`,
    ].join(" ");
  }

  async function fetchJSON(url) {
    const response = await fetch(withCacheBuster(url), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!response.ok) {
      let detail = "";
      try {
        const body = await response.json();
        detail = body?.message || body?.error || JSON.stringify(body);
      } catch (_) {
        try { detail = await response.text(); } catch (__) { detail = ""; }
      }
      const message = detail ? `${response.status} ${response.statusText}: ${detail}` : `${response.status} ${response.statusText}`;
      throw new Error(message);
    }

    return response.json();
  }

  function buildQuery(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value) && value.length === 0) return;
      query.set(key, Array.isArray(value) ? value.join(",") : String(value));
    });
    const text = query.toString();
    return text ? `?${text}` : "";
  }

  async function fetchAnalytics(path, params = {}) {
    const url = `${apiBase()}${path}${buildQuery(params)}`;
    try {
      const data = await fetchJSON(url);
      window.HFOFilters?.rememberMeta?.(data?.meta);
      return { data, source: "api", url };
    } catch (apiError) {
      console.error("Analytics API request failed", { url, apiError });
      throw new Error(`${backendHint()} Requested URL: ${url}. Error: ${apiError.message}`);
    }
  }

  function getMeta(params) {
    return fetchJSON(`${apiBase()}${API_PATHS.meta}${buildQuery(params)}`);
  }

  function getOperational(params) {
    return fetchAnalytics(API_PATHS.operational, params);
  }

  function getDemographics(params) {
    return fetchAnalytics(API_PATHS.demographics, params);
  }

  function getIncidentNeeds(params) {
    return fetchAnalytics(API_PATHS.incidentNeeds, params);
  }

  function getDataQuality(params) {
    return fetchAnalytics(API_PATHS.dataQuality, params);
  }

  function getMobilityRoute(params) {
    return fetchAnalytics(API_PATHS.mobilityRoute, params);
  }

  const DASHBOARD_CONFIG = {
    operational: {
      endpoint: API_PATHS.operational,
      loading: "Loading operational KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
    operationalKpis: {
      endpoint: API_PATHS.operational,
      loading: "Loading operational KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
    demographics: {
      endpoint: API_PATHS.demographics,
      loading: "Loading demographics KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
    incidentNeeds: {
      endpoint: API_PATHS.incidentNeeds,
      loading: "Loading incident & needs KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
    dataQuality: {
      endpoint: API_PATHS.dataQuality,
      loading: "Loading data quality KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
    mobilityRoute: {
      endpoint: API_PATHS.mobilityRoute,
      loading: "Loading mobility KPIs...",
      loaded: "Loaded from analytics API.",
      statusId: "dashboardStatus",
    },
  };

  function status(statusId, message, tone = "") {
    if (!statusId || !message) return;
    const translated = window.HFOI18n?.t?.(message) || message;
    if (window.HFOFormat?.setStatus) window.HFOFormat.setStatus(statusId, translated, tone);
  }

  function dashboardParams(previousMeta = {}) {
    const prefs = window.HFOPrefs?.load?.() || {};
    return window.HFOFilters?.buildApiParams?.(previousMeta || {}, prefs) || {};
  }

  async function loadDashboard(kind, previousMeta = {}, options = {}) {
    const cfg = { ...(DASHBOARD_CONFIG[kind] || {}), ...(options || {}) };
    if (!cfg.endpoint) throw new Error(`Unknown dashboard kind: ${kind}`);
    const params = { ...dashboardParams(previousMeta), ...(options.extraParams || {}) };
    status(cfg.statusId, cfg.loading, "");
    const result = await fetchAnalytics(cfg.endpoint, params);
    status(cfg.statusId, cfg.loaded, "ok");
    return { ...result, params, kind };
  }

  function bindFilterReload(loadFn, delayMs = 80) {
    let timer = null;
    window.addEventListener("dashboardPrefsChanged", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(loadFn, delayMs);
    });
  }

  window.HFOApi = {
    fetchJSON,
    buildQuery,
    apiBase,
    backendHint,
    dashboardParams,
    loadDashboard,
    bindFilterReload,
    getMeta,
    getOperational,
    getDemographics,
    getIncidentNeeds,
    getDataQuality,
    getMobilityRoute,
  };
})();
