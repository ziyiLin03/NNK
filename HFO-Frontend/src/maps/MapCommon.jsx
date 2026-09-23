/* eslint-disable react-refresh/only-export-components */
import {useCallback, useEffect, useMemo, useState} from "react";
import {
  fetchReportRows,
  formatDateInputValue,
  formatTags,
  getInitialDateRange,
  MAP_TAG_COLORS,
  MAP_TAG_CONFIG,
  normalizeReportToPoints,
  parseDateInputValue,
} from "./reportData.js";
import "./mapStyles.css";

export const INITIAL_VIEW_STATE = {
  longitude: 19.8,
  latitude: 44.2,
  zoom: 6.2,
  pitch: 0,
  bearing: 0,
};

export const MAP_STYLE = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

export function useReportPoints(defaultLookbackDays = 365) {
  const [points, setPoints] = useState([]);
  const [loadedDateRange, setLoadedDateRange] = useState(() => getInitialDateRange(defaultLookbackDays));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReports = useCallback(async (dateRange, options = {}) => {
    const {focus = false, onFocus = null, isCancelled = () => false} = options;
    setLoading(true);
    setError("");
    try {
      const rows = await fetchReportRows(dateRange);
      const parsedPoints = rows.flatMap((row) => normalizeReportToPoints(row));
      if (isCancelled()) {
        return;
      }
      setPoints(parsedPoints);
      setLoadedDateRange(dateRange);
      if (focus && parsedPoints.length > 0 && onFocus) {
        onFocus(parsedPoints);
      }
    } catch (loadError) {
      if (!isCancelled()) {
        setError(loadError.message || "Unable to load map data.");
        setPoints([]);
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const dateRange = getInitialDateRange(defaultLookbackDays);
    loadReports(dateRange, {
      focus: true,
      isCancelled: () => cancelled,
    });
    return () => {
      cancelled = true;
    };
  }, [defaultLookbackDays, loadReports]);

  return {points, loadedDateRange, loading, error, loadReports};
}

export function useDateAndCategoryFilters(points, initialDateRange, defaultRelativeDays = 30) {
  const [mode, setMode] = useState("relative");
  const [relativeDays, setRelativeDays] = useState(defaultRelativeDays);
  const [dateStart, setDateStart] = useState(initialDateRange.from);
  const [dateEnd, setDateEnd] = useState(initialDateRange.to);
  const [visibleTags, setVisibleTags] = useState(() => new Set(MAP_TAG_CONFIG.map((entry) => entry.key)));

  const latestTimestamp = useMemo(() => {
    let latest = null;
    for (const point of points) {
      if (Number.isFinite(point.timeTimestamp) && (latest === null || point.timeTimestamp > latest)) {
        latest = point.timeTimestamp;
      }
    }
    return latest;
  }, [points]);

  const filteredPoints = useMemo(() => {
    const startTimestamp = mode === "range"
      ? parseDateInputValue(dateStart, "start")
      : (latestTimestamp === null ? null : latestTimestamp - (relativeDays * 24 * 60 * 60 * 1000));
    const endTimestamp = mode === "range" ? parseDateInputValue(dateEnd, "end") : latestTimestamp;

    return points.filter((point) => {
      if (!visibleTags.has(point.pointType)) {
        return false;
      }
      if (!Number.isFinite(point.timeTimestamp)) {
        return startTimestamp === null && endTimestamp === null;
      }
      if (startTimestamp !== null && point.timeTimestamp < startTimestamp) {
        return false;
      }
      if (endTimestamp !== null && point.timeTimestamp > endTimestamp) {
        return false;
      }
      return true;
    });
  }, [dateEnd, dateStart, latestTimestamp, mode, points, relativeDays, visibleTags]);

  const toggleTag = useCallback((tag) => {
    setVisibleTags((previous) => {
      const next = new Set(previous);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }, []);

  return {
    mode,
    setMode,
    relativeDays,
    setRelativeDays,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    visibleTags,
    toggleTag,
    filteredPoints,
  };
}

export function focusViewOnPoints(points) {
  if (points.length === 0) {
    return INITIAL_VIEW_STATE;
  }

  const avgLongitude = points.reduce((sum, point) => sum + point.lon, 0) / points.length;
  const avgLatitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  return {
    ...INITIAL_VIEW_STATE,
    longitude: avgLongitude,
    latitude: avgLatitude,
    zoom: points.length > 1 ? 7 : 9,
  };
}

export function formatDateTime(value) {
  if (!value) {
    return "no data";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

export function describeLocation(point) {
  const parts = [point?.locationName, point?.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "no data";
}

export function ControlsPanel({
  title,
  subtitle,
  filters,
  stats,
  loading,
  error,
  onReload,
  extra,
}) {
  return (
    <aside className="hfo-map-panel">
      <h1 className="hfo-map-title">{title}</h1>
      <p className="hfo-map-subtitle">{subtitle}</p>

      <div className="hfo-map-actions">
        <button className={`hfo-map-button ${filters.mode === "relative" ? "is-active" : ""}`} onClick={() => filters.setMode("relative")}>
          Last days
        </button>
        <button className={`hfo-map-button ${filters.mode === "range" ? "is-active" : ""}`} onClick={() => filters.setMode("range")}>
          Date range
        </button>
        <button className="hfo-map-button" disabled={loading} onClick={onReload}>
          Refresh
        </button>
      </div>

      {filters.mode === "relative" ? (
        <label className="hfo-map-field">
          Days
          <input type="number" min="1" max="3650" value={filters.relativeDays} onChange={(event) => filters.setRelativeDays(Number(event.target.value) || 1)} />
        </label>
      ) : (
        <div className="hfo-map-row">
          <label className="hfo-map-field">
            From
            <input type="date" value={filters.dateStart} onChange={(event) => filters.setDateStart(event.target.value)} />
          </label>
          <label className="hfo-map-field">
            To
            <input type="date" value={filters.dateEnd} onChange={(event) => filters.setDateEnd(event.target.value)} />
          </label>
        </div>
      )}

      <div className="hfo-map-statline">
        {stats.map((stat) => (
          <div className="hfo-map-stat" key={stat.label}>
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>

      <div className="hfo-map-chips">
        {MAP_TAG_CONFIG.map((entry) => (
          <label className="hfo-map-chip" key={entry.key}>
            <input type="checkbox" checked={filters.visibleTags.has(entry.key)} onChange={() => filters.toggleTag(entry.key)} />
            <span className="hfo-map-swatch" style={{backgroundColor: `rgba(${MAP_TAG_COLORS[entry.key].join(",")})`}} />
            <span>{entry.label}</span>
          </label>
        ))}
      </div>

      {extra}
      {loading ? <div className="hfo-map-status">Loading backend reports...</div> : null}
      {error ? <div className="hfo-map-status hfo-map-error">{error}</div> : null}
    </aside>
  );
}

export function PointDetails({item, title = "Point details", onClose}) {
  if (!item) {
    return null;
  }

  const point = item.point ?? item;
  const tags = point.tags ?? [point.pointType];
  return (
    <aside className="hfo-map-details">
      <button className="hfo-map-button" onClick={onClose}>Close</button>
      <h2>{title}</h2>
      <dl>
        <dt>Type</dt>
        <dd>{formatTags(tags)}</dd>
        <dt>Report</dt>
        <dd>{point.testimonyId ?? point.entityId ?? "no data"}</dd>
        <dt>People</dt>
        <dd>{point.numPersons ?? point.numPers ?? "no data"}</dd>
        <dt>Event time</dt>
        <dd>{formatDateTime(point.eventTime ?? point.recordedTime)}</dd>
        <dt>Location</dt>
        <dd>{describeLocation(point)}</dd>
        <dt>Info</dt>
        <dd>{point.locationInfo ?? point.info ?? "no data"}</dd>
      </dl>
    </aside>
  );
}

export function loadedRangeLabel(range) {
  return `${range.from || "start"} to ${range.to || formatDateInputValue(Date.now())}`;
}
