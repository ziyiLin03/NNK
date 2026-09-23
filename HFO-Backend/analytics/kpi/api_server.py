"""Local HFO Analytics API and static file server.

Run from project root:
    python backend/api_server.py

Open:
    http://localhost:8000/frontend/dashboards/index.html

The API is intentionally simple so the application team can reuse the data contract:
    /api/analytics/operational-kpis
    /api/analytics/demographics-kpis
    /api/analytics/incident-needs
    /api/analytics/data-quality
    /api/analytics/mobility-route

Common query params:
    from=ISO_DATETIME
    to=ISO_DATETIME
    regions=Ceuta,Trieste
    granularity=auto|hour|day|week|month|year
    max_points=120
    max_records=warning threshold for the initial database load estimate
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import build_dashboards as dashboards  # noqa: E402
import build_demographics_kpis as demographics  # noqa: E402
import build_operational_kpis as operational  # noqa: E402
from kpi_utils import coerce_window, iso_dt, load_json, normalize_regions  # noqa: E402


DEFAULT_LOAD_MAX_RECORDS = 6000
HARD_LOAD_MAX_RECORDS = 100000

DATASET_SPECS = {
    "testimonies": {
        "path": PROJECT_ROOT / "data_mock" / "testimonies.json",
        "time_fields": ("recorded_datetime", "event_datetime"),
    },
    "events": {
        "path": PROJECT_ROOT / "data_mock" / "events.json",
        "time_fields": ("recorded_datetime", "event_datetime"),
    },
    "trajectories": {
        "path": PROJECT_ROOT / "data_mock" / "trajectories.json",
        "time_fields": ("event_datetime", "recorded_datetime"),
    },
}


class LoadWindowTooLarge(Exception):
    def __init__(self, total: int, limit: int, breakdown: dict[str, int]):
        super().__init__(f"Selected load window contains {total:,} records, above the configured limit of {limit:,}.")
        self.total = total
        self.limit = limit
        self.breakdown = breakdown


def parse_dt(value: str | None):
    raw = normalize_iso(value)
    if not raw:
        return None
    dt = datetime.fromisoformat(raw)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)


def row_datetime(row: dict[str, Any], fields: tuple[str, ...]):
    for field in fields:
        value = row.get(field)
        if not value:
            continue
        try:
            return parse_dt(str(value))
        except ValueError:
            continue
    return None


def in_datetime_window(row: dict[str, Any], fields: tuple[str, ...], from_dt=None, to_dt=None) -> bool:
    dt = row_datetime(row, fields)
    if dt is None:
        return False
    if from_dt and dt < from_dt:
        return False
    if to_dt and dt > to_dt:
        return False
    return True


def filter_raw_by_window(rows: list[dict[str, Any]], fields: tuple[str, ...], from_dt=None, to_dt=None) -> list[dict[str, Any]]:
    if not from_dt and not to_dt:
        return rows
    return [row for row in rows if in_datetime_window(row, fields, from_dt, to_dt)]


def analysis_from_to(params: dict[str, list[str]]):
    start = first_param(params, "load_from") or first_param(params, "analysis_from") or first_param(params, "initial_from")
    end = first_param(params, "load_to") or first_param(params, "analysis_to") or first_param(params, "initial_to")
    return parse_dt(start), parse_dt(end)


def max_records_param(params: dict[str, list[str]]) -> int:
    raw = first_param(params, "max_records", str(DEFAULT_LOAD_MAX_RECORDS))
    try:
        value = int(raw or DEFAULT_LOAD_MAX_RECORDS)
    except ValueError:
        value = DEFAULT_LOAD_MAX_RECORDS
    return max(1, min(value, HARD_LOAD_MAX_RECORDS))


def load_source(name: str, params: dict[str, list[str]]) -> list[dict[str, Any]]:
    spec = DATASET_SPECS[name]
    rows = load_json(spec["path"])
    start, end = analysis_from_to(params)
    return filter_raw_by_window(rows, spec["time_fields"], start, end)


def dataset_bounds_and_counts(from_dt=None, to_dt=None) -> dict[str, Any]:
    sources: dict[str, Any] = {}
    global_min = None
    global_max = None
    total = 0
    for name, spec in DATASET_SPECS.items():
        rows = load_json(spec["path"])
        dts = [row_datetime(row, spec["time_fields"]) for row in rows]
        dts = [dt for dt in dts if dt is not None]
        if dts:
            src_min = min(dts)
            src_max = max(dts)
            global_min = src_min if global_min is None or src_min < global_min else global_min
            global_max = src_max if global_max is None or src_max > global_max else global_max
        selected = [row for row in rows if in_datetime_window(row, spec["time_fields"], from_dt, to_dt)] if (from_dt or to_dt) else rows
        count = len(selected)
        total += count
        sources[name] = {
            "records": count,
            "total_records": len(rows),
            "dataset_min": iso_dt(min(dts)) if dts else None,
            "dataset_max": iso_dt(max(dts)) if dts else None,
        }
    return {
        "dataset_min": iso_dt(global_min) if global_min else None,
        "dataset_max": iso_dt(global_max) if global_max else None,
        "estimated_records": total,
        "sources": sources,
    }


def build_meta_response(params: dict[str, list[str]]) -> dict[str, Any]:
    start = parse_iso_param(params, "from") or parse_iso_param(params, "load_from")
    end = parse_iso_param(params, "to") or parse_iso_param(params, "load_to")
    limit = max_records_param(params)
    meta = dataset_bounds_and_counts(start, end)
    too_large = bool(meta["estimated_records"] > limit)
    meta.update({
        "dashboard": "analytics_meta",
        "window_from": iso_dt(start) if start else None,
        "window_to": iso_dt(end) if end else None,
        "max_records": limit,
        "too_large": too_large,
        "allowed": True,
        "hard_max_records": HARD_LOAD_MAX_RECORDS,
        "message": "OK" if not too_large else f"Warning: selected load window contains {meta['estimated_records']:,} records, above the warning threshold of {limit:,}. You can still continue if your machine/app can handle it.",
    })
    return meta


def enforce_load_limit(params: dict[str, list[str]]) -> None:
    """Keep backward-compatible call sites while treating max_records as a warning threshold.

    The Home page still checks the selected initial database-load window and marks it as
    too large when it exceeds max_records, but the user can decide to continue.
    Therefore dashboard endpoints must not block solely because the estimate is above
    the warning threshold.
    """
    return


def first_param(params: dict[str, list[str]], name: str, default: str | None = None) -> str | None:
    values = params.get(name)
    if not values:
        return default
    value = values[0].strip()
    return value if value else default


def normalize_iso(value: str | None) -> str | None:
    return value.replace("Z", "+00:00") if value else None


def parse_iso_param(params: dict[str, list[str]], name: str):
    return parse_dt(first_param(params, name))


def selected_regions(params: dict[str, list[str]]) -> list[str]:
    return normalize_regions(first_param(params, "regions"))


def build_operational_response(params: dict[str, list[str]]) -> dict:
    enforce_load_limit(params)
    raw = load_source("testimonies", params)
    all_rows = operational.annotate_rows(raw)
    regions = selected_regions(params)
    available = operational.get_available_regions(all_rows)
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", normalize_iso(first_param(params, "from")), normalize_iso(first_param(params, "to")), default_days=30, max_days=operational.MAX_WINDOW_DAYS)
    filtered = operational.filter_rows(all_rows, regions, from_dt, to_dt)
    max_points = int(first_param(params, "max_points", str(operational.DEFAULT_MAX_POINTS)))
    gran = operational.choose_granularity(from_dt, to_dt, first_param(params, "granularity", "auto") or "auto", max_points)
    return operational.build_output(all_rows, filtered, regions, available, from_dt, to_dt, dataset_min, dataset_max, gran, max_points)


def build_demographics_response(params: dict[str, list[str]]) -> dict:
    enforce_load_limit(params)
    input_file = PROJECT_ROOT / "data_mock" / "testimonies.json"
    raw = load_source("testimonies", params)
    all_rows = demographics.annotate_rows(raw)
    regions = selected_regions(params)
    available = demographics.get_available_regions(all_rows)
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", normalize_iso(first_param(params, "from")), normalize_iso(first_param(params, "to")), default_days=30, max_days=demographics.MAX_WINDOW_DAYS)
    filtered = demographics.filter_rows(all_rows, regions, from_dt, to_dt)
    return demographics.build_output(all_rows, filtered, regions, available, from_dt, to_dt, dataset_min, dataset_max, input_file)


def build_incident_response(params: dict[str, list[str]]) -> dict:
    enforce_load_limit(params)
    raw = load_source("events", params)
    max_points = int(first_param(params, "max_points", "120"))
    return dashboards.build_dashboard_02_output(raw, selected_regions(params), parse_iso_param(params, "from"), parse_iso_param(params, "to"), first_param(params, "granularity", "week") or "week", max_points)


def build_quality_response(params: dict[str, list[str]]) -> dict:
    enforce_load_limit(params)
    raw = load_source("events", params)
    max_points = int(first_param(params, "max_points", "120"))
    return dashboards.build_dashboard_03_output(raw, selected_regions(params), parse_iso_param(params, "from"), parse_iso_param(params, "to"), first_param(params, "granularity", "week") or "week", max_points)


def build_mobility_response(params: dict[str, list[str]]) -> dict:
    enforce_load_limit(params)
    raw = load_source("trajectories", params)
    max_points = int(first_param(params, "max_points", "120"))
    return dashboards.build_dashboard_04_output(
        raw,
        selected_regions(params),
        parse_iso_param(params, "from"),
        parse_iso_param(params, "to"),
        first_param(params, "granularity", "week") or "week",
        max_points,
    )


VALID_GRANULARITIES = {"auto", "hour", "day", "week", "month", "year"}


def validate_params(params: dict[str, list[str]]) -> str | None:
    raw_mp = first_param(params, "max_points")
    if raw_mp is not None:
        try:
            val = int(raw_mp)
            if val < 1 or val > 10000:
                return "max_points must be an integer between 1 and 10000"
        except ValueError:
            return "max_points must be an integer"
    gran = first_param(params, "granularity")
    if gran is not None and gran not in VALID_GRANULARITIES:
        return f"granularity must be one of {sorted(VALID_GRANULARITIES)}"
    raw_limit = first_param(params, "max_records")
    if raw_limit is not None:
        try:
            val = int(raw_limit)
            if val < 1 or val > HARD_LOAD_MAX_RECORDS:
                return f"max_records must be an integer between 1 and {HARD_LOAD_MAX_RECORDS}"
        except ValueError:
            return "max_records must be an integer"
    for name in ("from", "to", "load_from", "load_to", "analysis_from", "analysis_to", "initial_from", "initial_to"):
        raw = first_param(params, name)
        if raw is not None:
            try:
                datetime.fromisoformat(normalize_iso(raw))
            except ValueError:
                return f"{name} must be a valid ISO 8601 datetime"
    return None


class HFOHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PROJECT_ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.handle_api(parsed.path.rstrip("/"), parse_qs(parsed.query))
            return
        super().do_GET()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_api(self, path: str, params: dict[str, list[str]]) -> None:
        try:
            error = validate_params(params)
            if error:
                self.send_json(400, {"error": "Bad Request", "message": error})
                return
            routes = {
                "/api/analytics/meta": build_meta_response,
                "/api/analytics/operational-kpis": build_operational_response,
                "/api/analytics/demographics-kpis": build_demographics_response,
                "/api/analytics/incident-needs": build_incident_response,
                "/api/analytics/data-quality": build_quality_response,
                "/api/analytics/mobility-route": build_mobility_response,
            }
            if path not in routes:
                self.send_json(404, {"error": "Unknown API endpoint", "path": path, "available": sorted(routes)})
                return
            self.send_json(200, routes[path](params))
        except LoadWindowTooLarge as exc:
            self.send_json(413, {"error": "Load window too large", "message": str(exc), "estimated_records": exc.total, "max_records": exc.limit, "sources": exc.breakdown})
        except ValueError as exc:
            self.send_json(400, {"error": "Bad Request", "message": str(exc)})
        except Exception as exc:
            self.send_json(500, {"error": type(exc).__name__, "message": str(exc)})


def main() -> None:
    host = "localhost"
    port = 8000
    server = ThreadingHTTPServer((host, port), HFOHandler)
    print(f"HFO Analytics server running at http://{host}:{port}/frontend/dashboards/index.html")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
