(function () {
  "use strict";

  let output = null;
  let mobilityMetric = "people"; // people | testimonies
  let trackView = "distance";

  function lang() { try { return window.HFOPrefs?.load()?.language === "es" ? "es" : "en"; } catch (_) { return "en"; } }
  function t(en, es) { return lang() === "es" ? es : en; }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = String(value ?? "—"); }
  function setHTML(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html || ""; }
  function fmt(n) { return window.HFOFormat?.number(n) ?? String(n ?? "—"); }
  function esc(value) { return window.HFOFormat?.escapeHtml?.(value) || String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }

  function dateLabel(iso, granularity = "day") {
    const raw = String(iso || "");
    let d = new Date(raw);
    if (isNaN(d)) d = new Date(`${raw}T12:00:00Z`);
    if (isNaN(d)) return raw.slice(0, granularity === "hour" ? 16 : 10);
    const locale = lang() === "es" ? "es-ES" : "en-GB";
    if (granularity === "hour") {
      return d.toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    if (granularity === "year") return String(d.getUTCFullYear());
    if (granularity === "month") return d.toLocaleDateString(locale, { month: "short", year: "2-digit" });
    return d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "2-digit" });
  }

  function durationLabel(days) {
    if (days == null || Number.isNaN(Number(days))) return "—";
    const n = Number(days);
    if (n < 1) return t("<1 day", "<1 día");
    return `${fmt(n)} ${t("days", "días")}`;
  }

  async function load() {
    try {
      window.HFOFormat.setStatus("dashboardStatus", t("Loading mobility evidence...", "Cargando evidencia de movilidad..."));
      const prefs = window.HFOPrefs.load();
      const params = window.HFOFilters.buildApiParams(output?.meta || {}, prefs);
      const result = await window.HFOApi.getMobilityRoute(params);
      output = result.data;
      render();
      window.HFOFormat.setStatus(
        "dashboardStatus",
        result.source === "api" ? t("Loaded from analytics API.", "Cargado desde API analítica.") : t("Loaded from static outputs/ JSON.", "Cargado desde JSON estático."),
        result.source === "api" ? "ok" : ""
      );
    } catch (err) {
      console.error(err);
      window.HFOFormat.setStatus("dashboardStatus", `Unable to load: ${err.message}`, "error");
    }
  }

  function destroyChart(id) {
    const canvas = document.getElementById(id);
    if (canvas?._ci) {
      canvas._ci.destroy();
      canvas._ci = null;
    }
  }

  function makeChart(id, cfg) {
    destroyChart(id);
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    canvas._ci = new Chart(canvas, cfg);
  }

  function baseOpts(xTitle = "", yTitle = "") {
    const muted = css("--muted") || "#a9b9da";
    const text = css("--text") || "#eef4ff";
    const grid = css("--chart-grid") || "rgba(169,185,218,.18)";
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: text, boxWidth: 12 } } },
      scales: {
        x: { title: { display: !!xTitle, text: xTitle, color: muted }, ticks: { color: muted, maxRotation: 45, autoSkip: true, maxTicksLimit: 14 }, grid: { color: grid } },
        y: { title: { display: !!yTitle, text: yTitle, color: muted }, beginAtZero: true, ticks: { color: muted }, grid: { color: grid } }
      }
    };
  }

  function renderCards() {
    const g = output?.kpis_global || {};
    const trackable = g.tracks_with_2plus_points ?? g.trackable_records ?? g.valid_local_tracks;
    const trackableRate = g.trackable_rate ?? g.local_track_rate;
    const distance = g.avg_approx_distance_km ?? g.avg_estimated_distance_km ?? g.avg_local_distance_km;
    const avgPoints = g.avg_points_per_entity;
    setText("kpiGroups", fmt(g.observed_entities ?? g.total_groups));
    setText("kpiPeople", fmt(g.people_observed ?? g.total_people));
    setText("kpiNoRoute", trackable != null ? `${fmt(trackable)} (${trackableRate ?? 0}%)` : "—");
    setText("kpiAvgPoints", avgPoints != null ? fmt(avgPoints) : "—");
    setText("kpiDuration", distance != null ? `~${fmt(distance)} km` : t("No calculable distance", "Sin distancia calculable"));
  }

  function renderTimeSeries() {
    setHTML("howToTime", t(
      "<strong>How to read:</strong> Temporal evolution of the selected mobility metric within the current filters. Use the granularity control to switch between hour, day, week, month or year.",
      "<strong>Cómo leer:</strong> Evolución temporal de la métrica de movilidad seleccionada con los filtros actuales. Usa la granularidad para cambiar entre hora, día, semana, mes o año."
    ));

    const gran = window.HFOPrefs?.load()?.selectedGranularity || output?.meta?.granularity || "week";
    const series = output?.series?.[`by_${gran}`] || output?.series?.by_week || [];
    const map = {};
    series.forEach(p => {
      if (!map[p.bucket]) map[p.bucket] = { observations: 0, entities: 0, people: 0 };
      map[p.bucket].observations += p.observations ?? p.count ?? 0;
      map[p.bucket].entities += p.entities ?? p.count ?? 0;
      map[p.bucket].people += p.people ?? 0;
    });
    const keys = [...new Set(series.map(p => p.bucket))].sort();
    const labels = keys.map(k => dateLabel(k, gran));
    const observations = keys.map(k => map[k]?.observations || 0);
    const testimonies = keys.map(k => map[k]?.entities || 0);
    const people = keys.map(k => map[k]?.people || 0);
    const values = mobilityMetric === "people" ? people : testimonies;
    const yLabel = mobilityMetric === "people" ? t("People represented", "Personas representadas") : t("Testimonies", "Testimonios");

    makeChart("timeSeriesChart", {
      type: "bar",
      data: { labels, datasets: [
        { type: "bar", label: yLabel, data: values, backgroundColor: "rgba(98,182,255,0.45)", borderColor: "rgba(98,182,255,0.85)", borderWidth: 1, borderRadius: 3 },
        { type: "line", label: t("Point observations", "Puntos observados"), data: observations, borderColor: css("--ok") || "#75d6a0", backgroundColor: "transparent", borderWidth: 2.5, pointRadius: 0, tension: 0.35 }
      ] },
      options: baseOpts(t("Period", "Periodo"), yLabel)
    });

    const last = values[values.length - 1] ?? 0;
    const prev = values[values.length - 2] ?? 0;
    const trend = last > prev ? t("↑ increasing", "↑ en aumento") : last < prev ? t("↓ decreasing", "↓ en descenso") : t("→ stable", "→ estable");
    setHTML("timeSeriesInsight", `${t("Last period", "Último periodo")}: <strong>${fmt(last)}</strong> ${yLabel.toLowerCase()} · ${t("Trend", "Tendencia")}: <strong>${trend}</strong>.`);
  }

  function renderZoneEvidence() {
    setHTML("howToRoutes", t(
      "<strong>How to read:</strong> Compares the selected metric by operational zone. Switch between people represented and testimonies in the sidebar.",
      "<strong>Cómo leer:</strong> Compara la métrica seleccionada por zona operativa. Puedes alternar entre personas representadas y testimonios en el panel lateral."
    ));

    const zones = [...(output?.zone_summary || output?.coverage_by_region || [])].filter(z => z.observations || z.observed_entities || z.people_observed).slice(0, 12);
    const text = css("--text") || "#eef4ff";
    const muted = css("--muted") || "#a9b9da";
    const grid = css("--chart-grid") || "rgba(169,185,218,.18)";

    const zoneValues = mobilityMetric === "people" ? zones.map(z => z.people_observed || 0) : zones.map(z => z.testimonies_observed ?? z.observed_entities ?? 0);
    const zoneLabel = mobilityMetric === "people" ? t("People represented", "Personas representadas") : t("Testimonies", "Testimonios");
    makeChart("routesChart", {
      type: "bar",
      data: { labels: zones.map(z => z.zone || z.region), datasets: [
        { label: zoneLabel, data: zoneValues, backgroundColor: "rgba(98,182,255,0.58)", borderColor: "rgba(98,182,255,0.9)", borderWidth: 1, borderRadius: 4 }
      ] },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: text, boxWidth: 12 }, onClick: () => {} } },
        scales: {
          x: { beginAtZero: true, ticks: { color: muted }, grid: { color: grid } },
          y: { ticks: { color: text }, grid: { color: grid } }
        }
      }
    });

    const top = zones[0];
    setHTML("routesInsight", top
      ? `${t("Highest observed volume", "Mayor volumen observado")}: <strong>${esc(top.zone || top.region)}</strong> — ${fmt(top.people_observed)} ${t("people represented", "personas representadas")}, ${fmt(top.testimonies_observed ?? top.observed_entities)} ${t("testimonies", "testimonios")}.`
      : t("No zone evidence matches the current filters.", "No hay evidencia por zona con los filtros actuales."));
  }


  function renderTrajectoryAverages() {
    setHTML("howToTrajectoryAverages", t(
      "<strong>How to read:</strong> These charts show the average number of recorded points per trajectory and the average approximate kilometres per trajectory for each operational zone. The global values are shown in the KPI cards above; this section shows the same logic by zone.",
      "<strong>Cómo leer:</strong> Estos gráficos muestran el número medio de puntos registrados por trayectoria y los kilómetros aproximados medios por trayectoria para cada zona operativa. Los valores generales están en las tarjetas KPI superiores; esta sección muestra la misma lógica por zona."
    ));

    const rows = [...(output?.zone_summary || output?.coverage_by_region || [])]
      .filter(row => row.observations || row.testimonies_observed || row.observed_entities)
      .slice(0, 12);

    const labels = rows.map(row => row.zone || row.region);
    const avgPoints = rows.map(row => row.avg_points_per_trajectory ?? row.avg_points_per_entity ?? null);
    const avgKm = rows.map(row => row.avg_distance_per_trajectory_km ?? null);

    const pointsOpts = baseOpts(t("Zone", "Zona"), t("Avg. points / Group", "Puntos medios / Grupo"));
    pointsOpts.plugins.legend.display = false;
    pointsOpts.interaction = { mode: "nearest", intersect: true };
    makeChart("avgPointsZoneChart", {
      type: "bar",
      data: { labels, datasets: [{
        label: t("Avg. points / Group", "Puntos medios / Grupo"),
        data: avgPoints,
        backgroundColor: "rgba(98,182,255,0.58)",
        borderColor: "rgba(98,182,255,0.9)",
        borderWidth: 1,
        borderRadius: 4
      }] },
      options: pointsOpts
    });

    const kmOpts = baseOpts(t("Zone", "Zona"), t("Avg. approx. km / Group", "Km aprox. medios / Grupo"));
    kmOpts.plugins.legend.display = false;
    kmOpts.interaction = { mode: "nearest", intersect: true };
    kmOpts.plugins.tooltip = { callbacks: { label: ctx => ` ${t("Avg. approx. km / trajectory", "Km aprox. medios / trayectoria")}: ~${fmt(ctx.raw)} km` } };
    makeChart("avgKmZoneChart", {
      type: "bar",
      data: { labels, datasets: [{
        label: t("Avg. approx. km / trajectory", "Km aprox. medios / trayectoria"),
        data: avgKm,
        backgroundColor: "rgba(117,214,160,0.58)",
        borderColor: "rgba(117,214,160,0.9)",
        borderWidth: 1,
        borderRadius: 4
      }] },
      options: kmOpts
    });

    const validKmRows = rows.filter(row => row.avg_distance_per_trajectory_km != null);
    const topKm = validKmRows.sort((a, b) => (b.avg_distance_per_trajectory_km || 0) - (a.avg_distance_per_trajectory_km || 0))[0];
    const topPoints = [...rows].filter(row => (row.avg_points_per_trajectory ?? row.avg_points_per_entity) != null)
      .sort((a, b) => ((b.avg_points_per_trajectory ?? b.avg_points_per_entity ?? 0) - (a.avg_points_per_trajectory ?? a.avg_points_per_entity ?? 0)))[0];

    const g = output?.kpis_global || {};
    const globalPoints = g.avg_points_per_trajectory ?? g.avg_points_per_entity;
    const globalKm = g.avg_approx_distance_km ?? g.avg_estimated_distance_km ?? g.avg_local_distance_km;
    setHTML("trajectoryAveragesInsight", rows.length
      ? `${t("Global average", "Media general")}: <strong>${globalPoints != null ? fmt(globalPoints) : "—"}</strong> ${t("points/trajectory", "puntos/trayectoria")} · <strong>${globalKm != null ? "~" + fmt(globalKm) + " km" : "—"}</strong>. ${topPoints ? `${t("Highest avg. points", "Mayor media de puntos")}: <strong>${esc(topPoints.zone || topPoints.region)}</strong>.` : ""} ${topKm ? `${t("Highest avg. km", "Mayor media de km")}: <strong>${esc(topKm.zone || topKm.region)}</strong> (~${fmt(topKm.avg_distance_per_trajectory_km)} km).` : ""}`
      : t("No trajectory averages available for the current filters.", "No hay medias por trayectoria disponibles con los filtros actuales."));
  }

  function renderTrackingPanel() {
    const text = css("--text") || "#eef4ff";
    const muted = css("--muted") || "#a9b9da";
    const grid = css("--chart-grid") || "rgba(169,185,218,.18)";

    if (trackView === "distance") {
      setHTML("howToTracking", t(
        "<strong>How to read:</strong> Distribution of approximate distance per testimony. Bands are recalculated from the current filtered data. Distance is the sum of straight-line segments between ordered recorded points.",
        "<strong>Cómo leer:</strong> Distribución de distancia aproximada por testimonio. Las bandas se recalculan con los datos filtrados actuales. La distancia suma segmentos rectos entre puntos registrados y ordenados."
      ));
      const rows = output?.distance_distribution || [];
      const distanceOpts = baseOpts(t("Approx. distance band", "Banda de distancia aprox."), t("Records", "Registros"));
      distanceOpts.plugins.legend.onClick = () => {};
      makeChart("trackingChart", {
        type: "bar",
        data: { labels: rows.map(r => r.band), datasets: [{ label: t("Testimonies", "Testimonios"), data: rows.map(r => r.count), backgroundColor: "rgba(117,214,160,.6)", borderColor: "rgba(117,214,160,.9)", borderWidth: 1, borderRadius: 5 }] },
        options: distanceOpts
      });
      const g = output?.kpis_global || {};
      setHTML("trackingInsight", g.avg_approx_distance_km != null
        ? `${t("Average approximate distance", "Distancia aproximada media")}: <strong>~${fmt(g.avg_approx_distance_km)} km</strong> · ${t("Median", "Mediana")}: <strong>~${fmt(g.median_estimated_distance_km ?? g.median_distance_km)} km</strong>.`
        : t("No approximate distance can be calculated with the current filters.", "No se puede calcular distancia aproximada con los filtros actuales."));
    } else {
      setHTML("howToTracking", t(
        "<strong>How to read:</strong> Checks whether the selected data is strong enough to estimate movement. The key step is 2+ ordered points for the the same testimony with coordinates.",
        "<strong>Cómo leer:</strong> Comprueba si los datos seleccionados son suficientes para estimar movimiento. El paso clave es tener 2+ puntos ordenados para la mismo testimonio con coordenadas."
      ));
      const rows = output?.tracking_funnel || [];
      makeChart("trackingChart", {
        type: "bar",
        data: { labels: rows.map(r => r.label), datasets: [{ label: t("Records", "Registros"), data: rows.map(r => r.count), backgroundColor: rows.map((_, i) => ["rgba(98,182,255,.65)", "rgba(117,214,160,.6)", "rgba(255,193,7,.65)", "rgba(253,126,20,.65)", "rgba(220,53,69,.65)"][i] || "rgba(98,182,255,.6)"), borderColor: "rgba(255,255,255,.12)", borderWidth: 1, borderRadius: 5 }] },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ` ${fmt(ctx.raw)} · ${rows[ctx.dataIndex]?.pct ?? 0}%` } } },
          scales: { x: { beginAtZero: true, ticks: { color: muted }, grid: { color: grid } }, y: { ticks: { color: text }, grid: { color: grid } } }
        }
      });
      const step = rows.find(r => r.stage === "approx_distance");
      setHTML("trackingInsight", step
        ? `${t("Approximate distance calculable for", "Distancia aproximada calculable para")} <strong>${fmt(step.count)}</strong> ${t("testimony records", "registros de testimonio")} (${step.pct}%).`
        : "");
    }
  }

  function renderZoneDetail() {
    setHTML("howToRouteDetail", t(
      "<strong>How to read:</strong> Summary by operational zone, including average points per trajectory and average approximate kilometres per trajectory.",
      "<strong>Cómo leer:</strong> Resumen por zona operativa, incluyendo puntos medios por trayectoria y kilómetros aproximados medios por trayectoria."
    ));

    const rows = output?.zone_summary || output?.coverage_by_region || [];
    const body = document.getElementById("routeDetailBody");
    if (!body) return;
    body.innerHTML = "";
    rows.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${esc(row.zone || row.region)}</td>
        <td class="number">${fmt(row.testimonies_observed ?? row.observed_entities)}</td>
        <td class="number">${fmt(row.people_observed)}</td>
        <td class="number">${fmt(row.observations)}</td>
        <td class="number">${row.avg_points_per_trajectory != null ? fmt(row.avg_points_per_trajectory) : row.avg_points_per_entity != null ? fmt(row.avg_points_per_entity) : "—"}</td>
        <td class="number">${row.avg_distance_per_trajectory_km != null ? `~${fmt(row.avg_distance_per_trajectory_km)} km` : "—"}</td>
        <td class="number">${row.latest_activity ? dateLabel(row.latest_activity) : "—"}</td>`;
      body.appendChild(tr);
    });

    const top = rows[0];
    setHTML("routeDetailSummary", rows.length
      ? (top ? `• ${t("Highest observed volume", "Mayor volumen observado")}: <strong>${esc(top.zone || top.region)}</strong> — ${fmt(top.people_observed)} ${t("people represented", "personas representadas")} ${t("in", "en")} ${fmt(top.observations)} ${t("point observations", "puntos observados")}.` : "")
      : t("No zone evidence available for the current filters.", "No hay evidencia por zona con los filtros actuales."));
  }

  function renderMovementRecords() {
    setHTML("howToNodes", t(
      "<strong>How to read:</strong> Top records with calculable approximate distance. Distances are straight-line estimates between recorded points from the the same testimony. They should be used as a rough mobility indicator only.",
      "<strong>Cómo leer:</strong> Principales registros con distancia aproximada calculable. Las distancias son estimaciones en línea recta entre puntos registrados de la mismo testimonio. Deben usarse solo como indicador aproximado de movilidad."
    ));
    const rows = (output?.tracking_index || output?.local_tracking_index || [])
      .filter(row => row.estimated_distance_km != null)
      .slice(0, 15);
    const body = document.getElementById("nodesBody");
    if (!body) return;
    body.innerHTML = "";
    rows.forEach((row, i) => {
      const zones = Array.isArray(row.zones_observed) ? row.zones_observed.join(", ") : "—";
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td class="number">${fmt(row.num_points)}</td>
        <td class="number">${fmt(row.people ?? 0)}</td>
        <td class="number">~${fmt(row.estimated_distance_km)} km</td>
        <td class="number">${durationLabel(row.duration_days)}</td>
        <td>${esc(zones)}</td>`;
      body.appendChild(tr);
    });
    const top = rows[0];
    setHTML("nodesInsight", top
      ? `${t("Largest approximate distance in current view", "Mayor distancia aproximada en la vista actual")}: <strong>~${fmt(top.estimated_distance_km)} km</strong> (${fmt(top.num_points)} ${t("points", "puntos")}).`
      : t("No records with calculable approximate distance in the current filter window.", "No hay registros con distancia aproximada calculable en la ventana filtrada."));
  }

  function renderDataQuality(dq) {
    if (!dq) return;
    const pct = dq.overall_pct ?? 0;
    const color = pct >= 90 ? "var(--ok)" : pct >= 70 ? "var(--warning)" : "var(--danger)";
    const L = lang();

    const barEl = document.getElementById("dqCompletenessBar");
    if (barEl) barEl.innerHTML =
      `<div style="background:var(--surface-2);border-radius:8px;height:10px;overflow:hidden;margin-bottom:6px;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:8px;transition:width .4s;"></div>
       </div>
       <span style="color:${color};font-weight:700">${pct}%</span> ${L === "es" ? "completitud de campos requeridos" : "required fields completeness"}
       &nbsp;·&nbsp; ${fmt(dq.total_records)} ${L === "es" ? "registros" : "records"}`;

    const sumEl = document.getElementById("dqSummaryBox");
    if (sumEl) {
      const suggestions = {
        current_Location: L === "es" ? "Las coordenadas son necesarias para estimar distancia." : "Coordinates are required to estimate distance.",
        numPersons: L === "es" ? "El número de personas es clave; haz que sea obligatorio." : "People count is key; make it required.",
        entity_id: L === "es" ? "El ID del testimonio es esencial para vincular puntos." : "Testimony ID is essential to link points.",
        sequence_index: L === "es" ? "El orden de puntos permite calcular distancias consistentes." : "Point order enables consistent distance estimates."
      };
      const lines = [];
      if (pct < 70) lines.push(L === "es" ? "Completitud por debajo del 70%." : "Completeness below 70%.");
      if (dq.worst_field) {
        const sugg = suggestions[dq.worst_field] || "";
        lines.push(L === "es"
          ? `Campo menos completo: <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). ${sugg}`
          : `Least complete field: <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). ${sugg}`);
      }
      sumEl.innerHTML = lines.length ? lines.map(line => `<div style="margin-bottom:4px">• ${line}</div>`).join("") : `<span style="color:var(--ok)">&#10003; ${L === "es" ? "Calidad de datos buena." : "Data quality is good."}</span>`;
    }

    const body = document.getElementById("dqTableBody");
    if (!body) return;
    body.innerHTML = "";
    (dq.fields || []).forEach(f => {
      const c = f.pct >= 90 ? "var(--ok)" : f.pct >= 70 ? "var(--warning)" : "var(--danger)";
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td><code>${esc(f.field)}</code>${f.required ? " *" : ""}</td>` +
        `<td class="number">${fmt(f.filled)}</td>` +
        `<td class="number">${fmt(f.missing)}</td>` +
        `<td class="number"><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">` +
        `<div style="background:var(--surface-2);border-radius:4px;height:6px;width:50px;overflow:hidden;">` +
        `<div style="background:${c};height:100%;width:${f.pct}%;"></div></div>` +
        `<span style="color:${c}">${f.pct}%</span></div></td>`;
      body.appendChild(tr);
    });
  }

  function renderMeta() {
    const meta = output?.meta || {};
    const prefs = window.HFOPrefs.load();
    window.HFOFilters.renderTimeButtons("timeFilterButtons", prefs);
    window.HFOFilters.bindCustomDateInputs("customFrom", "customTo", prefs, meta);
    window.HFOFilters.renderRegionButtons("regionFilterButtons", meta.available_regions || meta.all_regions || [], prefs.selectedRegions || []);
    renderGranularityButtons(prefs.selectedGranularity || meta.granularity || "week");
    renderMetricButtons();
    const regLabel = prefs.selectedRegions?.length ? prefs.selectedRegions.join(", ") : t("All regions", "Todas las regiones");
    window.HFOFormat.setText("metaSource", "trajectories.json");
    window.HFOFormat.setText("metaDataset", `${window.HFOFormat.dateOnly(meta.dataset_min)} → ${window.HFOFormat.dateOnly(meta.dataset_max)}`);
    window.HFOFormat.setText("metaRegions", regLabel);
  }

  function renderGranularityButtons(selected) {
    const el = document.getElementById("granularityButtons");
    if (!el) return;
    el.innerHTML = "";
    ["hour", "day", "week", "month", "year"].forEach(g => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-button ${g === selected ? "active" : ""}`;
      btn.textContent = window.HFOI18n?.t?.(g.charAt(0).toUpperCase() + g.slice(1)) || g;
      btn.addEventListener("click", () => window.HFOPrefs.save({ selectedGranularity: g }));
      el.appendChild(btn);
    });
  }

  function renderMetricButtons() {
    document.querySelectorAll("[data-mobility-metric]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mobilityMetric === mobilityMetric);
      btn.onclick = () => {
        mobilityMetric = btn.dataset.mobilityMetric || "people";
        render();
      };
    });
  }

  const I18N = {
    "lbl.export_pdf": ["Export PDF report", "Exportar informe PDF"],
    "lbl.dark_mode": ["Dark mode", "Modo oscuro"],
    "lbl.source": ["Source", "Fuente"],
    "lbl.dataset_coverage": ["Dataset coverage", "Cobertura del dataset"],
    "lbl.selected_regions": ["Selected regions", "Regiones seleccionadas"],
    "lbl.status": ["Status", "Estado"],
    "lbl.time_window": ["Time window", "Ventana temporal"],
    "lbl.regions": ["Regions", "Regiones"],
    "lbl.granularity": ["Granularity", "Granularidad"],
    "lbl.mobility_metric": ["Displayed metric", "Métrica visible"],
    "btn.people_represented": ["People represented", "Personas representadas"],
    "btn.testimonies": ["Testimonies", "Testimonios"],
    "lbl.testimonies_observed": ["Testimonies observed", "Testimonios observados"],
    "lbl.trajectories_2plus": ["Trajectories with 2+ points", "Trayectorias con 2+ puntos"],
    "lbl.avg_points_trajectory": ["Avg. points / trajectory", "Puntos medios / trayectoria"],
    "lbl.avg_approx_distance_trajectory": ["Avg. approx. km / trajectory", "Km aprox. medios / trayectoria"],
    "lbl.testimonies": ["Testimonies", "Testimonios"],
    "lbl.avg_points_trajectory_short": ["Avg. points/traj.", "Puntos/tray. medios"],
    "lbl.avg_approx_km_trajectory_short": ["Avg. km/traj.", "Km/tray. medios"],
    "lbl.zone_filter": ["Zone filter", "Filtro de zona"],
    "h2.movement_evidence": ["Movement evidence over time", "Evidencia de movimiento en el tiempo"],
    "h2.zone_evidence": ["People and testimonies observed by zone", "Personas y testimonios observados por zona"],
    "h2.distance_distribution": ["Approximate distance distribution", "Distribución de distancia aproximada"],
    "h2.trajectory_averages_zone": ["Average trajectory indicators by zone", "Indicadores medios por trayectoria y zona"],
    "h2.zone_detail": ["Zone coverage summary", "Resumen de cobertura por zona"],
    "h2.movement_records": ["Approximate distance records", "Registros de distancia aproximada"],
    "h2.data_quality": ["Data quality", "Calidad de datos"],
    "lbl.field_completeness": ["— field completeness", "— completitud de campos"],
    "btn.distance": ["Distance bands", "Bandas de distancia"],
    "btn.readiness": ["Readiness", "Preparación"]
  };

  function updateI18nElements() {
    const L = lang() === "es" ? 1 : 0;
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      if (I18N[key]) el.textContent = I18N[key][L];
    });
  }

  function render() {
    if (!output) return;
    renderMeta();
    renderCards();
    renderTimeSeries();
    renderZoneEvidence();
    renderTrajectoryAverages();
    renderTrackingPanel();
    renderZoneDetail();
    renderMovementRecords();
    renderDataQuality(output?.data_quality);
    updateI18nElements();
    window.dispatchEvent(new CustomEvent("hfo:dashboard-rendered"));
  }

  function bindControls() {
    mobilityMetric = "people";
  }

  document.addEventListener("DOMContentLoaded", () => {
    window.HFOPrefs.initBaseControls();
    bindControls();
    load();
    window.addEventListener("dashboardPrefsChanged", () => load());
  });
})();
