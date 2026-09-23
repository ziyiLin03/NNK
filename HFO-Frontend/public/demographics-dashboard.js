(function () {
  "use strict";

  let loadSeq = 0;
  let output      = null;
  let genderView  = "global";
  let natView     = "global";
  let vulnView    = "global";
  let vulnFilter  = "__all__";

  // ── i18n ─────────────────────────────────────────────────────
  const STR = {
    en: {
      filter_hint: " Use the <strong>Regions</strong> and <strong>Time window</strong> filters on the left to narrow the data.",
      how_gender_global:   "The donut shows the <strong>overall gender distribution</strong> weighted by group size (numPersons) for the selected window. A heavily male-skewed distribution may indicate labour migration; a more balanced one often suggests family displacement.",
      how_gender_nat:      "Stacked bars show gender distribution <strong>per nationality</strong>. Nationalities with very high male % may indicate labour or solo migration. More balanced distributions often suggest family groups.",
      how_gender_legal:    "Stacked bars show gender distribution <strong>per legal status</strong>. Differences across statuses can reveal whether certain groups have distinct demographic profiles.",
      how_nat_global:      "Top nationalities by people represented. Shows the main origins of groups passing through recorded areas.",
      how_nat_region:      "Top nationalities per region. Differences reveal which national groups use which routes — useful for tailoring support.",
      how_nat_time:        "Monthly evolution of top nationalities. Rising lines = growing flows; falling lines may signal route changes. Use the nationality selector to focus on specific origins.",
      how_vuln_global:     "Most reported real vulnerability types only. 'None reported' and 'Unknown / not assessed' are kept in a separate status summary and are not mixed with vulnerability categories.",
      how_vuln_region:     "Vulnerability distribution per region shown as <strong>% of total people</strong> in that region. Use the vulnerability selector to focus on a specific type.",
      how_vuln_gender:     "Vulnerability distribution per gender as <strong>% of people in that gender group</strong>. Identifies gender-specific needs.",
      how_vuln_time:       "Monthly evolution of vulnerability types. Rising lines indicate increasing prevalence of that vulnerability over time.",
      how_health_region:   "<strong>Average health score per region</strong> (1=very poor, 5=very good). Lower scores = groups arriving in worse condition. 🔴 &lt;2.5 · 🟠 &lt;3 · 🟡 &lt;3.5 · 🟢 ≥3.5",
      how_health_gender:   "<strong>Average health score per gender</strong>. Differences may indicate gender-specific vulnerabilities.",
      how_health_nat:      "<strong>Average health score for top nationalities</strong>. Consistently lower scores may need prioritised health support.",
      how_health_time:     "Monthly evolution of the weighted average health score. A declining line means groups are arriving in worse health over time — a key operational signal.",
      how_quality:         "Completeness of critical fields. Low completeness affects the reliability of the breakdowns above.",
    },
    es: {
      filter_hint: " Usa los filtros de <strong>Regiones</strong> y <strong>Ventana temporal</strong> del panel izquierdo para acotar los datos.",
      how_gender_global:   "El donut muestra la <strong>distribución global de género</strong> ponderada por tamaño del grupo (numPersons) para la ventana seleccionada. Una distribución muy masculina puede indicar migración laboral; una más equilibrada suele asociarse a desplazamiento familiar.",
      how_gender_nat:      "Barras apiladas con la distribución de género <strong>por nacionalidad</strong>. % muy altos de hombres sugieren migración laboral; distribuciones más equilibradas suelen corresponder a grupos familiares.",
      how_gender_legal:    "Barras apiladas con la distribución de género <strong>por situación legal</strong>. Las diferencias pueden revelar perfiles demográficos distintos según el estatus.",
      how_nat_global:      "Principales nacionalidades por personas representadas. Muestra los orígenes principales de los grupos que pasan por las zonas registradas.",
      how_nat_region:      "Principales nacionalidades por región. Las diferencias revelan qué grupos nacionales usan qué rutas.",
      how_nat_time:        "Evolución mensual de las principales nacionalidades. Líneas crecientes = flujos en aumento; líneas decrecientes pueden indicar cambios de ruta. Usa el selector de nacionalidad para centrarte en orígenes específicos.",
      how_vuln_global:     "Solo tipos reales de vulnerabilidad. 'None reported' y 'Unknown / not assessed' se separan en un resumen de estado y no se mezclan con vulnerabilidades.",
      how_vuln_region:     "Distribución de vulnerabilidades por región en <strong>% sobre el total de personas</strong> de esa región. Usa el selector para centrarte en un tipo específico.",
      how_vuln_gender:     "Distribución de vulnerabilidades por género en <strong>% sobre las personas de ese género</strong>. Identifica necesidades específicas por género.",
      how_vuln_time:       "Evolución mensual de los tipos de vulnerabilidad. Líneas crecientes indican mayor prevalencia de esa vulnerabilidad con el tiempo.",
      how_health_region:   "<strong>Puntuación de salud media por región</strong> (1=muy mala, 5=muy buena). Puntuaciones bajas = grupos que llegan en peor estado. 🔴 &lt;2.5 · 🟠 &lt;3 · 🟡 &lt;3.5 · 🟢 ≥3.5",
      how_health_gender:   "<strong>Puntuación de salud media por género</strong>. Las diferencias pueden indicar vulnerabilidades específicas.",
      how_health_nat:      "<strong>Puntuación de salud media por nacionalidad (top)</strong>. Puntuaciones consistentemente bajas necesitan apoyo sanitario prioritario.",
      how_health_time:     "Evolución mensual de la puntuación de salud media ponderada. Una línea decreciente indica que los grupos llegan en peor estado con el tiempo — señal operativa clave.",
      how_quality:         "Completitud de los campos críticos. Una completitud baja afecta la fiabilidad de los análisis anteriores.",
    },
  };

  function lang() { try { return window.HFOPrefs?.load()?.language==="es"?"es":"en"; } catch(_){return "en";} }
  function s(k) { return STR[lang()]?.[k]||STR.en[k]||k; }
  function css(v) { return getComputedStyle(document.body).getPropertyValue(v).trim(); }
  function setText(id, val) { const el=document.getElementById(id); if(el) el.textContent=String(val); }
  function setHTML(id, html) { const el=document.getElementById(id); if(el) el.innerHTML=html; }
  function fmt(n) { return window.HFOFormat?.number(n)??String(n); }

  const PALETTE = ["#62b6ff","#75d6a0","#ffd166","#ff8fab","#b8a1ff","#f4a261","#7bdff2","#c3f584","#ffb3c6","#a0c4ff"];

  // ── Load ──────────────────────────────────────────────────────
  async function load() {
    try {
      const seq = ++loadSeq;
      const result = await window.HFOApi.loadDashboard("demographics", output?.meta || {});
      if (seq !== loadSeq) return;
      output = result.data;
      resetDynamicSelectors();
      render();
    } catch(err) {
      console.error(err);
      window.HFOFormat.setStatus("dashboardStatus",`Unable to load: ${err.message}`,"error");
    }
  }


  function resetDynamicSelectors() {
    const natSelector = document.getElementById("natSelector");
    if (natSelector) {
      natSelector.dataset.populated = "false";
      natSelector.innerHTML = "";
    }
    const currentVulns = new Set((output?.breakdowns?.vulnerability_types_by_people || []).map(v => v.label));
    if (vulnFilter !== "__all__" && !currentVulns.has(vulnFilter)) vulnFilter = "__all__";
  }

  // ── Meta sidebar ──────────────────────────────────────────────
  function renderMeta() {
    const meta  = output?.meta||{};
    const prefs = window.HFOPrefs.load();
    window.HFOFilters.renderTimeButtons("timeFilterButtons", prefs);
    window.HFOFilters.bindCustomDateInputs("customFrom","customTo",prefs,meta);
    window.HFOFilters.renderRegionButtons("regionFilterButtons", meta.available_regions||[], prefs.selectedRegions||[]);
    const regLabel = prefs.selectedRegions?.length ? prefs.selectedRegions.join(", ") : (window.HFOI18n?.t?.("All regions")||"All regions");
    window.HFOFormat.setText("metaSource",  meta.source_file||"testimonies.json");
    window.HFOFormat.setText("metaWindow",  `${window.HFOFormat.dateOnly(meta.window_from)} → ${window.HFOFormat.dateOnly(meta.window_to)}`);
    window.HFOFormat.setText("metaDataset", `${window.HFOFormat.dateOnly(meta.dataset_min_recorded_datetime)} → ${window.HFOFormat.dateOnly(meta.dataset_max_recorded_datetime)}`);
    window.HFOFormat.setText("metaRegions", regLabel);
  }

  // ── Overview cards ────────────────────────────────────────────
  function renderOverview() {
    const ov = output?.overview||{};
    const dq = output?.breakdowns?.data_quality_overview||{};
    setText("kpiPeople",        fmt(ov.total_people_represented));
    setText("kpiTestimonies",   fmt(ov.total_testimonies));
    setText("kpiEntities",      fmt(ov.total_entities));
    setText("kpiNationalities", fmt(ov.unique_nationalities));
    setText("kpiCompleteness",  dq.overall_completeness_pct!=null?`${dq.overall_completeness_pct}%`:"—");
  }

  // ── Chart helpers ─────────────────────────────────────────────
  function destroyChart(id) { const c=document.getElementById(id); if(c?._ci){c._ci.destroy();c._ci=null;} }
  function makeChart(id, config) {
    destroyChart(id);
    const canvas=document.getElementById(id);
    if(!canvas||!window.Chart) return;
    canvas._ci=new Chart(canvas,config);
  }
  function baseOpts(extra={}) {
    const M=css("--muted")||"#a9b9da", T=css("--text")||"#eef4ff", G=css("--chart-grid")||"rgba(169,185,218,.18)";
    return { responsive:true, maintainAspectRatio:false, plugins:{ legend:{labels:{color:T,boxWidth:12}} }, scales:{ x:{ticks:{color:M,maxRotation:45,autoSkip:true},grid:{color:G}}, y:{beginAtZero:true,ticks:{color:M},grid:{color:G}} }, ...extra };
  }
  function stackedOpts(yLabel="") {
    const M=css("--muted")||"#a9b9da", T=css("--text")||"#eef4ff", G=css("--chart-grid")||"rgba(169,185,218,.18)";
    return { responsive:true, maintainAspectRatio:false, plugins:{ legend:{labels:{color:T,boxWidth:12}} }, scales:{ x:{stacked:true,ticks:{color:M,maxRotation:35},grid:{color:G}}, y:{stacked:true,beginAtZero:true,max:100,title:{display:!!yLabel,text:yLabel,color:M},ticks:{color:M},grid:{color:G}} } };
  }

  // ── Gender ────────────────────────────────────────────────────
  function renderGender() {
    const howKey = genderView==="nationality"?"how_gender_nat":genderView==="legal"?"how_gender_legal":"how_gender_global";
    setHTML("howToGender", s(howKey)+"<br><br>"+s("filter_hint"));
    document.querySelectorAll("[data-gender-view]").forEach(b=>b.classList.toggle("active",b.dataset.genderView===genderView));

    const meta = output?.meta||{};
    const win  = window.HFOFilters.computeWindow(meta, window.HFOPrefs.load());

    if (genderView==="global") {
      const data = output?.breakdowns?.gender_by_people||[];
      const ov   = output?.overview||{};
      makeChart("genderChart",{
  type:"doughnut",
  data:{labels:data.map(d=>d.label),datasets:[{data:data.map(d=>d.testimonies_count),backgroundColor:PALETTE,borderColor:"var(--surface)",borderWidth:2}]},
  options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom",labels:{color:css("--text")||"#eef4ff",boxWidth:12},onClick:()=>{}},tooltip:{callbacks:{label:ctx=>` ${ctx.label}: ${fmt(ctx.raw)} (${data[ctx.dataIndex]?.share_people??0}%)`}}}}
});
      const top=data[0];
      // Contextual message with window info
      setHTML("genderInsight",
  `<strong>${lang()==="es"?"Ventana":"Window"}:</strong> ... ${fmt(ov.total_testimonies)} ...<br>`+
  (top?`${lang()==="es"?"Género más frecuente":"Most frequent gender"}: <strong>${top.label}</strong> — ${fmt(top.testimonies_count)} ${lang()==="es"?"testimonios":"testimonies"} (${top.share_people}%).`:""));
    } else {
      const key  = genderView==="nationality"?"gender_by_nationality":"gender_by_legal_situation";
      const data = (output?.breakdowns?.[key]||[]).slice(0,8);
      const genders = [...new Set(data.flatMap(d=>d.genders.map(g=>g.gender)))];
      const datasets = genders.map((gender,i)=>({
        label:gender,
        data:data.map(d=>{const g=d.genders.find(x=>x.gender===gender);return g?.pct||0;}),
        backgroundColor:PALETTE[i%PALETTE.length],borderWidth:0,borderRadius:3,
      }));
      makeChart("genderChart",{type:"bar",data:{labels:data.map(d=>d.context),datasets},options:stackedOpts("%")});
      const hi=data.reduce((best,d)=>{const m=d.genders.find(g=>g.gender==="Male")?.pct||0;return m>(best.pct||0)?{name:d.context,pct:m}:best;},{});
      setHTML("genderInsight",hi.name?`${lang()==="es"?"Mayor proporción masculina":"Highest male proportion"}: <strong>${hi.name}</strong> (${hi.pct}% ${lang()==="es"?"hombres":"male"}).`:"");
    }
  }

  // ── Nationality ───────────────────────────────────────────────
  function renderNationality() {
    const howKey = natView==="region"?"how_nat_region":natView==="time"?"how_nat_time":"how_nat_global";
    setHTML("howToNat", s(howKey)+"<br><br>"+s("filter_hint"));
    document.querySelectorAll("[data-nat-view]").forEach(b=>b.classList.toggle("active",b.dataset.natView===natView));

    const natSelectRow = document.getElementById("natSelectRow");
    if (natSelectRow) natSelectRow.style.display = natView==="time" ? "" : "none";

    if (natView==="global") {
      const data=(output?.breakdowns?.nationality_by_people||[]).slice(0,10);
      makeChart("natChart",{type:"bar",data:{labels:data.map(d=>d.label),datasets:[{label:lang()==="es"?"Personas":"People",data:data.map(d=>d.testimonies_count),backgroundColor:PALETTE,borderWidth:0,borderRadius:4}]},options:{...baseOpts(),indexAxis:"y",plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>` ${fmt(ctx.raw)} (${data[ctx.dataIndex]?.share_people??0}%)`}}}}});
      const top=data[0];
      setHTML("natInsight",top?`${lang()==="es"?"Nacionalidad principal":"Top nationality"}: <strong>${top.label}</strong> — ${fmt(top.people_represented)} ${lang()==="es"?"personas":"people"} (${top.share_people}%).`:"");

    } else if (natView==="region") {
      const regions=(output?.breakdowns?.nationality_by_region||[]).slice(0,5);
      const allNats=[...new Set(regions.flatMap(r=>r.nationalities.map(n=>n.nationality)))].slice(0,8);
      const datasets=allNats.map((nat,i)=>({label:nat,data:regions.map(r=>{const n=r.nationalities.find(x=>x.nationality===nat);return n?.pct||0;}),backgroundColor:PALETTE[i%PALETTE.length],borderWidth:0,borderRadius:3}));
      makeChart("natChart",{type:"bar",data:{labels:regions.map(r=>r.region),datasets},options:stackedOpts("%")});
      setHTML("natInsight",`${lang()==="es"?"Composición de nacionalidades por las 5 regiones más activas (% sobre personas en esa región).":"Nationality composition across top 5 regions (% of people in that region)."}`);

    } else {
      const natTime  = output?.breakdowns?.nationality_over_time||{};
      const buckets  = natTime.buckets||[];
      const allNats  = natTime.nationalities||[];
      // Get selected nats from UI
      const selNats  = getSelectedNats(allNats);
      const series   = (natTime.series||[]).filter(s=>selNats.includes(s.nationality));
      const datasets = series.map((s,i)=>({label:s.nationality,data:s.data,borderColor:PALETTE[i%PALETTE.length],backgroundColor:"transparent",borderWidth:2.5,pointRadius:0,tension:0.3,fill:false}));
      const opts=baseOpts(); opts.scales.x.ticks.maxTicksLimit=12; opts.scales.y.title={display:true,text:lang()==="es"?"Personas":"People",color:css("--muted")||"#a9b9da"};
      makeChart("natChart",{type:"line",data:{labels:buckets,datasets},options:opts});
      // Populate nat selector
      populateNatSelector(allNats);
      const latest=series.map(s=>({nat:s.nationality,last:s.data[s.data.length-1]||0})).sort((a,b)=>b.last-a.last);
      const top=latest[0];
      setHTML("natInsight",top?`${lang()==="es"?"Mayor flujo reciente":"Highest recent flow"}: <strong>${top.nat}</strong> (${fmt(top.last)} ${lang()==="es"?"personas último mes":"people last month"}).`:"");
    }
  }

  function getSelectedNats(allNats) {
    const sel=document.getElementById("natSelector");
    if (!sel) return allNats.slice(0,5);
    const checked=[...sel.querySelectorAll("input:checked")].map(i=>i.value);
    return checked.length ? checked : allNats.slice(0,5);
  }

  function populateNatSelector(allNats) {
    const container=document.getElementById("natSelector");
    if (!container||container.dataset.populated==="true") return;
    container.innerHTML="";
    allNats.forEach((nat,i)=>{
      const label=document.createElement("label");
      label.style.cssText="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;";
      const cb=document.createElement("input");
      cb.type="checkbox"; cb.value=nat; cb.checked=i<5;
      cb.addEventListener("change",renderNationality);
      const dot=document.createElement("span");
      dot.style.cssText=`width:10px;height:10px;border-radius:50%;background:${PALETTE[i%PALETTE.length]};display:inline-block;`;
      label.appendChild(cb); label.appendChild(dot); label.appendChild(document.createTextNode(nat));
      container.appendChild(label);
    });
    container.dataset.populated="true";
  }

  // ── Vulnerability ─────────────────────────────────────────────
  function renderVulnerability() {
    const howKey=vulnView==="region"?"how_vuln_region":vulnView==="gender"?"how_vuln_gender":vulnView==="time"?"how_vuln_time":"how_vuln_global";
    const status = output?.breakdowns?.vulnerability_status_by_people || [];
    const statusText = status.length ? status.map(x => `${x.label}: ${x.pct}%`).join(" · ") : "";
    setHTML("howToVuln", s(howKey) + (statusText ? `<br><br><strong>${lang()==="es"?"Estado de vulnerabilidad":"Vulnerability status"}:</strong> ${window.HFOFormat?.escapeHtml?.(statusText) || statusText}` : "") + "<br><br>" + s("filter_hint"));
    document.querySelectorAll("[data-vuln-view]").forEach(b=>b.classList.toggle("active",b.dataset.vulnView===vulnView));

    const vulnSelectRow=document.getElementById("vulnSelectRow");
    if (vulnSelectRow) vulnSelectRow.style.display=(vulnView==="region"||vulnView==="gender")?"":"none";

    if (vulnView==="global") {
      const data=(output?.breakdowns?.vulnerability_types_by_people||[]).slice(0,10);
      makeChart("vulnChart",{type:"bar",data:{labels:data.map(d=>d.label),datasets:[{label:lang()==="es"?"Personas":"People",data:data.map(d=>d.testimonies_count),backgroundColor:PALETTE,borderWidth:0,borderRadius:4}]},options:{...baseOpts(),indexAxis:"y",plugins:{legend:{display:false}}}});
      const top=data[0];
      setHTML("vulnInsight",top?`${lang()==="es"?"Vulnerabilidad más frecuente":"Most frequent vulnerability"}: <strong>${top.label}</strong> — ${fmt(top.people_represented)} ${lang()==="es"?"personas":"people"}.`:"");

    } else if (vulnView==="region") {
      const regions=(output?.breakdowns?.vulnerability_by_region||[]).slice(0,5);
      // Filter by selected vulnerability
      let datasets;
      if (vulnFilter==="__all__") {
        const allVulns=[...new Set(regions.flatMap(r=>r.vulnerabilities.map(v=>v.vulnerability)))].slice(0,8);
        datasets=allVulns.map((v,i)=>({label:v,data:regions.map(r=>{const vv=r.vulnerabilities.find(x=>x.vulnerability===v);return vv?.pct||0;}),backgroundColor:PALETTE[i%PALETTE.length],borderWidth:0,borderRadius:3}));
        makeChart("vulnChart",{type:"bar",data:{labels:regions.map(r=>r.region),datasets},options:stackedOpts("%")});
        setHTML("vulnInsight",`${lang()==="es"?"Distribución % por región. Las barras suman 100% por región.":"% distribution per region. Bars sum to 100% per region."}`);
      } else {
        const data=regions.map(r=>({region:r.region,pct:r.vulnerabilities.find(v=>v.vulnerability===vulnFilter)?.pct||0}));
        makeChart("vulnChart",{type:"bar",data:{labels:data.map(d=>d.region),datasets:[{label:`${vulnFilter} (%)`,data:data.map(d=>d.pct),backgroundColor:PALETTE,borderWidth:0,borderRadius:4}]},options:{...baseOpts(),plugins:{legend:{display:false}}}});
        const top=data.sort((a,b)=>b.pct-a.pct)[0];
        setHTML("vulnInsight",top?`${lang()==="es"?"Región más afectada por":"Region most affected by"} <strong>${vulnFilter}</strong>: ${top.region} (${top.pct}%).`:"");
      }
      populateVulnSelector(output?.breakdowns?.vulnerability_types_by_people||[]);

    } else if (vulnView==="gender") {
      const data=(output?.breakdowns?.vulnerability_by_gender||[]).slice(0,10);
      let datasets;
      if (vulnFilter==="__all__") {
        const genders=[...new Set(data.flatMap(d=>d.genders.map(g=>g.gender)))];
        datasets=genders.map((gender,i)=>({label:gender,data:data.map(d=>{const g=d.genders.find(x=>x.gender===gender);return g?.pct||0;}),backgroundColor:PALETTE[i%PALETTE.length],borderWidth:0,borderRadius:3}));
        makeChart("vulnChart",{type:"bar",data:{labels:data.map(d=>d.vulnerability),datasets},options:stackedOpts("%")});
        setHTML("vulnInsight",`${lang()==="es"?"Distribución % por género.":"% distribution per gender."}`);
      } else {
        const item=data.find(d=>d.vulnerability===vulnFilter);
        if (item) {
          makeChart("vulnChart",{type:"bar",data:{labels:item.genders.map(g=>g.gender),datasets:[{label:`${vulnFilter} (%)`,data:item.genders.map(g=>g.pct),backgroundColor:PALETTE,borderWidth:0,borderRadius:4}]},options:{...baseOpts(),plugins:{legend:{display:false}}}});
          const top=item.genders.sort((a,b)=>b.pct-a.pct)[0];
          setHTML("vulnInsight",top?`<strong>${vulnFilter}</strong>: ${lang()==="es"?"más prevalente en":"most prevalent in"} ${top.gender} (${top.pct}%).`:"");
        }
      }
      populateVulnSelector(output?.breakdowns?.vulnerability_types_by_people||[]);

    } else {
      // Over time
      const vt=output?.breakdowns?.vulnerability_over_time||{};
      const datasets=(vt.series||[]).map((s,i)=>({label:s.vulnerability,data:s.data,borderColor:PALETTE[i%PALETTE.length],backgroundColor:"transparent",borderWidth:2.5,pointRadius:0,tension:0.3,fill:false}));
      const opts=baseOpts(); opts.scales.x.ticks.maxTicksLimit=12; opts.scales.y.title={display:true,text:lang()==="es"?"Personas":"People",color:css("--muted")||"#a9b9da"};
      makeChart("vulnChart",{type:"line",data:{labels:vt.buckets||[],datasets},options:opts});
      // Insight: find fastest growing vulnerability
      const growth=(vt.series||[]).map(s=>{const last=s.data[s.data.length-1]||0,prev=s.data[s.data.length-2]||0;return{v:s.vulnerability,delta:last-prev};}).sort((a,b)=>b.delta-a.delta);
      const top=growth[0];
      setHTML("vulnInsight",top&&top.delta>0?`${lang()==="es"?"Mayor crecimiento reciente":"Fastest growing recently"}: <strong>${top.v}</strong> (+${top.delta} ${lang()==="es"?"personas último mes":"people last month"}).`:(top?`${lang()==="es"?"Tendencia estable en todas las vulnerabilidades.":"All vulnerabilities are stable."}`:""));
    }
  }

  function populateVulnSelector(vulns) {
    const sel=document.getElementById("vulnSelector");
    if (!sel) return;
    const current=vulnFilter;
    sel.innerHTML=`<option value="__all__">${lang()==="es"?"Todas las vulnerabilidades":"All vulnerabilities"}</option>`;
    vulns.slice(0,10).forEach(v=>{
      const opt=document.createElement("option");
      opt.value=v.label; opt.textContent=v.label;
      sel.appendChild(opt);
    });
    sel.value=current;
  }

  // ── Nationality summary box ───────────────────────────────────
  function renderNatSummary() {
    const el = document.getElementById("natSummaryBox");
    if (!el || !output) return;
    const data  = output?.breakdowns?.nationality_by_people || [];
    const byReg = output?.breakdowns?.nationality_by_region || [];
    const ov    = output?.overview || {};
    if (!data.length) { el.innerHTML = ""; return; }

    const lines = [];
    // Top 3 nationalities
    const top3 = data.slice(0,3);
    lines.push(lang()==="es"
      ? `Las 3 principales nacionalidades representan el <strong>${top3.reduce((s,d)=>s+d.share_people,0).toFixed(1)}%</strong> de las personas: ${top3.map(d=>`<strong>${d.label}</strong> (${d.share_people}%)`).join(", ")}.`
      : `The top 3 nationalities account for <strong>${top3.reduce((s,d)=>s+d.share_people,0).toFixed(1)}%</strong> of people: ${top3.map(d=>`<strong>${d.label}</strong> (${d.share_people}%)`).join(", ")}.`);

    // Most diverse region
    if (byReg.length) {
      const mostDiverse = byReg.reduce((best,r)=>r.nationalities.length>best.nationalities.length?r:best, byReg[0]);
      lines.push(lang()==="es"
        ? `Región más diversa: <strong>${mostDiverse.region}</strong> (${mostDiverse.nationalities.length} nacionalidades distintas).`
        : `Most diverse region: <strong>${mostDiverse.region}</strong> (${mostDiverse.nationalities.length} distinct nationalities).`);
    }

    // Unknown nationality warning
    const unknown = data.find(d=>d.label==="Unknown");
    if (unknown && unknown.share_people > 10) {
      lines.push(lang()==="es"
        ? `⚠ El <strong>${unknown.share_people}%</strong> de las personas tienen nacionalidad desconocida — esto puede afectar la fiabilidad del análisis.`
        : `⚠ <strong>${unknown.share_people}%</strong> of people have unknown nationality — this may affect analysis reliability.`);
    }

    el.innerHTML = lines.map(l=>`<div style="margin-bottom:5px">• ${l}</div>`).join("");
  }

  // ── Data quality ──────────────────────────────────────────────  // ── Data quality ──────────────────────────────────────────────
  function renderQuality() {
    const dq=output?.breakdowns?.data_quality_overview||{};
    const fields=dq.field_completeness||output?.data_quality?.critical_field_completeness||[];

    // Completeness bar
    const pct=dq.overall_completeness_pct??dq.overall_pct??0;
    const color=pct>=90?"var(--ok)":pct>=70?"var(--warning)":"var(--danger)";
    setHTML("completenessBar",
      `<div style="background:var(--surface-2);border-radius:8px;height:12px;overflow:hidden;margin-bottom:8px;">
        <div style="background:${color};height:100%;width:${pct}%;border-radius:8px;transition:width .4s;"></div>
       </div>
       <span style="color:${color};font-weight:700">${pct}%</span> ${lang()==="es"?"completitud global":"overall completeness"}`);

    // Insight with suggestion
    if (dq.worst_field) {
      const suggestions = {
        vulnerability_types:   lang()==="es"?"Considera hacerlo obligatorio en el formulario de campo.":"Consider making it required in the field form.",
        gender:                lang()==="es"?"Añade una opción 'Prefiero no decirlo' para aumentar la tasa de respuesta.":"Add a 'Prefer not to say' option to improve response rate.",
        nationality:           lang()==="es"?"Incluye una lista desplegable de países para facilitar el registro.":"Include a country dropdown to simplify recording.",
        general_health:        lang()==="es"?"Usa una escala visual simple del 1 al 5 en la app de campo.":"Use a simple 1–5 visual scale in the field app.",
        current_Location:      lang()==="es"?"Activa la geolocalización automática en la app para reducir errores de entrada.":"Enable automatic geolocation in the app to reduce manual entry errors.",
      };
      const sugg=suggestions[dq.worst_field]||"";
      setHTML("qualityInsight",
        `${lang()==="es"?"Campo con menor completitud":"Lowest completeness field"}: <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). ${sugg}`);
    }

    // Summary box
    const sumBox=document.getElementById("qualitySummaryBox");
    if (sumBox) {
      const lines=[];
      const pctVal=dq.overall_completeness_pct??0;
      const healthColor = pctVal>=90?"var(--ok)":pctVal>=70?"var(--warning)":"var(--danger)";
      lines.push(lang()==="es"
        ? `Completitud global del dataset: <strong style="color:${healthColor}">${pctVal}%</strong> de todos los campos críticos están completos en la ventana seleccionada.`
        : `Overall dataset completeness: <strong style="color:${healthColor}">${pctVal}%</strong> of all critical fields are complete in the selected window.`);
      if (dq.worst_field) {
        lines.push(lang()==="es"
          ? `El campo menos completo es <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). Una baja completitud en este campo puede afectar los análisis de ${dq.worst_field==="gender"?"género":dq.worst_field==="nationality"?"nacionalidad":dq.worst_field==="vulnerability_types"?"vulnerabilidades":"salud"}.`
          : `The least complete field is <strong>${dq.worst_field}</strong> (${dq.worst_pct}%). Low completeness here affects the ${dq.worst_field==="gender"?"gender":dq.worst_field==="nationality"?"nationality":dq.worst_field==="vulnerability_types"?"vulnerability":"health"} analysis above.`);
      }
      if (pctVal<70) {
        lines.push(lang()==="es"
          ? `⚠ La completitud está por debajo del 70% — los análisis demográficos pueden no ser representativos.`
          : `⚠ Completeness is below 70% — demographic analyses may not be representative.`);
      }
      sumBox.innerHTML=lines.map(l=>`<div style="margin-bottom:5px">• ${l}</div>`).join("");
    }

    // Table
    const body=document.getElementById("qualityTableBody");
    if (!body) return;
    body.innerHTML="";
    fields.forEach(f=>{
      const pctF=f.fill_percent??f.fill_percent??0;
      const barColor=pctF>=90?"var(--ok)":pctF>=70?"var(--warning)":"var(--danger)";
      const tr=document.createElement("tr");
      tr.innerHTML=`
        <td><code>${f.field}</code></td>
        <td class="number">${fmt(f.filled??f.filled_records)}</td>
        <td class="number">${fmt(f.missing??f.empty_or_missing_records)}</td>
        <td class="number">
          <div style="display:flex;align-items:center;gap:8px;justify-content:flex-end;">
            <div style="background:var(--surface-2);border-radius:4px;height:6px;width:60px;overflow:hidden;">
              <div style="background:${barColor};height:100%;width:${pctF}%;"></div>
            </div>
            <span style="color:${barColor}">${pctF}%</span>
          </div>
        </td>`;
      body.appendChild(tr);
    });
  }

  // ── Nationality table ─────────────────────────────────────────
  function renderNatTable() {
    const body=document.getElementById("breakdownTableBody");
    if (!body) return;
    const data=(output?.breakdowns?.nationality_by_people||[]).slice(0,15);
    body.innerHTML="";
    data.forEach(row=>{
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${row.label}</td><td class="number">${fmt(row.people_represented)}</td><td class="number">${fmt(row.testimonies_count)}</td><td class="number">${row.share_people}%</td>`;
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
  function render() {
    if (!output) return;
    renderMeta();
    renderOverview();
    renderGender();
    renderNationality();
    renderVulnerability();
    renderNatTable();
    renderNatSummary();
    renderQuality();
    const empty=document.getElementById("emptyState");
    if (empty) empty.classList.toggle("hide",(output?.overview?.total_testimonies||0)>0);
    updateI18nElements();
    window.dispatchEvent(new CustomEvent("hfo:dashboard-rendered"));
  }

  // ── Bind controls ─────────────────────────────────────────────
  function bindControls() {
    // No chart-level filters. Each chart uses its default, most readable view.
    genderView = "global";
    natView = "global";
    vulnView = "global";
    vulnFilter = "__all__";
  }


  document.addEventListener("DOMContentLoaded",()=>{
    window.HFOPrefs.initBaseControls();
    bindControls();
    load();
    window.HFOApi.bindFilterReload(load, 80);
  });
})();
