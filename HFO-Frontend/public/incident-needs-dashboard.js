(function () {
  "use strict";

  const KPI_URL = "../../outputs/dashboard_02_kpis.json";

  let loadSeq = 0;
  let output       = null;
  let timeView     = "category";   // "overall" | "category"
  let activeCategory = "__all__";
  let activeTag      = "__all__";
  let rateView     = "type";       // "type" | "category" | "region"
  const metric     = "count";      // fixed: event frequency. People remain available in KPIs, tooltips and tables.

  // ── i18n ─────────────────────────────────────────────────────
  function lang() { try { return window.HFOPrefs?.load()?.language==="es"?"es":"en"; } catch(_){return "en";} }
  function t(en, es) { return lang()==="es" ? es : en; }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function setText(id, v) { const el=document.getElementById(id); if(el) el.textContent=String(v??"-"); }
  function setHTML(id, h) { const el=document.getElementById(id); if(el) el.innerHTML=h; }
  function fmt(n) { return window.HFOFormat?.number(n)??String(n??"-"); }

  const PALETTE = ["#62b6ff","#75d6a0","#ffd166","#ff8fab","#b8a1ff","#f4a261","#7bdff2","#c3f584","#ffb3c6","#a0c4ff"];
  const CAT_COLORS = {
    "Displacement":"#62b6ff","Shelter":"#75d6a0","Basic Needs":"#ffd166",
    "Health":"#ff8fab","Protection":"#ff6b6b","Other":"#b8a1ff",
  };

  // Point type labels — evaluated at call time so language changes take effect
  function ptLabel(type) {
    const labels = {
      "observation":    t("Observation",        "Observación"),
      "shelter_need":   t("Shelter Need",        "Necesidad de refugio"),
      "street_sleeping":t("Street Sleeping",     "Durmiendo en la calle"),
      "medical_need":   t("Medical Need",        "Necesidad médica"),
      "pushback":       t("Pushback",            "Devolución forzosa"),
      "police_control": t("Police Control",      "Control policial"),
      "unknown":        t("Unknown",             "Desconocido"),
    };
    return labels[type] || type;
  }

  // Tag display label — evaluated at call time; merges movement+group_movement visually
  function tagDisplayLabel(tag, rawLabel) {
    // Both movement and group_movement map to the same category label in the backend
    // but may appear as separate entries in tag_counts. Deduplicate display label here.
    if (tag === "movement" || tag === "group_movement") return t("Displacement Movement","Desplazamiento");
    return rawLabel || tag;
  }

  function shortLabel(iso) {
    const raw = String(iso || "");
    const gran = getGran();
    let d = new Date(raw);
    if (isNaN(d)) d = new Date(`${raw}T12:00:00Z`);
    if (isNaN(d)) return raw.slice(0, gran === "hour" ? 16 : 10);
    const locale = lang() === "es" ? "es-ES" : "en-GB";
    if (gran === "hour") return d.toLocaleString(locale, { day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" });
    if (gran === "year") return String(d.getUTCFullYear());
    if (gran === "month") return d.toLocaleDateString(locale, { month:"short", year:"2-digit" });
    return d.toLocaleDateString(locale,{day:"numeric",month:"short",year:"2-digit"});
  }

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    try {
      const seq = ++loadSeq;
      const result = await window.HFOApi.loadDashboard("incidentNeeds", output?.meta || {}, {
        loading: t("Loading incident & needs KPIs...","Cargando KPIs de incidentes..."),
        loaded: t("Loaded from analytics API.","Cargado desde API analítica."),
      });
      if (seq !== loadSeq) return;
      const data = result.data;
      if (data.meta) {
        data.meta.dataset_min_recorded_datetime = data.meta.dataset_min_recorded_datetime || data.meta.dataset_min;
        data.meta.dataset_max_recorded_datetime = data.meta.dataset_max_recorded_datetime || data.meta.dataset_max;
        data.meta.window_from = data.meta.window_from || data.meta.dataset_min;
        data.meta.window_to   = data.meta.window_to   || data.meta.dataset_max;
      }
      const cats = data?.meta?.available_categories || [];
      if (activeCategory !== "__all__" && !cats.includes(activeCategory)) {
        activeCategory = "__all__";
        activeTag = "__all__";
      }
      output = data;
      render();
    } catch(err) {
      console.error(err);
      window.HFOFormat.setStatus("dashboardStatus", `Unable to load: ${err.message}`, "error");
    }
  }


  // ── Filter helpers ────────────────────────────────────────────
  function getSelected() { return new Set(window.HFOPrefs.load().selectedRegions||[]); }
  function getGran()     { return window.HFOPrefs.load().selectedGranularity||"week"; }

  function allSeries(gran) {
    const sel = getSelected();
    const s   = output?.series?.[`by_${gran}`]||[];
    return sel.size===0 ? s : s.filter(p=>sel.has(p.region));
  }

  function collapseByBucket(pts) {
    const map = {};
    pts.forEach(p=>{
      if(!map[p.bucket]) map[p.bucket]={count:0,people:0};
      map[p.bucket].count  += p.count;
      map[p.bucket].people += p.people;
    });
    const keys = [...new Set(pts.map(p=>p.bucket))].sort();
    return { keys, counts:keys.map(k=>map[k].count), peoples:keys.map(k=>map[k].people) };
  }

  // ── Chart helpers ─────────────────────────────────────────────
  function destroyChart(id) { const c=document.getElementById(id); if(c?._ci){c._ci.destroy();c._ci=null;} }
  function makeChart(id, cfg) {
    destroyChart(id);
    const canvas=document.getElementById(id);
    if(!canvas||!window.Chart) return;
    canvas._ci=new Chart(canvas,cfg);
  }
  function baseOpts(xT="",yT="",nLabels=0) {
    const M=css("--muted")||"#a9b9da",T=css("--text")||"#eef4ff",G=css("--chart-grid")||"rgba(169,185,218,.18)";
    return {
      responsive:true,maintainAspectRatio:false,
      interaction:{mode:"index",intersect:false},
      plugins:{legend:{labels:{color:T,boxWidth:12}}},
      scales:{
        x:{title:{display:!!xT,text:xT,color:M},ticks:{color:M,maxRotation:45,autoSkip:true,maxTicksLimit:nLabels>100?14:18},grid:{color:G}},
        y:{title:{display:!!yT,text:yT,color:M},beginAtZero:true,ticks:{color:M},grid:{color:G}},
      },
    };
  }

  // ── Meta sidebar ──────────────────────────────────────────────
  function renderMeta() {
    const meta  = output?.meta||{};
    const prefs = window.HFOPrefs.load();
    window.HFOFilters.renderTimeButtons("timeFilterButtons", prefs);
    window.HFOFilters.bindCustomDateInputs("customFrom","customTo",prefs,meta);
    window.HFOFilters.renderRegionButtons("regionFilterButtons", meta.available_regions||[], prefs.selectedRegions||[]);
    renderGranularityButtons(prefs.selectedGranularity||"week");
    const regLabel = prefs.selectedRegions?.length?prefs.selectedRegions.join(", "):(window.HFOI18n?.t?.("All regions")||t("All regions","Todas las regiones"));
    window.HFOFormat.setText("metaSource",  "events.json");
    window.HFOFormat.setText("metaWindow",  `${window.HFOFormat.dateOnly(meta.window_from)} → ${window.HFOFormat.dateOnly(meta.window_to)}`);
    window.HFOFormat.setText("metaDataset", `${window.HFOFormat.dateOnly(meta.dataset_min)} → ${window.HFOFormat.dateOnly(meta.dataset_max)}`);
    window.HFOFormat.setText("metaRegions", regLabel);
  }

  function renderGranularityButtons(selected) {
    const el=document.getElementById("granularityButtons"); if(!el) return;
    el.innerHTML="";
    ["hour","day","week","month","year"].forEach(g=>{
      const btn=document.createElement("button"); btn.type="button";
      btn.className=`filter-button ${g===selected?"active":""}`;
      btn.textContent=window.HFOI18n?.t?.(g.charAt(0).toUpperCase()+g.slice(1))||g;
      btn.addEventListener("click",()=>window.HFOPrefs.save({selectedGranularity:g}));
      el.appendChild(btn);
    });
  }

  // ── KPI cards + intro ─────────────────────────────────────────
  function renderCards() {
    const g    = output?.kpis_global||{};
    const gran = getGran();
    const pts  = allSeries(gran);
    const {keys,counts,peoples} = collapseByBucket(pts);
    const wEvents  = counts.reduce((s,v)=>s+v,0);
    const wPeople  = peoples.reduce((s,v)=>s+v,0);
    const wRegions = new Set(pts.filter(p=>p.count>0).map(p=>p.region)).size;
    const cats     = output?.tag_categories||[];
    const topCat   = cats[0];

    setText("kpiEvents",  fmt(wEvents));
    setText("kpiPeople",  fmt(wPeople));
    setText("kpiRegions", fmt(wRegions));
    setText("kpiTypes",   fmt((output?.tag_counts||[]).length));

    const meta = output?.meta||{};
    setHTML("introBox",
      `<strong>${t("About this dashboard","Sobre este dashboard")}</strong>: `+
      t("This dashboard tracks field events recorded by volunteers. Each event captures a specific incident, need or observation at a given location.",
        "Este dashboard registra los eventos de campo registrados por voluntarios. Cada evento captura un incidente, necesidad u observación específica en un lugar.")+
      `<br><br>` +
      t(`<strong>📊 Metric logic:</strong> Charts use event frequency as the main metric. People affected are still shown in KPI cards, tooltips and detail tables, but the visual ranking is kept stable and controlled only by the left sidebar filters.`,
        `<strong>📊 Lógica de métrica:</strong> Las gráficas usan la frecuencia de eventos como métrica principal. Las personas afectadas siguen apareciendo en KPIs, tooltips y tablas de detalle, pero el ranking visual se mantiene estable y controlado solo por los filtros del panel izquierdo.`)+
      `<br><br><strong>${t("Selected window","Ventana seleccionada")}:</strong> ${window.HFOFormat.dateOnly(meta.window_from)} → ${window.HFOFormat.dateOnly(meta.window_to)} · `+
      `<strong>${fmt(wEvents)}</strong> ${t("events","eventos")} · <strong>${fmt(wPeople)}</strong> ${t("people affected","personas afectadas")} · <strong>${wRegions}</strong> ${t("active regions","regiones activas")}.`+
      (topCat?`<br><strong>${t("Most frequent category","Categoría más frecuente")}:</strong> ${topCat.category} (${topCat.pct}%).`:""));
  }

  // ── Events over time ──────────────────────────────────────────
  function renderTimeChart() {
    // Update tabs
    // Show/hide controls
    const catRow = document.getElementById("categoryFilterRow");
    const tagRow = document.getElementById("tagFilterRow");
    if (catRow) catRow.style.display = timeView==="category" ? "" : "none";
    if (tagRow) tagRow.style.display = (timeView==="category" && activeCategory!=="__all__") ? "" : "none";

    // How-to
    if (timeView==="overall") {
      setHTML("howToTime",
        t("<strong>How to read:</strong> Bars show total events per period. The green line is the 4-week moving average — rising = increasing incident frequency. Use this to detect spikes and long-term trends.",
          "<strong>Cómo leer:</strong> Las barras muestran eventos totales por período. La línea verde es la media móvil de 4 semanas — si sube, la frecuencia de incidentes aumenta. Úsalo para detectar picos y tendencias.")+
        `<br><small style="color:var(--muted)"> ${t("Switch to By category to see which incident types are driving changes.","Cambia a Por categoría para ver qué tipos de incidente impulsan los cambios.")}</small>`);
      renderTimeOverall();
    } else {
      const catStr = activeCategory==="__all__"
        ? t("all categories","todas las categorías")
        : activeCategory;
      const tagStr = activeTag==="__all__"
        ? t("all types","todos los tipos")
        : (output?.series?.by_tag_in_category?.[activeCategory]||[]).find(x=>x.tag===activeTag)?.label||activeTag;
      setHTML("howToTime",
        t(`<strong>How to read:</strong> Each line is an incident category over time. The chart is recalculated only from the left sidebar filters: time window, granularity and regions.`,
          `<strong>Cómo leer:</strong> Cada línea es una categoría de incidente a lo largo del tiempo. La gráfica se recalcula solo con los filtros del panel izquierdo: ventana temporal, granularidad y regiones.`)+
        `<br><small style="color:var(--muted)"> ${t("Click legend items here only if you want to temporarily hide/show a temporal series.","Solo en esta gráfica temporal puedes pulsar la leyenda para ocultar/mostrar series temporalmente.")}</small>`);
      renderTimeByCategory();
    }
  }

  function renderTimeOverall() {
    const gran = getGran();
    const {keys, counts, peoples} = collapseByBucket(allSeries(gran));
    const vals   = metric==="people" ? peoples : counts;
    const labels = keys.map(shortLabel);
    const ma     = vals.map((_,i)=>{ const w=vals.slice(Math.max(0,i-3),i+1); return parseFloat((w.reduce((s,v)=>s+v,0)/w.length).toFixed(1)); });
    const yLabel = metric==="people" ? t("People","Personas") : t("Events","Eventos");

    makeChart("timeChart",{
      type:"bar",
      data:{labels,datasets:[
        {type:"bar",  label:yLabel, data:vals, backgroundColor:"rgba(98,182,255,0.45)",borderColor:"rgba(98,182,255,0.8)",borderWidth:1,borderRadius:2},
        {type:"line", label:t("4-week avg","Media 4 sem"), data:ma, borderColor:css("--ok")||"#75d6a0",backgroundColor:"transparent",borderWidth:2.5,pointRadius:0,tension:0.35,spanGaps:true},
      ]},
      options:baseOpts(t("Period","Período"),yLabel,keys.length),
    });

    const last=vals[vals.length-1]??0, prev=vals[vals.length-2]??0;
    const trend = last>prev ? t("↑ increasing","↑ en aumento") : last<prev ? t("↓ decreasing","↓ en descenso") : t("→ stable","→ estable");
    setHTML("timeInsight",`${t("Last period","Último período")}: <strong>${fmt(last)}</strong> ${yLabel.toLowerCase()} · ${t("Trend","Tendencia")}: <strong>${trend}</strong>.`);
  }

  function renderTimeByCategory() {
    const catSeries = output?.series?.by_category||[];
    const buckets   = [...new Set(catSeries.map(p=>p.bucket))].sort();
    const labels    = buckets.map(shortLabel);

    if (activeCategory==="__all__") {
      // All categories as lines
      const cats = [...new Set(catSeries.map(p=>p.category))];
      const datasets = cats.map(cat=>({
        label: cat,
        data:  buckets.map(b=>{ const pt=catSeries.find(p=>p.bucket===b&&p.category===cat); return pt?.[metric]||0; }),
        borderColor: CAT_COLORS[cat]||PALETTE[cats.indexOf(cat)%PALETTE.length],
        backgroundColor:"transparent",borderWidth:2.5,pointRadius:0,tension:0.3,fill:false,
      }));
      makeChart("timeChart",{type:"line",data:{labels,datasets},options:baseOpts(t("Period","Período"),metric==="people"?t("People","Personas"):t("Events","Eventos"),buckets.length)});

      const totals=cats.map(cat=>({cat,last:buckets.slice(-4).reduce((s,b)=>{const pt=catSeries.find(p=>p.bucket===b&&p.category===cat);return s+(pt?.[metric]||0);},0)})).sort((a,b)=>b.last-a.last);
      const top=totals[0];
      setHTML("timeInsight", top?`${t("Most active category in last 4 periods","Categoría más activa en últimos 4 períodos")}: <strong style="color:${CAT_COLORS[top.cat]||"#62b6ff"}">${top.cat}</strong> (${fmt(top.last)} ${metric==="people"?t("people","personas"):t("events","eventos")}).`:"");
    } else {
      // Drilldown within category
      const tagData = output?.series?.by_tag_in_category?.[activeCategory]||[];
      const filtered = activeTag==="__all__" ? tagData : tagData.filter(x=>x.tag===activeTag);

      if (!filtered.length) {
        setHTML("timeInsight",t("No data for selected category.","Sin datos para la categoría seleccionada."));
        return;
      }

      const tagBuckets = filtered[0]?.data?.map(p=>p.bucket)||[];
      const tagLabels  = tagBuckets.map(shortLabel);

      const datasets = filtered.map((tagObj,i)=>({
        label: tagObj.label,
        data:  tagObj.data.map(p=>p[metric]||0),
        borderColor:PALETTE[i%PALETTE.length],backgroundColor:"transparent",
        borderWidth:2,pointRadius:0,tension:0.3,fill:false,
      }));
      makeChart("timeChart",{type:"line",data:{labels:tagLabels,datasets},options:baseOpts(t("Period","Período"),metric==="people"?t("People","Personas"):t("Events","Eventos"),tagBuckets.length)});

      // Populate tag selector
      populateTagSelector(tagData);

      const top=filtered.map(x=>({label:x.label,last:x.data[x.data.length-1]?.[metric]||0})).sort((a,b)=>b.last-a.last)[0];
      setHTML("timeInsight", top?`${t("Most frequent in","Más frecuente en")} <strong>${activeCategory}</strong> ${t("last period","último período")}: <strong>${top.label}</strong> (${fmt(top.last)} ${metric==="people"?t("people","personas"):t("events","eventos")}).`:"");
    }
  }

  function populateCategorySelector() {
    const sel=document.getElementById("categorySelector"); if(!sel) return;
    sel.innerHTML=`<option value="__all__">${t("All categories","Todas las categorías")}</option>`;
    const cats = output?.meta?.available_categories||Object.keys(CAT_COLORS);
    cats.forEach(cat=>{
      const opt=document.createElement("option");opt.value=cat;opt.textContent=cat;sel.appendChild(opt);
    });
    sel.value=activeCategory;
  }

  function populateTagSelector(tagData) {
    const sel=document.getElementById("tagSelector"); if(!sel) return;
    sel.innerHTML=`<option value="__all__">${t("All types","Todos los tipos")}</option>`;
    tagData.forEach(x=>{
      const opt=document.createElement("option");opt.value=x.tag;opt.textContent=x.label;sel.appendChild(opt);
    });
    sel.value=activeTag;
  }

  // ── Incident rate ─────────────────────────────────────────────
  // Merge movement+group_movement so they don't appear twice in by-type view
  function deduplicatedTagCounts() {
    const tags = output?.tag_counts||[];
    const merged = new Map();
    tags.forEach(t => {
      const key = (t.tag==="group_movement") ? "movement" : t.tag;
      const label = tagDisplayLabel(key, t.label);
      if (merged.has(key)) {
        const existing = merged.get(key);
        existing.count   += t.count;
        existing.people  += t.people;
      } else {
        merged.set(key, { ...t, tag: key, label });
      }
    });
    return [...merged.values()].sort((a,b)=>b.count-a.count);
  }

  function renderRateChart() {

    const M=css("--muted")||"#a9b9da",T=css("--text")||"#eef4ff",G=css("--chart-grid")||"rgba(169,185,218,.18)";

    if (rateView==="category") {
      setHTML("howToRate",
        t("<strong>How to read:</strong> Each bar is an incident category. Bar length = % of all tagged events in that category. Use this to quickly see which types of incidents dominate field activity.",
          "<strong>Cómo leer:</strong> Cada barra es una categoría de incidente. Longitud = % de eventos etiquetados en esa categoría. Úsalo para ver qué tipos de incidentes dominan la actividad de campo."));

      const cats  = output?.tag_categories||[];
      const total = cats.reduce((s,c)=>s+(c[metric]??c.count),0)||1;
      const data  = cats.map(c=>({...c,val:c[metric]??c.count,pct:parseFloat(((c[metric]??c.count)/total*100).toFixed(1))}));

      const selReg = [...getSelected()];
      const regLabel = selReg.length ? selReg.join(", ") : t("All regions","Todas las regiones");

      makeChart("rateChart",{
        type:"bar",
        data:{
          labels:data.map(c=>c.category),
          datasets:[{
            label:"%",
            data:data.map(c=>c.pct),
            backgroundColor:data.map(c=>CAT_COLORS[c.category]||"#62b6ff"),
            borderWidth:0,borderRadius:6,
          }],
        },
        options:{
          indexAxis:"y",responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[
            ` ${ctx.raw}%`,
            ` ${fmt(data[ctx.dataIndex]?.val)} ${metric==="people"?t("people","personas"):t("events","eventos")}`,
          ]}}},
          scales:{
            x:{title:{display:true,text:"%",color:M},beginAtZero:true,ticks:{color:M},grid:{color:G}},
            y:{ticks:{color:T,font:{size:12}},grid:{color:G}},
          },
        },
      });

      const top=data[0];
      setHTML("rateInsight",
        `<strong>${t("Region","Región")}:</strong> ${regLabel} · `+
        (top?`${t("Dominant category","Categoría dominante")}: <strong style="color:${CAT_COLORS[top.category]||"#62b6ff"}">${top.category}</strong> — ${top.pct}% (${fmt(top.val)} ${metric==="people"?t("people","personas"):t("events","eventos")}).`:""));

    } else if (rateView==="type") {
      setHTML("howToRate",
        t("<strong>How to read:</strong> Individual incident types sorted by frequency (%). Colours indicate their category. Bars coloured the same belong to the same category.",
          "<strong>Cómo leer:</strong> Tipos de incidente individuales ordenados por frecuencia (%). Los colores indican su categoría. Barras del mismo color pertenecen a la misma categoría."));

      const tags  = deduplicatedTagCounts();
      const total = tags.reduce((s,x)=>s+(x[metric]??x.count),0)||1;
      const data  = tags.map(x=>({...x,val:x[metric]??x.count,pct:parseFloat(((x[metric]??x.count)/total*100).toFixed(1))}));

      const getColor = tag => {
        const cat=Object.keys(output?.series?.by_tag_in_category||{}).find(c=>(output.series.by_tag_in_category[c]||[]).some(x=>x.tag===tag));
        return CAT_COLORS[cat]||"#b8a1ff";
      };

      makeChart("rateChart",{
        type:"bar",
        data:{
          labels:data.map(x=>x.label||x.tag),
          datasets:[{label:"%",data:data.map(x=>x.pct),backgroundColor:data.map(x=>getColor(x.tag)),borderWidth:0,borderRadius:4}],
        },
        options:{
          indexAxis:"y",responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>[` ${ctx.raw}%`,` ${fmt(data[ctx.dataIndex]?.[metric])} ${metric==="people"?t("people","personas"):t("events","eventos")}`]}}},
          scales:{
            x:{title:{display:true,text:"%",color:M},beginAtZero:true,ticks:{color:M},grid:{color:G}},
            y:{ticks:{color:T,font:{size:11}},grid:{color:G}},
          },
        },
      });

      const selReg2 = [...getSelected()];
      const regLabel2 = selReg2.length ? selReg2.join(", ") : t("All regions","Todas las regiones");
      const top=data[0];
      setHTML("rateInsight",
        `<strong>${t("Region","Región")}:</strong> ${regLabel2} · `+
        (top?`${t("Most frequent type","Tipo más frecuente")}: <strong>${top.label||top.tag}</strong> — ${top.pct}% (${fmt(top.val)} ${metric==="people"?t("people","personas"):t("events","eventos")}).`:""));

    } else {
      // By region — stacked bars by category
      setHTML("howToRate",
        t("<strong>How to read:</strong> Each bar is a region, split by incident category (colour). Bar length = total events. Longer bars = more field activity. Compare category proportions across regions — e.g. if Protection (red) is larger in one region, it signals more safety-related incidents there.",
          "<strong>Cómo leer:</strong> Cada barra es una región, dividida por categoría de incidente (color). Longitud = total de eventos. Compara las proporciones entre regiones — si Protección (rojo) es mayor en una región, señala más incidentes de seguridad allí."));

      const rcb = output?.region_category_breakdown||[];
      const cats = [...new Set(rcb.flatMap(r=>r.categories.map(c=>c.category)))];
      const metricKey = metric==="people"?"people":"count";

      const datasets = cats.map(cat=>({
        label: cat,
        data:  rcb.map(r=>{ const c=r.categories.find(x=>x.category===cat); return c?.[metricKey]||0; }),
        backgroundColor: CAT_COLORS[cat]||PALETTE[cats.indexOf(cat)%PALETTE.length],
        borderWidth:1,borderColor:"var(--bg)",borderRadius:0,
      }));

      makeChart("rateChart",{
        type:"bar",
        data:{ labels:rcb.map(r=>r.region), datasets },
        options:{
          indexAxis:"y",responsive:true,maintainAspectRatio:false,
          plugins:{
            legend:{labels:{color:T,boxWidth:12}},
            tooltip:{mode:"index",intersect:false,callbacks:{
              footer: items => {
                const total = items.reduce((s,i)=>s+i.raw,0);
                return `Total: ${fmt(total)} ${metric==="people"?t("people","personas"):t("events","eventos")}`;
              }
            }},
          },
          scales:{
            x:{stacked:true,title:{display:true,text:metric==="people"?t("People","Personas"):t("Events","Eventos"),color:M},beginAtZero:true,ticks:{color:M},grid:{color:G}},
            y:{stacked:true,ticks:{color:T},grid:{color:G}},
          },
        },
      });

      const top=rcb[0];
      const topCat=top?.categories[0];
      setHTML("rateInsight",
        top?`${t("Highest activity region","Región con más actividad")}: <strong>${top.region}</strong> (${fmt(top.total)} ${t("events","eventos")}). `+
        (topCat?`${t("Dominant category","Categoría dominante")}: <strong style="color:${CAT_COLORS[topCat.category]||"#62b6ff"}">${topCat.category}</strong> (${topCat.pct}%).`:"")
        :"");
    }
  }

  // ── Event types donut ─────────────────────────────────────────
  function renderPtChart() {
    setHTML("howToPt",
      t("<strong>How to read:</strong> Each segment is a primary event type as classified in the field system. This reflects <em>how</em> the event was recorded (e.g. as a shelter need, medical need or pushback), not necessarily what happened. Hover for exact counts.",
        "<strong>Cómo leer:</strong> Cada segmento es un tipo de evento principal tal como se clasifica en el sistema de campo. Refleja <em>cómo</em> se registró el evento (p. ej. necesidad de refugio, necesidad médica o pushback). Hover para ver cifras exactas."));

    const items = output?.pointtype_counts||[];
    const total = items.reduce((s,i)=>s+i.count,0)||1;
    const M=css("--muted")||"#a9b9da",T=css("--text")||"#eef4ff";

    makeChart("ptChart",{
      type:"doughnut",
      data:{
        labels:items.map(i=>ptLabel(i.point_type)),
        datasets:[{data:items.map(i=>i.count),backgroundColor:PALETTE,borderColor:"var(--surface)",borderWidth:2}],
      },
      options:{
        responsive:true,maintainAspectRatio:false,
        plugins:{
          legend:{position:"bottom",labels:{color:T,boxWidth:12},onClick:()=>{}},
          tooltip:{callbacks:{label:ctx=>{
            const pct=((ctx.raw/total)*100).toFixed(1);
            return ` ${ctx.label}: ${fmt(ctx.raw)} (${pct}%)`;
          }}},
        },
      },
    });

    const top=items[0];
    if (top) {
      const pct=((top.count/total)*100).toFixed(1);
      setHTML("ptInsight",`${t("Most common event type","Tipo de evento más común")}: <strong>${ptLabel(top.point_type)}</strong> — ${pct}% (${fmt(top.count)} ${t("events","eventos")}).`);
    }
  }

  // ── Incident detail table ─────────────────────────────────────
  function renderTagTable() {
    setHTML("howToTable",
      t("<strong>How to read:</strong> Incident / need prevalence by tag. % uses total events as denominator, so each tag stays at or below 100%. Tags do not need to sum to 100 because one event can contain several tags.",
        "<strong>Cómo leer:</strong> Prevalencia de incidencias/necesidades por etiqueta. El % usa el total de eventos como denominador, así que cada etiqueta queda en 100% o menos. Las etiquetas no tienen por qué sumar 100 porque un evento puede contener varias."));

    const body  = document.getElementById("tagTableBody"); if(!body) return;
    const tags  = output?.tag_counts||[];
    const total = output?.kpis_global?.total_events || tags.reduce((s,x)=>s+x.count,0) || 1;

    body.innerHTML="";
    tags.forEach(row=>{
      const pct = parseFloat((row.prevalence_pct ?? (row.count/total*100)).toFixed(1));
      const catName = Object.keys(output?.series?.by_tag_in_category||{})
        .find(c=>(output.series.by_tag_in_category[c]||[]).some(x=>x.tag===row.tag))||"";
      const catColor = CAT_COLORS[catName]||"var(--surface-2)";
      const label = tagDisplayLabel(row.tag, row.label);
      const tr = document.createElement("tr");
      tr.innerHTML=`
        <td>${window.HFOFormat?.escapeHtml?.(label) || label}</td>
        <td>${catName?`<span style="font-size:11px;background:${catColor};color:#06111f;padding:2px 8px;border-radius:99px;font-weight:600;">${catName}</span>`:""}</td>
        <td class="number">${fmt(row.count)}</td>
        <td class="number">${fmt(row.people)}</td>
        <td class="number" style="color:var(--accent);font-weight:600">${pct}%</td>`;
      body.appendChild(tr);
    });

    // Summary box
    const sumEl=document.getElementById("tagSummaryBox"); if(!sumEl) return;
    const top3=tags.slice(0,3);
    const prot=tags.filter(x=>["pushback","beating","violence","detention"].includes(x.tag));
    const protTotal=prot.reduce((s,x)=>s+x.count,0);
    const protPct=parseFloat((protTotal/total*100).toFixed(1));
    const lines=[];
    lines.push(t(
      `Top 3 incident types: ${top3.map(x=>`<strong>${x.label||x.tag}</strong> (${parseFloat((x.count/total*100).toFixed(1))}%)`).join(", ")}.`,
      `Top 3 tipos de incidente: ${top3.map(x=>`<strong>${x.label||x.tag}</strong> (${parseFloat((x.count/total*100).toFixed(1))}%)`).join(", ")}.`
    ));
    if (protPct>10) {
      lines.push(t(
        `⚠ Protection incidents (violence, pushback, detention) account for <strong style="color:var(--danger)">${protPct}%</strong> of events — an operational warning signal.`,
        `⚠ Los incidentes de protección (violencia, pushback, detención) representan el <strong style="color:var(--danger)">${protPct}%</strong> de los eventos — señal de alerta operativa.`
      ));
    }
    sumEl.innerHTML=lines.map(l=>`<div style="margin-bottom:5px">• ${l}</div>`).join("");
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
       &nbsp;·&nbsp; ${fmt(dq.total_records)} ${L==="es"?"registros":"records"}`;

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
        `<td class="number">${fmt(f.filled)}</td>` +
        `<td class="number">${fmt(f.missing)}</td>` +
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
    renderCards();
    populateCategorySelector();
    renderTimeChart();
    renderRateChart();
    renderPtChart();
    renderTagTable();
    renderDataQuality(output?.data_quality);
    const empty=document.getElementById("emptyState");
    if (empty) empty.classList.toggle("hide",(output?.tag_counts?.length||0)>0);
    updateI18nElements();
    window.dispatchEvent(new CustomEvent("hfo:dashboard-rendered"));
  }

  // ── Bind controls ─────────────────────────────────────────────
  function bindControls() {
    const catSel=document.getElementById("categorySelector");
    if (catSel) catSel.addEventListener("change",()=>{
      activeCategory=catSel.value; activeTag="__all__";
      const tagSel=document.getElementById("tagSelector");
      if (tagSel) tagSel.innerHTML=`<option value="__all__">${t("All types","Todos los tipos")}</option>`;
      renderTimeChart();
    });
    const tagSel=document.getElementById("tagSelector");
    if (tagSel) tagSel.addEventListener("change",()=>{ activeTag=tagSel.value; renderTimeChart(); });
  }


  document.addEventListener("DOMContentLoaded",()=>{
    window.HFOPrefs.initBaseControls();
    bindControls();
    load();
    window.HFOApi.bindFilterReload(load, 80);
  });
})();
