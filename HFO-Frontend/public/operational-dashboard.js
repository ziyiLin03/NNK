(function () {
  "use strict";

  let loadSeq = 0;
  let output         = null;
  let source         = "";
  let trendTab       = "global";  // "global" | "region"
  let trendGran      = "week";    // "week" | "month" | "year"
  let regionSubView  = "trend";   // "trend" | "hour"
  let byHourPeriod   = "week";    // "week" | "month" | "year"
  let showAllRegions = false;
  let regionLoadView = 'overall';  // 'overall' | 'custom'

  // ── i18n ─────────────────────────────────────────────────────
  const STR = {
    en: {
      // How-to messages — generated dynamically
      filter_hint: " Add or remove regions using the <strong>Regions filter</strong> on the left panel.",

      // Cards
      today: "today", days_ago: "d ago",
      groups: "groups", people: "people",
      no_prev: "no prev. data",
      vs_prev: "vs prev. week",
      regions_active: "regions with ≥1 testimony",
      all_active: "✓ All regions recently active",
      inactive_alert: "⚠ {n} region(s) inactive >14d:",

      // Insights
      last_period:    "Last period: {n} testimonies · 4-week avg: {avg} · Trend: {trend}",
      increasing:     "↑ increasing", declining: "↓ declining", stable: "→ stable",
      most_active:    "Most active region: {region} ({n} testimonies).",
      top3_note:      "Showing top 3 — use filter to see more.",
      peak_hour:      "Peak hour: {h}:00 ({n} testimonies).",
      window_regions: "Window: {from} → {to} · Regions: {regions}.",
      highest_load:   "Highest load: {region} — {n} people · {t} testimonies.",
      show_all:       "Show all regions", show_top5: "Show top 5",

      // Axis titles
      axis_period: "Period", axis_testimonies: "Testimonies", axis_hour: "Hour of day",
    },
    es: {
      filter_hint: " Añade o quita regiones usando el <strong>filtro de Regiones</strong> del panel izquierdo.",
      today: "hoy", days_ago: "d", groups: "grupos", people: "personas",
      no_prev: "sin datos previos", vs_prev: "vs sem. ant.",
      regions_active: "regiones con ≥1 testimonio",
      all_active: "✓ Todas las regiones activas recientemente",
      inactive_alert: "⚠ {n} región(es) inactiva(s) >14d:",
      last_period:    "Último período: {n} testimonios · media 4 sem: {avg} · Tendencia: {trend}",
      increasing:     "↑ en aumento", declining: "↓ en descenso", stable: "→ estable",
      most_active:    "Región más activa: {region} ({n} testimonios).",
      top3_note:      "Mostrando top 3 — usa el filtro para ver más.",
      peak_hour:      "Hora punta: {h}:00 ({n} testimonios).",
      window_regions: "Ventana: {from} → {to} · Regiones: {regions}.",
      highest_load:   "Mayor carga: {region} — {n} personas · {t} testimonios.",
      show_all:       "Ver todas las regiones", show_top5: "Ver top 5",
      axis_period: "Período", axis_testimonies: "Testimonios", axis_hour: "Hora del día",
    },
  };

  function lang() {
    try { return window.HFOPrefs?.load()?.language === "es" ? "es" : "en"; } catch(_) { return "en"; }
  }
  function s(key, vars) {
    let str = STR[lang()]?.[key] || STR.en[key] || key;
    if (vars) Object.entries(vars).forEach(([k,v]) => { str = str.replaceAll(`{${k}}`, v ?? "—"); });
    return str;
  }
  function fmt(n) { return window.HFOFormat?.number(n)??String(n??'-'); }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }

  // ── Dynamic how-to message ────────────────────────────────────
  function buildHowTo() {
    const L = lang();
    const gran = { hour: L === "es" ? "por hora" : "hourly", day: L === "es" ? "diaria" : "daily", week: L === "es" ? "semanal" : "weekly", month: L === "es" ? "mensual" : "monthly", year: L === "es" ? "anual" : "yearly" }[getGran()] || "weekly";
    const regs = [...getSelected()];
    const regStr = regs.length ? regs.join(", ") : (L === "es" ? "todas las regiones" : "all regions");
    const win = getWin();

    if (L === "es") {
      return `Estás viendo la <strong>actividad ${gran}</strong> recalculada para <strong>${regStr}</strong> `
        + `entre <strong>${window.HFOFormat.dateOnly(win.from)}</strong> y <strong>${window.HFOFormat.dateOnly(win.to)}</strong>. `
        + `El eje temporal, las barras, la tendencia y los KPIs usan exclusivamente los filtros del panel izquierdo.`;
    }
    return `You are viewing <strong>${gran} activity</strong> recalculated for <strong>${regStr}</strong> `
      + `between <strong>${window.HFOFormat.dateOnly(win.from)}</strong> and <strong>${window.HFOFormat.dateOnly(win.to)}</strong>. `
      + `The time axis, bars, trend and KPIs use only the filters in the left panel.`;
  }

  function updateHowTo() {
    const el = document.getElementById("howToTrend");
    if (el) el.innerHTML = buildHowTo();
  }

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    try {
      const seq = ++loadSeq;
      const result = await window.HFOApi.loadDashboard("operational", output?.meta || {});
      if (seq !== loadSeq) return;
      output = result.data;
      source = result.source;
      render();
    } catch (err) {
      console.error(err);
      window.HFOFormat.setStatus("dashboardStatus", `Unable to load: ${err.message}`, "error");
    }
  }

  // ── Filter helpers ────────────────────────────────────────────
  function getPrefs()    { return window.HFOPrefs.load(); }
  function getSelected() { return new Set(getPrefs().selectedRegions || []); }
  function getWin() {
    const win = window.HFOFilters.computeWindow(output?.meta || {}, getPrefs());
    // Fallback: if window is invalid or missing, use full dataset range
    if (!win.from && output?.meta?.dataset_min_recorded_datetime) {
      return {
        from: output.meta.dataset_min_recorded_datetime,
        to:   output.meta.dataset_max_recorded_datetime,
      };
    }
    return win;
  }
  function getGran()     { return getPrefs().selectedGranularity || "week"; }

  function getGroupCount(row) {
    return Number(row.entities ?? row.testimonies_count ?? row.count ?? 0);
  }

  function normalizeGroupsRow(row) {
    return {
      ...row,
      testimonies_count: getGroupCount(row),
      entities: getGroupCount(row),
    };
  }

  function getOverviewTotals() {
    if (!output?.overview) return null;
    return {
      groups: Number(output.overview.total_entities ?? output.overview.total_groups ?? 0),
      people: Number(output.overview.total_people_represented ?? output.overview.total_people ?? 0),
    };
  }

  function getActiveRegions() {
    return getRegionTotals().filter(r => getGroupCount(r) > 0).map(r => r.region);
  }

  function getFilteredTimeRows(granularityOverride) {
    const gran = granularityOverride || getGran();
    const selected = getSelected();
    const win = getWin();
    let rows = [];

    if (output?.series?.testimonies_over_time_by_region?.[gran]) {
      const byRegion = output.series.testimonies_over_time_by_region[gran].filter(r => {
        return (!selected.size || selected.has(r.region)) && window.HFOFilters.isInWindow(r.bucket_start, win.from, win.to);
      });
      const map = new Map();
      byRegion.forEach(r => {
        if (!map.has(r.bucket_start)) {
          map.set(r.bucket_start, { bucket_start: r.bucket_start, bucket_label: r.bucket_label, granularity: gran, testimonies_count: 0, people_represented: 0 });
        }
        const item = map.get(r.bucket_start);
        item.testimonies_count += getGroupCount(r);
        item.people_represented += Number(r.people_represented || 0);
      });
      rows = Array.from(map.values()).sort((a, b) => a.bucket_start.localeCompare(b.bucket_start));
    } else {
      rows = output?.series?.testimonies_over_time_by_granularity?.[gran]
          || output?.series?.testimonies_over_time
          || [];
      rows = rows.filter(r => window.HFOFilters.isInWindow(r.bucket_start, win.from, win.to)).map(normalizeGroupsRow);
    }
    return rows;
  }

  function getRegionTotals() {
    const selected = getSelected();
    const gran = getGran();
    const win = getWin();
    const byRegion = output?.series?.testimonies_over_time_by_region?.[gran] || [];
    const map = new Map();

    byRegion.forEach(r => {
      if (!window.HFOFilters.isInWindow(r.bucket_start, win.from, win.to)) return;
      if (selected.size && !selected.has(r.region)) return;
      if (!map.has(r.region)) map.set(r.region, { region: r.region, testimonies_count: 0, people_represented: 0 });
      const item = map.get(r.region);
      item.testimonies_count += getGroupCount(r);
      item.people_represented += Number(r.people_represented || 0);
    });

    if (map.size === 0 && output?.breakdowns?.region_totals?.length) {
      let rows = output.breakdowns.region_totals;
      if (selected.size) rows = rows.filter(r => selected.has(r.region));
      return [...rows].map(normalizeGroupsRow).sort((a, b) => Number(b.people_represented || 0) - Number(a.people_represented || 0));
    }

    return Array.from(map.values()).sort((a, b) => Number(b.people_represented || 0) - Number(a.people_represented || 0));
  }

  function getMovingAverage() {
    const base = getFilteredTimeRows(getGran());
    const counts = base.map(r => getGroupCount(r));
    return base.map((row, i) => {
      const w = counts.slice(Math.max(0, i - 3), i + 1);
      const avg = w.length ? parseFloat((w.reduce((sum, value) => sum + value, 0) / w.length).toFixed(2)) : 0;
      return { ...row, moving_avg: avg };
    });
  }

  // ── Label helpers ─────────────────────────────────────────────
  function shortLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return iso.slice(0,10);
    return d.toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"2-digit" });
  }
  function hourLabel(iso) {
    if (!iso) return "";
    const d = new Date(iso); if (isNaN(d)) return String(iso).slice(11,16) || iso;
    const win = getWin();
    const from = new Date(win.from), to = new Date(win.to);
    const rangeHours = (!isNaN(from) && !isNaN(to)) ? (to - from) / 36e5 : 999;
    if (rangeHours <= 48) return d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
    return d.toLocaleDateString("en-GB", { day:"numeric", month:"short" }) + " " + d.toLocaleTimeString("en-GB", { hour:"2-digit", minute:"2-digit" });
  }
  function monthLabel(iso) {
    const d = new Date(iso); if (isNaN(d)) return iso.slice(0,7);
    return d.toLocaleDateString("en-GB", { month:"short", year:"2-digit" });
  }
  function yearLabel(iso) { return iso ? String(new Date(iso).getFullYear()) : ""; }
  function labelFn(iso) {
    const gran = getGran();
    if (gran === "hour") return hourLabel(iso);
    if (gran === "month") return monthLabel(iso);
    if (gran === "year")  return yearLabel(iso);
    return shortLabel(iso);
  }

  function aggregateByGran(rows, gran) {
    const map = new Map();
    rows.forEach(r => {
      const d = new Date(r.bucket_start);
      let key = r.bucket_start;
      if (gran === "month") key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      if (gran === "year")  key = String(d.getFullYear());
      if (!map.has(key)) map.set(key, { bucket_start:key, testimonies_count:0, people_represented:0, ma_sum:0, ma_cnt:0 });
      const item = map.get(key);
      item.testimonies_count  += getGroupCount(r);
      item.people_represented += Number(r.people_represented || 0);
      if (r.moving_avg != null) { item.ma_sum += r.moving_avg; item.ma_cnt++; }
    });
    return Array.from(map.values())
      .sort((a,b) => a.bucket_start.localeCompare(b.bucket_start))
      .map(item => ({ ...item, moving_avg: item.ma_cnt ? parseFloat((item.ma_sum/item.ma_cnt).toFixed(2)) : null }));
  }

  // ── Chart base options ────────────────────────────────────────
  function baseOpts(nLabels, xTitle, yTitle) {
    const MUTED = css("--muted") || "#a9b9da";
    const TEXT  = css("--text")  || "#eef4ff";
    const GRID  = css("--chart-grid") || "rgba(169,185,218,.18)";
    return {
      responsive:true, maintainAspectRatio:false,
      interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{ labels:{ color:TEXT, boxWidth:12, boxHeight:12 } } },
      scales:{
        x:{
          title:{ display:!!xTitle, text:xTitle||"", color:MUTED },
          ticks:{ color:MUTED, maxRotation:45, autoSkip:true, maxTicksLimit: nLabels>60?12:16 },
          grid:{ color:GRID },
        },
        y:{
          title:{ display:!!yTitle, text:yTitle||"", color:MUTED },
          beginAtZero:true,
          ticks:{ color:MUTED },
          grid:{ color:GRID },
        },
      },
    };
  }

  // ── Auto summary ──────────────────────────────────────────────
  function renderSummary() {
    const el = document.getElementById("autoSummary");
    if (!el || !output) return;
    const rows = getMovingAverage();
    const totals = getRegionTotals();
    const win = getWin();
    const lines = [];

    const overview = getOverviewTotals();
    if (rows.length) {
      const totalGroups = overview?.groups ?? rows.reduce((sum, row) => sum + getGroupCount(row), 0);
      const totalPeople = overview?.people ?? rows.reduce((sum, row) => sum + Number(row.people_represented || 0), 0);
      lines.push(`${window.HFOFormat.dateOnly(win.from)} → ${window.HFOFormat.dateOnly(win.to)}: <strong>${fmt(totalGroups)}</strong> ${s("groups")} · <strong>${fmt(totalPeople)}</strong> ${s("people")}.`);
    }
    if (rows.length >= 2) {
      const last = rows[rows.length - 1], prev = rows[rows.length - 2];
      const trendKey = last.moving_avg > prev.moving_avg ? "increasing"
                     : last.moving_avg < prev.moving_avg ? "declining" : "stable";
      lines.push(s("last_period", { n: window.HFOFormat.number(getGroupCount(last)), avg: last.moving_avg ?? "—", trend: s(trendKey) }));
    }
    if (totals[0]) lines.push(s("most_active", { region: totals[0].region, n: window.HFOFormat.number(getGroupCount(totals[0])) }));
    if (!rows.length) lines.push(lang() === "es" ? "No hay datos para los filtros seleccionados." : "No data for the selected filters.");
    el.innerHTML = lines.map(l => `<div style="margin-bottom:5px">• ${l}</div>`).join("");
  }

  // ── Cards ─────────────────────────────────────────────────────
  function renderCards() {
    const rows = getFilteredTimeRows();
    const totals = getRegionTotals();
    const overview = getOverviewTotals();
    const groups = overview?.groups ?? rows.reduce((sum, row) => sum + getGroupCount(row), 0);
    const people = overview?.people ?? rows.reduce((sum, row) => sum + Number(row.people_represented || 0), 0);
    const active = totals.filter(r => getGroupCount(r) > 0).map(r => r.region);
    const win = getWin();

    const kpiWeek = document.getElementById("kpiWeek");
    if (kpiWeek) kpiWeek.innerHTML = `
      <div style="font-size:22px;font-weight:800;margin-bottom:6px">
        ${window.HFOFormat.number(groups)} ${s("groups")} &nbsp;·&nbsp; ${window.HFOFormat.number(people)} ${s("people")}
      </div>
      <div style="font-size:12px;line-height:1.8;color:var(--muted)">
        ${window.HFOFormat.dateOnly(win.from)} → ${window.HFOFormat.dateOnly(win.to)}
      </div>`;

    window.HFOFormat.setText("kpiActiveRegions", window.HFOFormat.number(active.length));

    const kpiLR = document.getElementById("kpiLastRegion");
    if (kpiLR) kpiLR.innerHTML = totals[0]
      ? `<span style="font-size:22px;font-weight:800">${window.HFOFormat.escapeHtml?.(totals[0].region) || totals[0].region}</span>
         <span style="display:block;font-size:12px;color:var(--muted);margin-top:4px">${window.HFOFormat.number(getGroupCount(totals[0]))} ${s("groups")}</span>`
      : "—";

    const selected = getSelected();
    const expected = selected.size ? [...selected] : (output?.meta?.available_regions || []);
    const inactive = expected.filter(region => !active.includes(region));
    const kpiAlert = document.getElementById("kpiAlerts");
    if (kpiAlert) kpiAlert.innerHTML = inactive.length === 0
      ? `<span style="color:var(--ok)">${s("all_active")}</span>`
      : `<span style="color:var(--danger)">${inactive.length} ${lang() === "es" ? "región(es) sin datos en la ventana" : "region(s) with no data in the window"}<br><small>${inactive.slice(0, 5).map(r => window.HFOFormat.escapeHtml?.(r) || r).join(", ")}${inactive.length > 5 ? "…" : ""}</small></span>`;
  }

  // ── Meta sidebar ──────────────────────────────────────────────
  function renderMeta() {
    const meta  = output?.meta || {};
    const prefs = getPrefs();
    window.HFOFilters.renderTimeButtons("timeFilterButtons", prefs);
    window.HFOFilters.bindCustomDateInputs("customFrom", "customTo", prefs, meta);
    window.HFOFilters.renderRegionButtons("regionFilterButtons", meta.available_regions||[], prefs.selectedRegions||[]);
    renderGranularityButtons(meta.available_granularities||["week"], prefs.selectedGranularity||"week");
    const regLabel = prefs.selectedRegions?.length ? prefs.selectedRegions.join(", ") : (window.HFOI18n?.t?.("All regions")||"All regions");
    window.HFOFormat.setText("metaSource",  meta.source_file||"testimonies.json");
    window.HFOFormat.setText("metaWindow",  `${window.HFOFormat.dateOnly(meta.window_from)} → ${window.HFOFormat.dateOnly(meta.window_to)}`);
    window.HFOFormat.setText("metaDataset", `${window.HFOFormat.dateOnly(meta.dataset_min_recorded_datetime)} → ${window.HFOFormat.dateOnly(meta.dataset_max_recorded_datetime)}`);
    window.HFOFormat.setText("metaRegions", regLabel);
  }

  function renderGranularityButtons(granularities, selected) {
    const el = document.getElementById("granularityButtons");
    if (!el) return;
    el.innerHTML = "";
    granularities.forEach(g => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `filter-button ${g===selected?"active":""}`;
      btn.textContent = window.HFOI18n?.t?.(g.charAt(0).toUpperCase()+g.slice(1))||g;
      btn.addEventListener("click", ()=>window.HFOPrefs.save({selectedGranularity:g}));
      el.appendChild(btn);
    });
  }

  // ── Trend chart ───────────────────────────────────────────────
  function renderTrendChart() {
    const canvas = document.getElementById("trendChart");
    if (!canvas || !window.Chart) return;
    if (canvas._ci) { canvas._ci.destroy(); canvas._ci = null; }
    updateHowTo();
    renderGlobal(canvas);
  }

  // Sidebar-filtered trend: one chart, recalculated from the selected time window and regions.
  function renderGlobal(canvas) {
    const rows = getMovingAverage();
    const labels = rows.map(r => labelFn(r.bucket_start));
    const counts = rows.map(getGroupCount);
    const ma = rows.map(r => r.moving_avg);
    const OK = css("--ok") || "#75d6a0";

    const opts = baseOpts(labels.length, s("axis_period"), s("axis_testimonies"));
    opts.scales.x.ticks.maxTicksLimit = labels.length > 90 ? 14 : labels.length > 45 ? 12 : 16;

    canvas._ci = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { type: "bar", label: s("axis_testimonies"), data: counts, backgroundColor: "rgba(98,182,255,0.45)", borderColor: "rgba(98,182,255,0.8)", borderWidth: 1, borderRadius: 3 },
          { type: "line", label: lang() === "es" ? "Media móvil 4 períodos" : "4-period moving avg", data: ma, borderColor: OK, backgroundColor: "transparent", borderWidth: 2.5, pointRadius: 0, tension: 0.35, spanGaps: true },
        ],
      },
      options: opts,
    });

    const last = rows[rows.length - 1], prev = rows[rows.length - 2];
    const trendKey = last && prev
      ? (getGroupCount(last) > getGroupCount(prev) ? "increasing"
        : getGroupCount(last) < getGroupCount(prev) ? "declining" : "stable")
      : "stable";
    const total = counts.reduce((sum, value) => sum + value, 0);
    const people = rows.reduce((sum, row) => sum + Number(row.people_represented || 0), 0);
    const win = getWin();
    window.HFOFormat.setText("trendInsight",
      rows.length
        ? `${window.HFOFormat.dateOnly(win.from)} → ${window.HFOFormat.dateOnly(win.to)} · ${window.HFOFormat.number(total)} ${s("groups")} · ${window.HFOFormat.number(people)} ${s("people")} · ${s(trendKey)}`
        : (lang() === "es" ? "No hay datos para los filtros seleccionados." : "No data for the selected filters."));
  }

  // By region + trend: bars if 1 region, lines if multiple — no points
  function renderByRegionTrend(canvas) {
    const gran     = getGran();
    const win      = getWin();
    const selected = getSelected();
    const byRegion = output?.series?.testimonies_over_time_by_region?.[gran] || [];
    const filtered = byRegion.filter(r => window.HFOFilters.isInWindow(r.bucket_start, win.from, win.to));
    const allRegs  = [...new Set(filtered.map(r=>r.region))].sort();
    const totals   = allRegs.map(reg => ({
      region:reg,
      total: filtered.filter(r=>r.region===reg).reduce((s,r)=>s+getGroupCount(r),0),
    })).sort((a,b)=>b.total-a.total);

    const activeRegions = selected.size>0 ? [...selected] : totals.slice(0,3).map(r=>r.region);
    const buckets = [...new Set(filtered.map(r=>r.bucket_start))].sort();
    const labels  = buckets.map(b=>shortLabel(b));

    const PALETTE = [
      {line:"#62b6ff",fill:"rgba(98,182,255,0.12)"},
      {line:"#75d6a0",fill:"rgba(117,214,160,0.12)"},
      {line:"#ffd166",fill:"rgba(255,209,102,0.12)"},
      {line:"#ff8fab",fill:"rgba(255,143,171,0.12)"},
      {line:"#b8a1ff",fill:"rgba(184,161,255,0.12)"},
      {line:"#f4a261",fill:"rgba(244,162,97,0.12)"},
    ];

    const opts = baseOpts(labels.length, s("axis_period"), s("axis_testimonies"));

    if (activeRegions.length === 1) {
      // Single region: bars + trend line
      const region = activeRegions[0];
      const data   = buckets.map(b => {
        const pt = filtered.find(r=>r.bucket_start===b&&r.region===region);
        return getGroupCount(pt);
      });
      // Simple moving avg for single region
      const ma = data.map((_,i) => {
        const w = data.slice(Math.max(0,i-3),i+1);
        return parseFloat((w.reduce((s,v)=>s+v,0)/w.length).toFixed(1));
      });
      canvas._ci = new Chart(canvas, {
        type:"bar",
        data:{
          labels,
          datasets:[
            { type:"bar",  label:region,  data, backgroundColor:"rgba(98,182,255,0.45)", borderColor:"rgba(98,182,255,0.8)", borderWidth:1, borderRadius:3 },
            { type:"line", label:lang()==="es"?"Tendencia":"Trend", data:ma, borderColor:css("--ok")||"#75d6a0", backgroundColor:"transparent", borderWidth:2, pointRadius:0, tension:0.4, spanGaps:true },
          ],
        },
        options:opts,
      });
      const peak = data.reduce((best,v,i)=>v>(data[best]||0)?i:best,0);
      window.HFOFormat.setText("trendInsight",
        s("window_regions",{from:window.HFOFormat.dateOnly(win.from),to:window.HFOFormat.dateOnly(win.to),regions:region}) + " " +
        (labels[peak]?`${lang()==="es"?"Pico":"Peak"}: ${labels[peak]} (${data[peak]} ${s("axis_testimonies").toLowerCase()}).`:""));
    } else {
      // Multiple regions: clean lines, no points
      const datasets = activeRegions.map((region,i) => {
        const col = PALETTE[i%PALETTE.length];
        return {
          label: region,
          data: buckets.map(b=>{
            const pt=filtered.find(r=>r.bucket_start===b&&r.region===region);
            return getGroupCount(pt);
          }),
          borderColor:col.line, backgroundColor:"transparent",
          borderWidth:2.5, pointRadius:0, pointHoverRadius:5,
          tension:0.3, fill:false,
        };
      });
      canvas._ci = new Chart(canvas,{ type:"line", data:{labels,datasets}, options:opts });
      const top = totals[0];
      window.HFOFormat.setText("trendInsight",
        s("most_active",{region:top?.region??"—",n:top?.total??0}) +
        (selected.size===0&&totals.length>3?" "+s("top3_note"):""));
    }
  }

  // By region + hour: lines per region, no points
  function renderByRegionHour(canvas) {
    const hourData     = output?.series?.activity_hour_by_region_period || [];
    const selected     = getSelected();
    const win          = getWin();
    const allRegs      = [...new Set(hourData.map(d=>d.region))].sort();
    const totals       = allRegs.map(reg=>({
      region:reg,
      total:hourData.filter(d=>d.region===reg).reduce((s,d)=>s+getGroupCount(d),0),
    })).sort((a,b)=>b.total-a.total);
    const activeRegions = selected.size>0 ? [...selected] : totals.slice(0,3).map(r=>r.region);

    const labels  = Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}:00`);
    const PALETTE = [
      {line:"#62b6ff",fill:"rgba(98,182,255,0.12)"},
      {line:"#75d6a0",fill:"rgba(117,214,160,0.12)"},
      {line:"#ffd166",fill:"rgba(255,209,102,0.12)"},
      {line:"#ff8fab",fill:"rgba(255,143,171,0.12)"},
      {line:"#b8a1ff",fill:"rgba(184,161,255,0.12)"},
      {line:"#f4a261",fill:"rgba(244,162,97,0.12)"},
    ];

    const opts = baseOpts(24, s("axis_hour"), s("axis_testimonies"));

    if (activeRegions.length === 1) {
      const region = activeRegions[0];
      const data   = Array.from({length:24},(_,h)=>{
        const pt=hourData.find(d=>d.hour===h&&d.region===region);
        return getGroupCount(pt);
      });
      canvas._ci = new Chart(canvas,{
        type:"bar",
        data:{
          labels,
          datasets:[
            { type:"bar",  label:region, data, backgroundColor:"rgba(98,182,255,0.45)", borderColor:"rgba(98,182,255,0.8)", borderWidth:1, borderRadius:3 },
            { type:"line", label:lang()==="es"?"Tendencia":"Trend",
              data:data.map((_,i)=>{ const w=data.slice(Math.max(0,i-2),i+3); return parseFloat((w.reduce((s,v)=>s+v,0)/w.length).toFixed(1)); }),
              borderColor:css("--ok")||"#75d6a0", backgroundColor:"transparent", borderWidth:2, pointRadius:0, tension:0.4, spanGaps:true },
          ],
        },
        options:opts,
      });
    } else {
      const datasets = activeRegions.map((region,i)=>{
        const col=PALETTE[i%PALETTE.length];
        return {
          label:region,
          data:Array.from({length:24},(_,h)=>{
            const pt=hourData.find(d=>d.hour===h&&d.region===region);
            return getGroupCount(pt);
          }),
          borderColor:col.line, backgroundColor:"transparent",
          borderWidth:2.5, pointRadius:0, pointHoverRadius:5,
          tension:0.3, fill:false,
        };
      });
      canvas._ci = new Chart(canvas,{type:"line",data:{labels,datasets},options:opts});
    }

    // Peak insight
    const peakHour = Array.from({length:24},(_,h)=>({
      hour:h,
      total:activeRegions.reduce((s,r)=>{
        const pt=hourData.find(d=>d.hour===h&&d.region===r);
        return s+getGroupCount(pt);
      },0),
    })).sort((a,b)=>b.total-a.total)[0];

    const regStr = activeRegions.join(", ");
    const windowStr = `${window.HFOFormat.dateOnly(win.from)} → ${window.HFOFormat.dateOnly(win.to)}`;
    window.HFOFormat.setText("trendInsight",
      s("window_regions",{from:window.HFOFormat.dateOnly(win.from),to:window.HFOFormat.dateOnly(win.to),regions:regStr}) + " " +
      (peakHour?s("peak_hour",{h:String(peakHour.hour).padStart(2,"0"),n:peakHour.total}):"") +
      (selected.size===0&&totals.length>3?" "+s("top3_note"):""));
  }


  // ── Average by hour chart ─────────────────────────────────────
  function getHourlyAverageRows() {
    const selected = getSelected();
    const rows = selected.size && output?.series?.activity_average_by_hour_by_region
      ? aggregateHourlyAverageByRegion(output.series.activity_average_by_hour_by_region, selected)
      : (output?.series?.activity_average_by_hour || []);
    return Array.from({ length: 24 }, (_, hour) => {
      const row = rows.find(r => Number(r.hour) === hour) || {};
      return {
        hour,
        testimonies_count: getGroupCount(row),
        people_represented: Number(row.people_represented || 0),
        active_days: Number(row.active_days || 0),
        avg_testimonies_per_day: Number(row.avg_testimonies_per_day || 0),
        avg_people_per_day: Number(row.avg_people_per_day || 0),
      };
    });
  }

  function aggregateHourlyAverageByRegion(rows, selected) {
    const map = new Map();
    rows.forEach(row => {
      if (!selected.has(row.region)) return;
      const hour = Number(row.hour);
      if (!map.has(hour)) map.set(hour, { hour, testimonies_count: 0, people_represented: 0, active_days: 0 });
      const item = map.get(hour);
      item.testimonies_count += getGroupCount(row);
      item.people_represented += Number(row.people_represented || 0);
      item.active_days = Math.max(item.active_days, Number(row.active_days || 0));
    });
    return Array.from(map.values()).map(item => ({
      ...item,
      avg_testimonies_per_day: item.active_days ? Number((item.testimonies_count / item.active_days).toFixed(2)) : 0,
      avg_people_per_day: item.active_days ? Number((item.people_represented / item.active_days).toFixed(2)) : 0,
    }));
  }

  function renderHourlyAverageChart() {
    const canvas = document.getElementById("hourlyAverageChart");
    if (!canvas || !window.Chart) return;
    if (canvas._ci) { canvas._ci.destroy(); canvas._ci = null; }

    const rows = getHourlyAverageRows();
    const labels = rows.map(r => `${String(r.hour).padStart(2,"0")}:00`);
    const averages = rows.map(r => r.avg_testimonies_per_day);
    const totals = rows.map(getGroupCount);
    const opts = baseOpts(24, s("axis_hour"), lang() === "es" ? "Media de testimonios" : "Average testimonies");
    opts.plugins.tooltip = {
      callbacks: {
        label: (ctx) => {
          const row = rows[ctx.dataIndex] || {};
          return ` ${ctx.dataset.label}: ${ctx.formattedValue} · ${window.HFOFormat.number(getGroupCount(row))} total`;
        }
      }
    };

    canvas._ci = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: lang() === "es" ? "Media diaria por hora" : "Daily avg by hour",
          data: averages,
          backgroundColor: "rgba(117,214,160,0.45)",
          borderColor: "rgba(117,214,160,0.9)",
          borderWidth: 1,
          borderRadius: 3,
        }],
      },
      options: opts,
    });

    const best = rows.reduce((acc, row) => row.avg_testimonies_per_day > acc.avg_testimonies_per_day ? row : acc, rows[0] || { hour: 0, avg_testimonies_per_day: 0 });
    const total = totals.reduce((sum, value) => sum + value, 0);
    const win = getWin();
    const insight = document.getElementById("hourlyAverageInsight");
    if (insight) {
      const range = `${window.HFOFormat.dateOnly(win.from)} → ${window.HFOFormat.dateOnly(win.to)}`;
      insight.textContent = rows.some(r => getGroupCount(r))
        ? `${range} · ${s("peak_hour", { h: String(best.hour).padStart(2,"0"), n: best.avg_testimonies_per_day })} · ${window.HFOFormat.number(total)} total ${s("axis_testimonies").toLowerCase()}`
        : (lang() === "es" ? "No hay datos horarios para los filtros seleccionados." : "No hourly data for the selected filters.");
    }

    const how = document.getElementById("howToHourlyAverage");
    if (how) how.innerHTML = lang() === "es"
      ? "Este gráfico muestra la <strong>media diaria de testimonios por hora del día</strong> dentro de la ventana y regiones seleccionadas. Sirve para detectar horas punta sin que los rangos largos oculten el patrón horario."
      : "This chart shows the <strong>daily average testimonies by hour of day</strong> inside the selected window and regions. It helps identify peak hours without long windows hiding the hourly pattern.";
  }

  // ── Regional load ─────────────────────────────────────────────
  function renderRegionChart() {
    const canvas = document.getElementById("regionChart");
    if (!canvas) return;
    if (canvas._ci) { canvas._ci.destroy(); canvas._ci = null; }

    const rows = getRegionTotals().slice(0, 10);
    const win = getWin();
    const selected = getSelected();

    const howEl = document.getElementById("howToRegLoad");
    if (howEl) {
      const regStr = selected.size ? [...selected].join(", ") : (lang() === "es" ? "todas las regiones" : "all regions");
      howEl.innerHTML = lang() === "es"
        ? `Carga regional recalculada para <strong>${regStr}</strong> entre <strong>${window.HFOFormat.dateOnly(win.from)}</strong> y <strong>${window.HFOFormat.dateOnly(win.to)}</strong>. Este gráfico usa solo los filtros del panel izquierdo.`
        : `Regional load recalculated for <strong>${regStr}</strong> between <strong>${window.HFOFormat.dateOnly(win.from)}</strong> and <strong>${window.HFOFormat.dateOnly(win.to)}</strong>. This chart uses only the left-panel filters.`;
    }

    const PALETTE = ["#62b6ff", "#75d6a0", "#ffd166", "#ff8fab", "#b8a1ff", "#f4a261", "#7bdff2", "#c3f584", "#ffb3c6", "#a0c4ff"];
    const MUTED = css("--muted") || "#a9b9da";
    const TEXT = css("--text") || "#eef4ff";
    const GRID = css("--chart-grid") || "rgba(169,185,218,.18)";

    canvas._ci = new Chart(canvas, {
      type: "bar",
      data: {
        labels: rows.map(r => r.region),
        datasets: [{
          label: lang() === "es" ? "Personas representadas" : "People represented",
          data: rows.map(r => Number(r.people_represented || 0)),
          backgroundColor: rows.map((_, i) => PALETTE[i % PALETTE.length]),
          borderWidth: 0,
          borderRadius: 4,
        }],
      },
      options: {
        indexAxis: "y", responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${window.HFOFormat.number(ctx.raw)} ${lang() === "es" ? "personas" : "people"} · ${window.HFOFormat.number(getGroupCount(rows[ctx.dataIndex] || {}))} ${lang() === "es" ? "testimonios" : "testimonies"}` } },
        },
        scales: {
          x: { title: { display: true, text: lang() === "es" ? "Personas representadas" : "People represented", color: MUTED }, beginAtZero: true, ticks: { color: MUTED }, grid: { color: GRID } },
          y: { title: { display: true, text: lang() === "es" ? "Región" : "Region", color: MUTED }, ticks: { color: TEXT }, grid: { color: GRID } },
        },
      },
    });

    const top = rows[0];
    window.HFOFormat.setText("regionInsight",
      top ? s("highest_load", { region: top.region, n: window.HFOFormat.number(top.people_represented), t: window.HFOFormat.number(getGroupCount(top)) }) : "");
  }

  // ── Region table ──────────────────────────────────────────────
  function renderRegionTable() {
    const L = lang();
    const howEl = document.getElementById("howToRegTable");
    if (howEl) howEl.innerHTML = L==="es"
      ? "<strong>Cómo leer:</strong> Cada fila es una región de campo. Las columnas muestran el número de testimonios, las personas representadas y cuándo fue la última actividad registrada. 🟢 Actividad reciente · 🟡 Sin actividad en 7–14 días · 🔴 Sin actividad en más de 14 días."
        + `<br><small style="color:var(--muted)"> Usa el filtro de regiones para centrarte en zonas específicas.</small>`
      : "<strong>How to read:</strong> Each row is a field region. Columns show testimony count, people represented, and when the last activity was recorded. 🟢 Recent activity · 🟡 No activity in 7–14 days · 🔴 No activity in over 14 days."
        + `<br><small style="color:var(--muted)"> Use the region filter to focus on specific areas.</small>`;

    const body     = document.getElementById("regionTableBody");
    const rows     = getRegionTotals();
    const activity = output?.region_last_activity||[];
    if (!body) return;
    body.innerHTML = "";
    rows.forEach(row=>{
      const act  = activity.find(r=>r.region===row.region);
      const dot  = act?{green:"🟢",yellow:"🟡",red:"🔴"}[act.status]||"":"";
      const days = act?.days_ago!=null?`${act.days_ago}${s("days_ago")}`:"—";
      const tr   = document.createElement("tr");
      tr.innerHTML=`
        <td>${dot} ${row.region}</td>
        <td class="number">${window.HFOFormat.number(getGroupCount(row))}</td>
        <td class="number">${window.HFOFormat.number(row.people_represented)}</td>
        <td class="number">${days}</td>`;
      body.appendChild(tr);
    });
  }


  // ── i18n button updater ───────────────────────────────────────
  const I18N_BTN = {
    "btn.overall":     ["Overall",              "Global"],
    "btn.by_region":   ["By region",            "Por región"],
    "btn.by_hour":     ["By hour",              "Por hora"],
    "btn.weekly":      ["Weekly",               "Semanal"],
    "btn.monthly":     ["Monthly",              "Mensual"],
    "btn.yearly":      ["Yearly",               "Anual"],
    "btn.this_week":   ["This week",            "Esta semana"],
    "btn.this_month":  ["This month",           "Este mes"],
    "btn.this_year":   ["This year",            "Este año"],
    "btn.trend":       ["Trend",                "Tendencia"],
    "btn.top10":       ["Overall — top 10",     "General — top 10"],
    "btn.custom":      ["Custom",               "Personalizado"],
    "btn.global":      ["Global",               "Global"],
    "btn.by_nat":      ["By nationality",       "Por nacionalidad"],
    "btn.by_legal":    ["By legal status",      "Por situación legal"],
    "btn.over_time":   ["Over time",            "Evolución temporal"],
    "btn.by_gender":   ["By gender",            "Por género"],
    "btn.by_nat2":     ["By nationality",       "Por nacionalidad"],
    "btn.by_type":     ["By type",              "Por tipo"],
    "btn.by_category": ["By category",          "Por categoría"],
    "btn.by_region2":  ["By region",            "Por región"],
    "btn.no_track":    ["% Without tracking by region", "% Sin seguimiento por región"],
    "btn.track_qual":  ["Tracking quality breakdown", "Calidad de seguimiento"],
    "btn.events":      ["Events",               "Eventos"],
    "btn.people":      ["People",               "Personas"],
    "btn.by_category2":["By category",          "Por categoría"],
    "btn.vuln_time":   ["Over time",            "Evolución temporal"],
    "lbl.view":        ["View:",                "Vista:"],
    "lbl.peak_in":     ["Peak hours in:",       "Horas punta en:"],
    "lbl.category":    ["Category:",            "Categoría:"],
    "lbl.inc_type":    ["Incident type:",       "Tipo de incidente:"],
    "lbl.metric":      ["Metric",               "Métrica"],
    "lbl.nationality": ["Select nationalities to display:", "Selecciona nacionalidades:"],
    "lbl.vulnerability":["Vulnerability:",      "Vulnerabilidad:"],
    "h2.nationality_detail": ["Nationality detail", "Detalle de nacionalidades"],
    "h2.incident_rate": ["Incident rate", "Tasa de incidentes"],
    "h2.event_types": ["Event types", "Tipos de evento"],
    "h2.incident_detail": ["Incident detail", "Detalle de incidentes"],
    "h2.data_quality": ["Data quality", "Calidad de datos"],
    "h2.groups_movement": ["Groups in movement · Temporal evolution", "Grupos en movimiento · Evolución temporal"],
    "h2.tracking_coverage": ["Tracking coverage", "Cobertura de seguimiento"],
    "h2.transit_nodes": ["Top transit areas", "Principales zonas de tránsito"],
    "h2.activity_trend": ["Activity trend", "Tendencia de actividad"],
    "h2.regional_load": ["Regional load", "Carga regional"],
    "h2.gender_dist": ["Gender distribution", "Distribución por género"],
    "h2.nationalities": ["Nationalities", "Nacionalidades"],
    "h2.vuln_types": ["Vulnerability types", "Tipos de vulnerabilidad"],
    "h2.health_score": ["Health score", "Puntuación de salud"],
    "h2.events_time": ["Events over time", "Eventos en el tiempo"],
    "lbl.field_completeness": ["— field completeness", "— completitud de campos"],
    "lbl.export_pdf": ["Export PDF report", "Exportar informe PDF"],
    "lbl.dark_mode": ["Dark mode", "Modo oscuro"],
    "lbl.reset_filters": ["Reset filters", "Restablecer filtros"],
    "lbl.source": ["Source", "Fuente"],
    "lbl.loaded_window": ["Loaded window", "Ventana cargada"],
    "lbl.dataset_coverage": ["Dataset coverage", "Cobertura del dataset"],
    "lbl.selected_regions": ["Selected regions", "Regiones seleccionadas"],
    "lbl.status": ["Status", "Estado"],
    "lbl.time_window": ["Time window", "Ventana temporal"],
    "lbl.granularity": ["Granularity", "Granularidad"],
    "lbl.regions": ["Regions", "Regiones"],
    "lbl.metric": ["Metric", "Métrica"],
  };

  function updateI18nElements() {
    const L = lang();
    document.querySelectorAll("[data-i18n]").forEach(el => {
      const key = el.dataset.i18n;
      if (I18N_BTN[key]) el.textContent = I18N_BTN[key][L==="es"?1:0];
    });
  }

  // ── Main render ───────────────────────────────────────────────

  // ── Data quality panel ────────────────────────────────────────
  function renderDataQuality(dq) {
    if (!dq) return;
    const pct   = dq.overall_pct ?? 0;
    const color = pct>=90?"var(--ok)":pct>=70?"var(--warning)":"var(--danger)";
    const L     = lang();

    const barEl = document.getElementById("dqCompletenessBar");
    if (barEl) barEl.innerHTML =
      `<div style="background:var(--surface-2);border-radius:8px;height:10px;overflow:hidden;margin-bottom:6px;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:8px;transition:width .4s;"></div>
       </div>
       <span style="color:${color};font-weight:700">${pct}%</span> ${L==="es"?"completitud de campos requeridos":"required fields completeness"}
       &nbsp;·&nbsp; ${window.HFOFormat.number(dq.total_records)} ${L==="es"?"registros":"records"}`;

    const sumEl = document.getElementById("dqSummaryBox");
    if (sumEl) {
      const SUGGESTIONS = {
        volunteer_ID:    L==="es"?"Asegúrate de que el formulario asigne siempre un ID único.":"Ensure the form always assigns a unique record ID.",
        testimony_ID:    L==="es"?"Asegúrate de que el formulario asigne siempre un ID único.":"Ensure the form always assigns a unique record ID.",
        gender:          L==="es"?"Añade Prefiero no decirlo para aumentar la tasa de respuesta.":"Add Prefer not to say to improve response rate.",
        nationality:     L==="es"?"Incluye un desplegable de países para facilitar el registro.":"Include a country dropdown to simplify recording.",
        general_health:  L==="es"?"Usa una escala visual del 1 al 5 en la app de campo.":"Use a simple 1-5 visual scale in the field app.",
        current_Location:L==="es"?"Activa la geolocalización automática en la app.":"Enable automatic geolocation in the app.",
        location_Tag:    L==="es"?"Recuerda a los voluntarios etiquetar cada evento con al menos un tipo de incidente.":"Remind volunteers to tag each event with at least one incident type.",
        numPersons:      L==="es"?"El número de personas es clave — haz que sea obligatorio en el formulario.":"People count is key — make it required in the form.",
        event_datetime:  L==="es"?"La fecha del evento es esencial para el análisis temporal.":"Event datetime is essential for temporal analysis.",
      };
      const lines = [];
      if (pct < 70) lines.push(L==="es"
        ?"Completitud por debajo del 70% — los análisis pueden no ser representativos."
        :"Completeness below 70% — analyses may not be representative.");
      if (dq.worst_field) {
        const sugg = SUGGESTIONS[dq.worst_field] || "";
        lines.push(L==="es"
          ?`Campo menos completo: <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). ${sugg}`
          :`Least complete field: <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). ${sugg}`);
      }
      sumEl.innerHTML = lines.length
        ? lines.map(l=>`<div style="margin-bottom:4px">• ${l}</div>`).join("")
        : `<span style="color:var(--ok)">&#10003; ${L==="es"?"Calidad de datos buena.":"Data quality is good."}</span>`;
    }

    const body = document.getElementById("dqTableBody"); if (!body) return;
    body.innerHTML = "";
    (dq.fields||[]).forEach(f => {
      const c = f.pct>=90?"var(--ok)":f.pct>=70?"var(--warning)":"var(--danger)";
      const tr = document.createElement("tr");
      tr.innerHTML =
        `<td><code>${f.field}</code>${f.required?" *":""}</td>` +
        `<td class="number">${window.HFOFormat.number(f.filled)}</td>` +
        `<td class="number">${window.HFOFormat.number(f.missing)}</td>` +
        `<td class="number"><div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;">` +
        `<div style="background:var(--surface-2);border-radius:4px;height:6px;width:50px;overflow:hidden;">` +
        `<div style="background:${c};height:100%;width:${f.pct}%;"></div></div>` +
        `<span style="color:${c}">${f.pct}%</span></div></td>`;
      body.appendChild(tr);
    });
  }

  function render() {
    if (!output) return;
    renderMeta();
    renderSummary();
    renderCards();
    renderDataQuality(output?.data_quality);
    renderTrendChart();
    renderHourlyAverageChart();
    renderRegionChart();
    renderRegionTable();
    const timeRows = getFilteredTimeRows();
    const empty    = document.getElementById("emptyState");
    if (empty) empty.classList.toggle("hide", timeRows.length>0);
    updateI18nElements();
    window.dispatchEvent(new CustomEvent("hfo:dashboard-rendered"));
  }

  // ── Bind controls ─────────────────────────────────────────────
  function bindControls() {
    // Activity trend and regional load no longer have internal filters.
    // The left sidebar is the single source of truth for time, granularity and region filters.
  }


  document.addEventListener("DOMContentLoaded",()=>{
    window.HFOPrefs.initBaseControls();
    bindControls();
    load();
    window.HFOApi.bindFilterReload(load, 80);
  });
})();
