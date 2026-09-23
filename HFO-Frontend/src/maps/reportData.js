export const MAP_TAG_CONFIG = [
  {key: "mafia", label: "Mafia", color: [44, 62, 80, 220]},
  {key: "violence", label: "Violence", color: [193, 18, 31, 220]},
  {key: "robbery", label: "Robbery", color: [192, 57, 43, 220]},
  {key: "extortion", label: "Extortion", color: [211, 84, 0, 220]},
  {key: "medical", label: "Medical", color: [40, 167, 69, 220]},
  {key: "shelter", label: "Shelter", color: [142, 68, 173, 220]},
  {key: "food", label: "Food", color: [255, 193, 7, 220]},
  {key: "police", label: "Police", color: [0, 86, 179, 220]},
  {key: "pushback", label: "Pushback", color: [230, 126, 34, 220]},
  {key: "safe_point", label: "Safe point", color: [39, 174, 96, 220]},
  {key: "nothing", label: "Default", color: [255, 255, 255, 220]},
  {key: "future", label: "Future", color: [41, 128, 185, 220]},
  {key: "origin", label: "Origin", color: [114, 246, 255, 220]},
  {key: "destination", label: "Destination", color: [97, 4, 4, 220]},
];

export const MAP_TAGS = MAP_TAG_CONFIG.map((entry) => entry.key);
export const MAP_TAG_LABELS = Object.fromEntries(MAP_TAG_CONFIG.map((entry) => [entry.key, entry.label]));
export const MAP_TAG_COLORS = Object.fromEntries(MAP_TAG_CONFIG.map((entry) => [entry.key, entry.color]));
export const UNKNOWN_TAG_COLOR = [120, 120, 120, 210];

const VALID_TAGS = new Set(MAP_TAGS);
const TAG_ALIASES = {
  actual: "safe_point",
  current: "safe_point",
  default: "nothing",
  medical_help: "medical",
  policia: "police",
  previous: "nothing",
  refuge: "shelter",
  refuge_shelter: "shelter",
  safe: "safe_point",
};

export function getApiBase() {
  if (window.API_BASE_URL) {
    return window.API_BASE_URL.replace(/\/$/, "");
  }

  const {hostname, port} = window.location;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    return "https://hfobackend-production.up.railway.app";
  }

  return port && port !== "8000" ? "http://localhost:8000" : "";
}

function getAccessToken() {
  return localStorage.getItem("access_token")
    ?? localStorage.getItem("access")
    ?? localStorage.getItem("token");
}

function reportAuthProblem() {
  throw new Error("Authentication required. Please log in again before opening the maps.");
}

async function fetchJson(url) {
  const token = getAccessToken();
  if (!token) {
    reportAuthProblem();
  }

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    reportAuthProblem();
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload?.detail || payload?.message || JSON.stringify(payload);
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(detail ? `${response.status}: ${detail}` : `HTTP ${response.status}`);
  }

  return response.json();
}

function buildReportsUrl(dateRange = {}) {
  const endpoint = window.DATASET_ENDPOINT ?? "/api/reports/";
  const url = new URL(endpoint, getApiBase() || window.location.origin);
  url.searchParams.set("has_map", "true");
  url.searchParams.set("ordering", "-timestamp");

  const fromParam = window.DATASET_DATE_FROM_PARAM ?? "fecha_desde";
  const toParam = window.DATASET_DATE_TO_PARAM ?? "fecha_hasta";
  if (dateRange.from) {
    url.searchParams.set(fromParam, dateRange.from);
  }
  if (dateRange.to) {
  // Append end-of-day time so backend includes all of the 'to' date
  url.searchParams.set(toParam, `${dateRange.to}T23:59:59`);
}

  return url;
}

