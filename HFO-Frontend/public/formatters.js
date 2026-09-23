(function () {
  const numberFormatter = new Intl.NumberFormat("en-US");

  function number(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return numberFormatter.format(Number(value));
  }

  function percent(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return `${Number(value).toFixed(2)}%`;
  }

  function dateOnly(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function title(value) {
    if (value === null || value === undefined || value === "") return "Unknown";
    return String(value).replaceAll("_", " ");
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setStatus(id, text, kind = "") {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || "";
    el.className = `status ${kind}`.trim();
  }

  function clearChildren(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }


  // XSS protection: escape dynamic JSON values before inserting into innerHTML
  function escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  window.HFOFormat = { number, percent, dateOnly, title, setText, setStatus, clearChildren, escapeHtml };
})();
