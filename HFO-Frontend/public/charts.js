(function () {
  const instances = new Map();

  function cssVar(name) {
    return getComputedStyle(document.body).getPropertyValue(name).trim();
  }

  function palette() {
    return [
      cssVar("--accent") || "#62b6ff",
      "#75d6a0",
      "#ffd166",
      "#ff8fab",
      "#b8a1ff",
      "#f4a261",
      "#7bdff2",
      "#c3f584",
      "#ffb3c6",
      "#a0c4ff",
      "#d0f4de",
      "#fcf6bd"
    ];
  }

  function baseOptions(extra = {}) {
    const text = cssVar("--text");
    const muted = cssVar("--muted");
    const grid = cssVar("--chart-grid");
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: text, boxWidth: 12, boxHeight: 12 } },
        tooltip: { mode: "index", intersect: false }
      },
      scales: {
        x: { ticks: { color: muted, maxRotation: 45, minRotation: 0 }, grid: { color: grid } },
        y: { ticks: { color: muted }, grid: { color: grid }, beginAtZero: true }
      },
      ...extra
    };
  }

  function destroy(id) {
    const chart = instances.get(id);
    if (chart) {
      chart.destroy();
      instances.delete(id);
    }
  }

  function render(id, config) {
    const canvas = document.getElementById(id);
    if (!canvas || !window.Chart) return;
    destroy(id);
    const chart = new Chart(canvas, config);
    instances.set(id, chart);
  }

  function renderLineBar(id, rows, options = {}) {
    const colors = palette();
    const labels = rows.map((row) => row.bucket_label || row.bucket_start || "");
    render(id, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            type: "bar",
            label: options.barLabel || "People represented",
            data: rows.map((row) => row.people_represented || 0),
            backgroundColor: colors[0],
            borderColor: colors[0]
          },
          {
            type: "line",
            label: options.lineLabel || "Testimonies",
            data: rows.map((row) => row.testimonies_count || 0),
            borderColor: colors[1],
            backgroundColor: colors[1],
            tension: .25,
            yAxisID: "y1"
          }
        ]
      },
      options: baseOptions({
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { ticks: { color: cssVar("--muted"), maxRotation: 45 }, grid: { color: cssVar("--chart-grid") } },
          y: { position: "left", beginAtZero: true, ticks: { color: cssVar("--muted") }, grid: { color: cssVar("--chart-grid") } },
          y1: { position: "right", beginAtZero: true, ticks: { color: cssVar("--muted") }, grid: { drawOnChartArea: false } }
        }
      })
    });
  }

  function renderBar(id, labels, values, label) {
    const colors = palette();
    render(id, {
      type: "bar",
      data: { labels, datasets: [{ label, data: values, backgroundColor: colors[0], borderColor: colors[0] }] },
      options: baseOptions({ plugins: { legend: { display: false } } })
    });
  }

  function renderHorizontalBar(id, rows, labelKey, valueKey, label) {
    const colors = palette();
    render(id, {
      type: "bar",
      data: {
        labels: rows.map((row) => row[labelKey]),
        datasets: [{ label, data: rows.map((row) => row[valueKey] || 0), backgroundColor: rows.map((_, i) => colors[i % colors.length]) }]
      },
      options: baseOptions({
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: cssVar("--muted") }, grid: { color: cssVar("--chart-grid") } },
          y: { ticks: { color: cssVar("--muted") }, grid: { color: cssVar("--chart-grid") } }
        }
      })
    });
  }

  function renderDoughnut(id, rows, labelKey, valueKey) {
    const colors = palette();
    render(id, {
      type: "doughnut",
      data: {
        labels: rows.map((row) => row[labelKey]),
        datasets: [{ data: rows.map((row) => row[valueKey] || 0), backgroundColor: rows.map((_, i) => colors[i % colors.length]), borderColor: cssVar("--surface"), borderWidth: 2 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { color: cssVar("--text"), boxWidth: 12, boxHeight: 12 }, onClick: () => {} } }
      }
    });
  }

  function destroyAll() {
    Array.from(instances.keys()).forEach(destroy);
  }

  window.HFOCharts = { renderLineBar, renderBar, renderHorizontalBar, renderDoughnut, destroy, destroyAll };
})();