export async function fetchReportRows(dateRange = {}) {
  const rows = [];
  let nextUrl = buildReportsUrl(dateRange).toString();

  while (nextUrl) {
    const payload = await fetchJson(nextUrl);
    const pageRows = Array.isArray(payload) ? payload : (payload?.results ?? payload?.data ?? []);
    rows.push(...pageRows);
    nextUrl = Array.isArray(payload) ? null : payload?.next;
  }

  return rows;
}

export function inputDateDaysAgo(daysAgo) {
  const date = new Date();
  // Change noon to end-of-day so today's reports are never cut off
  date.setHours(23, 59, 59, 999);
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export function getInitialDateRange(lookbackDays = 365) {
  return {
    from: inputDateDaysAgo(lookbackDays),
    to: inputDateDaysAgo(0),
  };
}

export function parseDateInputValue(value, boundary = "start") {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }

  const date = boundary === "end"
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  const timestamp = date.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function formatDateInputValue(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseFiniteNumber(value) {
  const numericValue = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

export function normalizeTag(value, fallback = "nothing") {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  const tag = TAG_ALIASES[normalized] ?? normalized;
  return VALID_TAGS.has(tag) ? tag : null;
}

export function normalizeTimestamp(value) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(String(value).includes("T") ? value : String(value).replace(" ", "T"));
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function normalizeReportToPoints(rawRecord) {
  if (!rawRecord || typeof rawRecord !== "object") {
    return [];
  }

  const positions = Array.isArray(rawRecord.positions) ? rawRecord.positions : [];
  const entityId = rawRecord.id ?? rawRecord.group_id ?? "unknown_entity";
  const eventTime = rawRecord.hora_evento ?? null;
  const recordedTime = rawRecord.timestamp ?? null;
  const eventTimestamp = normalizeTimestamp(eventTime) ?? normalizeTimestamp(recordedTime);
  const numPersons = parseFiniteNumber(rawRecord.people_count);

  return positions
    .map((position, index) => {
      const latitude = parseFiniteNumber(position?.latitude);
      const longitude = parseFiniteNumber(position?.longitude);
      const pointType = normalizeTag(position?.category);
      if (latitude === null || longitude === null || !pointType) {
        return null;
      }

      const sequenceIndex = parseFiniteNumber(position?.order);
      return {
        id: `${entityId}:${Number.isFinite(sequenceIndex) ? sequenceIndex : index}`,
        testimonyId: rawRecord.id ?? null,
        entityId,
        groupId: rawRecord.group_id ?? null,
        position: [longitude, latitude],
        lat: latitude,
        lon: longitude,
        pointType,
        tags: [pointType],
        color: MAP_TAG_COLORS[pointType] ?? UNKNOWN_TAG_COLOR,
        sequenceIndex: Number.isFinite(sequenceIndex) ? sequenceIndex : null,
        order: Number.isFinite(sequenceIndex) ? sequenceIndex : Number.MAX_SAFE_INTEGER,
        numPersons: Number.isFinite(numPersons) ? numPersons : null,
        numPers: Number.isFinite(numPersons) ? numPersons : 1,
        weight: Number.isFinite(numPersons) && numPersons > 0 ? numPersons : 1,
        eventDatetime: eventTime,
        eventTime,
        eventTimestamp,
        timeTimestamp: eventTimestamp,
        recordedDatetime: recordedTime,
        recordedTime,
        timezone: rawRecord.timezone ?? null,
        info: position?.description ?? null,
        locationInfo: position?.description ?? null,
        locationName: position?.location_name ?? null,
        country: position?.country ?? null,
        rawRecord,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.sequenceIndex !== null && right.sequenceIndex !== null && left.sequenceIndex !== right.sequenceIndex) {
        return left.sequenceIndex - right.sequenceIndex;
      }
      return (left.eventTimestamp ?? 0) - (right.eventTimestamp ?? 0);
    });
}

export function formatTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return "no data";
  }
  return tags.map((tag) => MAP_TAG_LABELS[tag] ?? tag).join(", ");
}
