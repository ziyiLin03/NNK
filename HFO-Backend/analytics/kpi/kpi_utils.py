from __future__ import annotations

import json
import math
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence, Tuple
import traceback

def get_area_from_report(row: Dict[str, Any]) -> str:
    submitted_by = row.get("submitted_by")
    if submitted_by and str(submitted_by).strip():
        return str(submitted_by).strip().upper()
    return "Unknown"

def infer_region(row: Dict[str, Any]) -> str:
    return get_area_from_report(row)

UTC = timezone.utc


def load_json(path: Path) -> List[Dict[str, Any]]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(data: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def ensure_tz(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def to_utc(value: datetime) -> datetime:
    return ensure_tz(value).astimezone(UTC)


def iso_dt(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return to_utc(value).isoformat(timespec="seconds")


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(value)
    except Exception:
        return default


def safe_float(value: Any, default: Optional[float] = None) -> Optional[float]:
    try:
        if value is None or value == "":
            return default
        return float(value)
    except Exception:
        return default


def normalize_category(value: Any, unknown_label: str = "Unknown") -> str:
    if value is None:
        return unknown_label
    text = str(value).strip()
    if not text or text.lower() in {"unknown", "none", "null", "nan"}:
        return unknown_label
    return text


def normalize_regions(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    return [part.strip() for part in str(raw).split(",") if part.strip()]


def valid_location(location: Any) -> bool:
    if not isinstance(location, dict):
        return False
    lat = safe_float(location.get("lat"))
    lon = safe_float(location.get("lon"))
    return lat is not None and lon is not None and -90 <= lat <= 90 and -180 <= lon <= 180


def get_lat_lon(location: Any) -> Tuple[Optional[float], Optional[float]]:
    if not valid_location(location):
        return None, None
    return float(location["lat"]), float(location["lon"])


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371.0088
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return radius * 2 * math.asin(math.sqrt(max(0, min(1, a))))


def coerce_window(
    rows: Sequence[Dict[str, Any]],
    date_field: str,
    from_arg: Optional[str],
    to_arg: Optional[str],
    default_days: Optional[int] = None,
    max_days: int = 365 * 20,
) -> Tuple[datetime, datetime, datetime, datetime]:
    dts = [to_utc(dt) for dt in (parse_dt(r.get(date_field)) for r in rows) if dt is not None]
    if not dts:
        now = datetime.now(UTC)
        return now, now, now, now
    dataset_min = min(dts)
    dataset_max = max(dts)
    to_dt = to_utc(datetime.fromisoformat(to_arg.replace("Z", "+00:00"))) if to_arg else dataset_max
    if from_arg:
        from_dt = to_utc(datetime.fromisoformat(from_arg.replace("Z", "+00:00")))
    elif default_days is None:
        from_dt = dataset_min
    else:
        from_dt = max(dataset_min, to_dt - timedelta(days=default_days))
    if from_dt > to_dt:
        raise ValueError("from date cannot be after to date")
    if (to_dt - from_dt).days > max_days:
        raise ValueError(f"time window exceeds {max_days} days")
    return from_dt, to_dt, dataset_min, dataset_max


def in_window(dt: Optional[datetime], from_dt: datetime, to_dt: datetime) -> bool:
    return dt is not None and to_utc(from_dt) <= to_utc(dt) <= to_utc(to_dt)


def floor_bucket(dt: datetime, granularity: str) -> datetime:
    dt = to_utc(dt)
    if granularity == "hour":
        return dt.replace(minute=0, second=0, microsecond=0)
    if granularity == "day":
        return dt.replace(hour=0, minute=0, second=0, microsecond=0)
    if granularity == "week":
        base = dt - timedelta(days=dt.weekday())
        return base.replace(hour=0, minute=0, second=0, microsecond=0)
    if granularity == "month":
        return dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if granularity == "year":
        return dt.replace(month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    raise ValueError(f"unsupported granularity: {granularity}")


def step_bucket(dt: datetime, granularity: str) -> datetime:
    if granularity == "hour":
        return dt + timedelta(hours=1)
    if granularity == "day":
        return dt + timedelta(days=1)
    if granularity == "week":
        return dt + timedelta(days=7)
    if granularity == "month":
        year = dt.year + (1 if dt.month == 12 else 0)
        month = 1 if dt.month == 12 else dt.month + 1
        return dt.replace(year=year, month=month, day=1)
    if granularity == "year":
        return dt.replace(year=dt.year + 1, month=1, day=1)
    raise ValueError(f"unsupported granularity: {granularity}")


def bucket_label(dt: datetime, granularity: str) -> str:
    if granularity == "hour":
        return dt.strftime("%Y-%m-%d %H:00")
    if granularity == "day":
        return dt.strftime("%Y-%m-%d")
    if granularity == "week":
        return "week_of_" + dt.strftime("%Y-%m-%d")
    if granularity == "month":
        return dt.strftime("%Y-%m")
    if granularity == "year":
        return str(dt.year)
    return iso_dt(dt) or ""


def dense_buckets(from_dt: datetime, to_dt: datetime, granularity: str, max_buckets: int = 5000) -> List[datetime]:
    buckets = []
    current = floor_bucket(from_dt, granularity)
    end = floor_bucket(to_dt, granularity)
    while current <= end and len(buckets) < max_buckets:
        buckets.append(current)
        current = step_bucket(current, granularity)
    return buckets


def choose_granularity(from_dt: datetime, to_dt: datetime, requested: str = "auto", max_points: int = 120) -> str:
    if requested and requested != "auto":
        return requested
    hours = max((to_dt - from_dt).total_seconds() / 3600, 1)
    days = hours / 24
    if hours <= max_points:
        return "hour"
    if days <= max_points:
        return "day"
    if days / 7 <= max_points:
        return "week"
    if days / 31 <= max_points:
        return "month"
    return "year"


def is_filled(row: Dict[str, Any], field: str) -> bool:
    value = row.get(field)
    if field == "current_Location":
        return valid_location(value)
    if isinstance(value, list):
        return len(value) > 0
    if value is None or value == "":
        return False
    if isinstance(value, str) and value.strip().lower() in {"unknown", "null", "none"}:
        return False
    return True


def field_quality(rows: Sequence[Dict[str, Any]], fields: Sequence[str], required_fields: Sequence[str]) -> Dict[str, Any]:
    total = len(rows)
    if total == 0:
        return {"overall_pct": 0, "total_records": 0, "worst_field": None, "worst_pct": None, "fields": []}
    required = set(required_fields)
    result = []
    for field in fields:
        filled = sum(1 for row in rows if is_filled(row, field))
        pct = round(filled / total * 100, 1)
        result.append({"field": field, "required": field in required, "filled": filled, "missing": total - filled, "pct": pct})
    req_rows = [item for item in result if item["required"]]
    req_filled = sum(item["filled"] for item in req_rows)
    req_total = total * len(req_rows)
    overall = round(req_filled / req_total * 100, 1) if req_total else 0
    worst = min(result, key=lambda item: item["pct"]) if result else None
    return {
        "overall_pct": overall,
        "total_records": total,
        "worst_field": worst["field"] if worst else None,
        "worst_pct": worst["pct"] if worst else None,
        "fields": result,
    }


def weighted_percent(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round(min(100.0, max(0.0, numerator / denominator * 100)), 1)


def median(values: Sequence[float]) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    mid = len(vals) // 2
    if len(vals) % 2:
        return round(vals[mid], 2)
    return round((vals[mid - 1] + vals[mid]) / 2, 2)


def percentile(values: Sequence[float], p: float) -> Optional[float]:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return None
    idx = min(len(vals) - 1, max(0, round((len(vals) - 1) * p)))
    return round(vals[idx], 2)


def rolling_average(values: Sequence[float], window: int = 4) -> List[float]:
    out = []
    for i, _ in enumerate(values):
        chunk = values[max(0, i - window + 1): i + 1]
        out.append(round(sum(chunk) / len(chunk), 2) if chunk else 0)
    return out
