from __future__ import annotations

import argparse
import math
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from kpi_utils import (
    bucket_label,
    coerce_window,
    dense_buckets,
    field_quality,
    floor_bucket,
    get_lat_lon,
    haversine_km,
    infer_region,
    in_window,
    iso_dt,
    load_json,
    median,
    normalize_regions,
    parse_dt,
    percentile,
    safe_int,
    save_json,
    weighted_percent,
)

DEFAULT_IN = Path("data_mock")
DEFAULT_OUT = Path("outputs")
MAX_WINDOW_DAYS = 365 * 20

TAG_LABELS = {
    "movement": "Displacement Movement",
    "group_movement": "Displacement Movement",
    "border": "Border Crossing",
    "checkpoint": "Checkpoint",
    "camp": "Camp",
    "waiting_area": "Waiting Area",
    "street": "Street",
    "shelter": "Shelter",
    "food": "Food Need",
    "water": "Water Need",
    "clothes": "Clothing Need",
    "cold": "Cold Exposure",
    "exhaustion": "Exhaustion",
    "dehydration": "Dehydration",
    "injury": "Injury",
    "medical": "Medical Need",
    "pushback": "Pushback",
    "detention": "Detention",
    "beating": "Violence / Beating",
    "violence": "Violence",
    "police": "Police Presence",
    "id_check": "ID Check",
    "confiscation": "Confiscation",
    "street_sleeping": "Street Sleeping",
    "unsafe_night": "Unsafe Night Conditions",
}

TAG_CATEGORIES = {
    "Displacement": ["movement", "group_movement", "border", "checkpoint"],
    "Shelter": ["camp", "waiting_area", "street", "shelter", "street_sleeping", "unsafe_night", "cold"],
    "Basic needs": ["food", "water", "clothes"],
    "Health": ["medical", "injury", "dehydration", "exhaustion"],
    "Protection": ["pushback", "violence", "beating", "police", "detention", "id_check", "confiscation"],
}
TAG_TO_CATEGORY = {tag: cat for cat, tags in TAG_CATEGORIES.items() for tag in tags}
POINT_TYPE_CATEGORY = {
    "pushback": "Protection",
    "police_control": "Protection",
    "medical_need": "Health",
    "shelter_need": "Basic needs",
    "street_sleeping": "Shelter",
    "observation": "Displacement",
    "unknown": "Other",
}
POINT_TYPE_LABELS = {
    "pushback": "Pushback",
    "police_control": "Police control",
    "medical_need": "Medical need",
    "shelter_need": "Shelter / basic needs",
    "street_sleeping": "Street sleeping",
    "observation": "Observation",
    "unknown": "Unknown",
}


def _regions(rows: Sequence[Dict[str, Any]]) -> List[str]:
    return sorted({r.get("region") or "Unknown" for r in rows})


def _filter_by_window_region(rows: Sequence[Dict[str, Any]], selected_regions: Sequence[str], from_dt, to_dt, field: str = "recorded_dt") -> List[Dict[str, Any]]:
    selected = set(selected_regions)
    return [r for r in rows if in_window(r.get(field), from_dt, to_dt) and (not selected or r.get("region") in selected)]


def _dense_series(rows: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str, date_field: str = "recorded_dt") -> List[Dict[str, Any]]:
    count = defaultdict(int)
    people = defaultdict(int)
    seen_entity_keys: set = set()
    regions = _regions(rows)
    for row in rows:
        dt = row.get(date_field)
        if dt is None:
            continue
        key = (iso_dt(floor_bucket(dt, granularity)), row.get("region") or "Unknown")
        count[key] += 1
        e_id = row.get("entity_id")
        ek = (key, e_id) if e_id else None
        if ek:
            if ek not in seen_entity_keys:
                people[key] += row.get("numPersons", 0)
                seen_entity_keys.add(ek)
        else:
            people[key] += row.get("numPersons", 0)
    out = []
    for bucket in dense_buckets(from_dt, to_dt, granularity, max_buckets=5000):
        b = iso_dt(bucket)
        for region in regions:
            out.append({"bucket": b, "bucket_start": b, "bucket_label": bucket_label(bucket, granularity), "region": region, "count": count.get((b, region), 0), "people": people.get((b, region), 0)})
    return out


# Dashboard 01 is retained only for backward compatibility. It does not compute volunteer KPIs.
def build_dashboard_01_output(raw: Sequence[Dict[str, Any]], selected_regions: Sequence[str] = (), from_dt=None, to_dt=None) -> Dict[str, Any]:
    rows = []
    for r in raw:
        rec_dt = parse_dt(r.get("recorded_datetime"))
        rows.append({**r, "recorded_dt": rec_dt, "region": infer_region(r), "numPersons": safe_int(r.get("numPersons"), 0)})
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(rows, "recorded_datetime", iso_dt(from_dt) if from_dt else None, iso_dt(to_dt) if to_dt else None, default_days=None, max_days=MAX_WINDOW_DAYS)
    rows = _filter_by_window_region(rows, selected_regions, from_dt, to_dt)
    regions = _regions(rows)
    total_people = sum(r["numPersons"] for r in rows)
    total_testimonies = len({r.get("testimony_ID") for r in rows if r.get("testimony_ID")})
    region_summary = [{"region": reg, "people": sum(r["numPersons"] for r in rows if r["region"] == reg), "testimonies": len({r.get("testimony_ID") for r in rows if r["region"] == reg and r.get("testimony_ID")})} for reg in regions]
    return {
        "meta": {"dashboard": "01_volume_coverage_deprecated", "generated_at": iso_dt(datetime.now(dataset_max.tzinfo)), "dataset_min": iso_dt(dataset_min), "dataset_max": iso_dt(dataset_max), "total_records": len(rows), "available_regions": regions, "notes": ["Deprecated compatibility output. No volunteer ranking because volunteer_ID is not in the current data contract."]},
        "kpis_global": {"total_people": total_people, "total_testimonies": total_testimonies, "active_days": len({r["recorded_dt"].date() for r in rows if r.get("recorded_dt")}), "top_volunteer": None, "region_summary": region_summary},
        "series": {"by_day": _dense_series(rows, from_dt, to_dt, "day"), "by_week": _dense_series(rows, from_dt, to_dt, "week"), "by_month": _dense_series(rows, from_dt, to_dt, "month"), "by_hour": []},
        "volunteers": [],
        "data_quality": field_quality(rows, ["testimony_ID", "recorded_datetime", "event_datetime", "numPersons", "current_Location", "gender", "nationality"], ["testimony_ID", "recorded_datetime", "event_datetime", "numPersons", "current_Location"]),
    }


def _event_rows(raw: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = []
    for r in raw:
        rec_dt = parse_dt(r.get("recorded_datetime"))
        evt_dt = parse_dt(r.get("event_datetime"))
        tags = r.get("location_Tag") or []
        if not isinstance(tags, list):
            tags = [str(tags)]
        point_type = r.get("point_type") or "unknown"
        rows.append({
            **r,
            "recorded_dt": rec_dt,
            "event_dt": evt_dt,
            "region": infer_region(r),
            "location_Tag": [str(t) for t in tags if str(t).strip()],
            "point_type": point_type,
            "category": POINT_TYPE_CATEGORY.get(point_type, "Other"),
            "numPersons": safe_int(r.get("numPersons"), 0),
        })
    return rows


def _d02_kpis(rows: Sequence[Dict[str, Any]], regions: Sequence[str]) -> Dict[str, Any]:
    # Deduplicate people by entity_id: a report with N positions emits N event rows
    # but only the first carries numPersons (db_source idx==0 rule). For safety we
    # also deduplicate here so callers that skip the idx==0 guard still get correct totals.
    seen: set = set()
    total_people = 0
    for r in rows:
        eid = r.get("entity_id")
        if eid:
            if eid not in seen:
                total_people += r.get("numPersons", 0)
                seen.add(eid)
        else:
            total_people += r.get("numPersons", 0)
    # Region people also deduplicated by entity_id
    def _region_people(reg):
        s: set = set()
        p = 0
        for r in rows:
            if r.get("region") != reg:
                continue
            eid = r.get("entity_id")
            if eid:
                if eid not in s:
                    p += r.get("numPersons", 0)
                    s.add(eid)
            else:
                p += r.get("numPersons", 0)
        return p
    return {
        "total_events": len(rows),
        "total_people": total_people,
        "active_regions": len({r.get("region") for r in rows if r.get("region")}),
        "unique_tag_types": len({tag for r in rows for tag in r.get("location_Tag", [])}),
        "region_breakdown": [{"region": reg, "count": sum(1 for r in rows if r["region"] == reg), "people": _region_people(reg)} for reg in regions],
    }


def _d02_tag_counts(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    tag_count = defaultdict(int)
    tag_people = defaultdict(int)
    total_events = len(rows)
    for row in rows:
        for tag in set(row.get("location_Tag") or []):
            tag_count[tag] += 1
            tag_people[tag] += row.get("numPersons", 0)
    return sorted([{"tag": tag, "label": TAG_LABELS.get(tag, tag), "count": count, "people": tag_people[tag], "prevalence_pct": weighted_percent(count, total_events)} for tag, count in tag_count.items()], key=lambda x: -x["count"])


def _d02_pointtype_counts(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    count = Counter(r.get("point_type") or "unknown" for r in rows)
    people = defaultdict(int)
    total = len(rows)
    for row in rows:
        people[row.get("point_type") or "unknown"] += row.get("numPersons", 0)
    return sorted([{"point_type": pt, "label": POINT_TYPE_LABELS.get(pt, pt), "count": c, "people": people[pt], "pct": weighted_percent(c, total)} for pt, c in count.items()], key=lambda x: -x["count"])


def _d02_tag_categories(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    count = Counter(r.get("category") or "Other" for r in rows)
    people = defaultdict(int)
    total = len(rows)
    for row in rows:
        people[row.get("category") or "Other"] += row.get("numPersons", 0)
    categories = list(TAG_CATEGORIES.keys()) + ["Other"]
    return sorted([{"category": cat, "count": count.get(cat, 0), "people": people.get(cat, 0), "pct": weighted_percent(count.get(cat, 0), total)} for cat in categories if count.get(cat, 0) > 0], key=lambda x: -x["count"])


def _d02_region_category(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: defaultdict(int))
    people = defaultdict(lambda: defaultdict(int))
    for row in rows:
        region = row.get("region") or "Unknown"
        cat = row.get("category") or "Other"
        mapping[region][cat] += 1
        people[region][cat] += row.get("numPersons", 0)
    out = []
    for region, cats in mapping.items():
        total = sum(cats.values())
        out.append({"region": region, "total": total, "categories": [{"category": cat, "count": cnt, "people": people[region][cat], "pct": weighted_percent(cnt, total)} for cat, cnt in sorted(cats.items(), key=lambda x: -x[1])]})
    return sorted(out, key=lambda x: -x["total"])


def _d02_series_by_category(rows: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str = "week") -> List[Dict[str, Any]]:
    count = defaultdict(int)
    people = defaultdict(int)
    for row in rows:
        if row.get("recorded_dt") is None:
            continue
        b = iso_dt(floor_bucket(row["recorded_dt"], granularity))
        cat = row.get("category") or "Other"
        count[(b, cat)] += 1
        people[(b, cat)] += row.get("numPersons", 0)
    cats = list(TAG_CATEGORIES.keys()) + ["Other"]
    out = []
    for bucket in dense_buckets(from_dt, to_dt, granularity, max_buckets=5000):
        b = iso_dt(bucket)
        for cat in cats:
            out.append({"bucket": b, "bucket_start": b, "bucket_label": bucket_label(bucket, granularity), "category": cat, "count": count.get((b, cat), 0), "people": people.get((b, cat), 0)})
    return out


def _d02_series_by_tag(rows: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str = "week") -> Dict[str, List[Dict[str, Any]]]:
    count = defaultdict(int)
    people = defaultdict(int)
    tags_by_cat = defaultdict(set)
    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        b = iso_dt(floor_bucket(dt, granularity))
        for tag in set(row.get("location_Tag") or []):
            cat = TAG_TO_CATEGORY.get(tag, "Other")
            tags_by_cat[cat].add(tag)
            count[(b, tag)] += 1
            people[(b, tag)] += row.get("numPersons", 0)
    buckets = [iso_dt(b) for b in dense_buckets(from_dt, to_dt, granularity, max_buckets=5000)]
    out = {}
    for cat in list(TAG_CATEGORIES.keys()) + ["Other"]:
        out[cat] = []
        for tag in sorted(tags_by_cat.get(cat, set())):
            out[cat].append({"tag": tag, "label": TAG_LABELS.get(tag, tag), "data": [{"bucket": b, "count": count.get((b, tag), 0), "people": people.get((b, tag), 0)} for b in buckets]})
    return out


def build_dashboard_02_output(raw: Sequence[Dict[str, Any]], selected_regions: Sequence[str] = (), from_dt=None, to_dt=None, granularity: str = "week", max_points: Optional[int] = None, default_days: Optional[int] = None) -> Dict[str, Any]:
    all_rows = _event_rows(raw)
    requested_granularity = granularity if granularity in {"hour", "day", "week", "month", "year"} else "week"
    requested_max_points = max(10, min(int(max_points), 5000)) if max_points else None
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", iso_dt(from_dt) if from_dt else None, iso_dt(to_dt) if to_dt else None, default_days=default_days, max_days=MAX_WINDOW_DAYS)
    rows = _filter_by_window_region(all_rows, selected_regions, from_dt, to_dt)
    regions = _regions(all_rows)
    selected_regions_out = list(selected_regions)
    return {
        "meta": {"dashboard": "02_incident_needs", "generated_at": iso_dt(datetime.now(dataset_max.tzinfo)), "dataset_min": iso_dt(dataset_min), "dataset_max": iso_dt(dataset_max), "dataset_min_recorded_datetime": iso_dt(dataset_min), "dataset_max_recorded_datetime": iso_dt(dataset_max), "window_from": iso_dt(from_dt), "window_to": iso_dt(to_dt), "selected_regions": selected_regions_out, "total_records": len(rows), "total_records_in_dataset": len(all_rows), "available_regions": regions, "available_point_types": sorted({r.get("point_type") or "unknown" for r in all_rows}), "available_categories": list(TAG_CATEGORIES.keys()) + ["Other"], "tag_labels": TAG_LABELS, "point_type_labels": POINT_TYPE_LABELS, "granularity": requested_granularity, "max_points": requested_max_points, "notes": ["Tag prevalence percentages use total events as denominator. Events can have multiple tags, so prevalence values are not meant to sum to 100."]},
        "kpis_global": _d02_kpis(rows, regions),
        "series": {"by_hour": _dense_series(rows, from_dt, to_dt, "hour"), "by_day": _dense_series(rows, from_dt, to_dt, "day"), "by_week": _dense_series(rows, from_dt, to_dt, "week"), "by_month": _dense_series(rows, from_dt, to_dt, "month"), "by_year": _dense_series(rows, from_dt, to_dt, "year"), "by_category": _d02_series_by_category(rows, from_dt, to_dt, requested_granularity), "by_tag_in_category": _d02_series_by_tag(rows, from_dt, to_dt, requested_granularity)},
        "tag_counts": _d02_tag_counts(rows),
        "pointtype_counts": _d02_pointtype_counts(rows),
        "tag_categories": _d02_tag_categories(rows),
        "region_category_breakdown": _d02_region_category(rows),
        "data_quality": field_quality(rows, ["event_datetime", "recorded_datetime", "current_Location", "location_Tag", "numPersons", "point_type"], ["event_datetime", "recorded_datetime", "current_Location", "location_Tag", "numPersons", "point_type"]),
        "records_preview": [{"recorded_datetime": r.get("recorded_datetime"), "event_datetime": r.get("event_datetime"), "region": r.get("region"), "current_Location": r.get("current_Location"), "location_Tag": r.get("location_Tag"), "point_type": r.get("point_type"), "numPersons": r.get("numPersons"), "category": r.get("category")} for r in rows[:250]],
    }


# Dashboard 03 - data quality over events
LATENCY_BINS = [0, 1, 6, 12, 24, 48, 72, 168, 336]
D03_FIELDS = ["event_datetime", "recorded_datetime", "current_Location", "location_Tag", "numPersons", "point_type", "timezone"]
D03_REQUIRED = ["event_datetime", "recorded_datetime", "current_Location", "location_Tag", "numPersons", "point_type"]


def _latency_hours(row: Dict[str, Any]) -> Optional[float]:
    rec = row.get("recorded_dt")
    evt = row.get("event_dt")
    if rec is None or evt is None:
        return None
    return round((rec - evt).total_seconds() / 3600, 2)


def _d03_row_is_complete(row: Dict[str, Any]) -> bool:
    if infer_region(row) == "Unknown":
        return False
    for field in D03_REQUIRED:
        value = row.get(field)
        if value in (None, ""):
            return False
        if isinstance(value, list) and len(value) == 0:
            return False
    return True


def _d03_series(rows: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str) -> List[Dict[str, Any]]:
    buckets = [iso_dt(bucket) for bucket in dense_buckets(from_dt, to_dt, granularity, max_buckets=2000)]
    agg: Dict[Tuple[str, str], Dict[str, Any]] = defaultdict(lambda: {"count": 0, "complete": 0, "latency_sum": 0.0, "latency_count": 0})
    regions = sorted({row.get("region") or "Unknown" for row in rows})
    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        bucket = iso_dt(floor_bucket(dt, granularity))
        region = row.get("region") or "Unknown"
        slot = agg[(bucket, region)]
        slot["count"] += 1
        if _d03_row_is_complete(row):
            slot["complete"] += 1
        latency = row.get("latency_h")
        if latency is not None and latency >= 0:
            slot["latency_sum"] += latency
            slot["latency_count"] += 1
    out: List[Dict[str, Any]] = []
    for bucket in buckets:
        for region in regions:
            slot = agg.get((bucket, region), {})
            lat_cnt = slot.get("latency_count", 0)
            out.append({
                "bucket": bucket,
                "bucket_start": bucket,
                "bucket_label": bucket,
                "region": region,
                "count": slot.get("count", 0),
                "complete": slot.get("complete", 0),
                "avg_latency_h": round(slot["latency_sum"] / lat_cnt, 2) if lat_cnt else None,
            })
    return out


def build_dashboard_03_output(raw: Sequence[Dict[str, Any]], selected_regions: Sequence[str] = (), from_dt=None, to_dt=None, granularity: str = "week", max_points: Optional[int] = None, default_days: Optional[int] = None) -> Dict[str, Any]:
    requested_granularity = granularity if granularity in {"hour", "day", "week", "month", "year"} else "week"
    requested_max_points = max(10, min(int(max_points), 5000)) if max_points else None
    all_rows = _event_rows(raw)
    for row in all_rows:
        row["latency_h"] = _latency_hours(row)
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", iso_dt(from_dt) if from_dt else None, iso_dt(to_dt) if to_dt else None, default_days=default_days, max_days=MAX_WINDOW_DAYS)
    rows = _filter_by_window_region(all_rows, selected_regions, from_dt, to_dt)
    regions = _regions(all_rows)
    dq = field_quality(rows, D03_FIELDS, D03_REQUIRED)
    complete_count = sum(1 for row in rows if _d03_row_is_complete(row))
    latencies = [r["latency_h"] for r in rows if r.get("latency_h") is not None and r["latency_h"] >= 0]
    hist = []
    for idx in range(len(LATENCY_BINS) - 1):
        lo, hi = LATENCY_BINS[idx], LATENCY_BINS[idx + 1]
        hist.append({"bin": f"{lo}-{hi}h", "count": sum(1 for v in latencies if lo <= v < hi)})
    hist.append({"bin": f">={LATENCY_BINS[-1]}h", "count": sum(1 for v in latencies if v >= LATENCY_BINS[-1])})
    region_summary = []
    for region in regions:
        rr = [r for r in rows if r.get("region") == region]
        rlat = [r["latency_h"] for r in rr if r.get("latency_h") is not None and r["latency_h"] >= 0]
        rdq = field_quality(rr, D03_FIELDS, D03_REQUIRED)
        region_summary.append({"region": region, "total": len(rr), "complete": int(round((rdq["overall_pct"] / 100) * len(rr))) if rr else 0, "completeness_pct": rdq["overall_pct"], "avg_latency_h": round(sum(rlat) / len(rlat), 2) if rlat else None, "median_latency_h": median(rlat)})
    return {
        "meta": {"dashboard": "03_data_quality", "generated_at": iso_dt(datetime.now(dataset_max.tzinfo)), "dataset_min": iso_dt(dataset_min), "dataset_max": iso_dt(dataset_max), "dataset_min_recorded_datetime": iso_dt(dataset_min), "dataset_max_recorded_datetime": iso_dt(dataset_max), "window_from": iso_dt(from_dt), "window_to": iso_dt(to_dt), "selected_regions": list(selected_regions), "total_records": len(rows), "available_regions": regions, "required_fields": D03_REQUIRED, "all_fields": D03_FIELDS, "latency_bins": LATENCY_BINS, "granularity": requested_granularity, "max_points": requested_max_points},
        "kpis_global": {"total_records": len(rows), "complete_records": complete_count, "completeness_pct": dq["overall_pct"], "avg_latency_h": round(sum(latencies) / len(latencies), 2) if latencies else None, "median_latency_h": median(latencies), "max_latency_h": max(latencies) if latencies else None, "region_summary": region_summary},
        "series": {"by_hour": _d03_series(rows, from_dt, to_dt, "hour"), "by_day": _d03_series(rows, from_dt, to_dt, "day"), "by_week": _d03_series(rows, from_dt, to_dt, "week"), "by_month": _d03_series(rows, from_dt, to_dt, "month"), "by_year": _d03_series(rows, from_dt, to_dt, "year")},
        "latency_histogram": hist,
        "field_completeness": [{"field": f["field"], "present": f["filled"], "missing": f["missing"], "completeness_pct": f["pct"], "is_required": f["required"]} for f in dq["fields"]],
    }


# Dashboard 04 - movement evidence and approximate distance

DEFAULT_DISTANCE_BIN_COUNT = 6


def _format_distance_label(value: float) -> str:
    if value >= 100:
        return f"{int(round(value))}"
    if value >= 10:
        return f"{round(value, 1):g}"
    return f"{round(value, 2):g}"


def _dynamic_distance_distribution(distances: Sequence[float], bins: int = DEFAULT_DISTANCE_BIN_COUNT) -> List[Dict[str, Any]]:
    clean = sorted(float(d) for d in distances if d is not None)
    if not clean:
        return []
    min_d = clean[0]
    max_d = clean[-1]
    if math.isclose(min_d, max_d):
        return [{
            "band": f"~{_format_distance_label(min_d)} km",
            "count": len(clean),
            "avg_distance_km": round(min_d, 2),
            "min_distance_km": round(min_d, 2),
            "max_distance_km": round(max_d, 2),
        }]

    bin_count = max(4, min(int(bins or DEFAULT_DISTANCE_BIN_COUNT), 8))
    width = (max_d - min_d) / bin_count
    edges = [min_d + width * idx for idx in range(bin_count)] + [max_d]
    out: List[Dict[str, Any]] = []
    for idx in range(bin_count):
        low = edges[idx]
        high = edges[idx + 1]
        if idx == bin_count - 1:
            values = [d for d in clean if low <= d <= high]
        else:
            values = [d for d in clean if low <= d < high]
        out.append({
            "band": f"{_format_distance_label(low)}-{_format_distance_label(high)} km",
            "count": len(values),
            "avg_distance_km": _mean(values),
            "min_distance_km": round(low, 2),
            "max_distance_km": round(high, 2),
        })
    return out


def _trajectory_points(raw: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for row in raw:
        event_dt = parse_dt(row.get("event_datetime"))
        entity_id = row.get("entity_id") or row.get("testimony_ID")
        lat, lon = get_lat_lon(row.get("current_Location"))
        region = infer_region(row)
        rows.append({
            **row,
            "entity_id": entity_id,
            "sequence_index": safe_int(row.get("sequence_index"), 1),
            "event_dt": event_dt,
            "event_datetime": row.get("event_datetime"),
            "lat": lat,
            "lon": lon,
            "region": region,
            "zone": region,
            "numPersons": safe_int(row.get("numPersons"), 0),
            "valid_coordinates": lat is not None and lon is not None,
        })
    return rows


def _entity_people(rows: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    people: Dict[str, int] = {}
    for row in rows:
        eid = row.get("entity_id")
        if not eid:
            continue
        people.setdefault(eid, row.get("numPersons", 0))
    return people


def _movement_tracks(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build approximate movement records without inferring zone-to-zone routes.

    Points are grouped by entity/testimony and ordered by sequence_index + event time.
    Distances are approximate straight-line Haversine segments between recorded points.
    The output deliberately avoids route labels such as origin -> destination.
    """
    grouped: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for row in rows:
        entity_id = row.get("entity_id")
        if not entity_id or row.get("event_dt") is None:
            continue
        grouped[entity_id].append(row)

    tracks: List[Dict[str, Any]] = []
    for entity_id, steps_raw in grouped.items():
        steps = sorted(steps_raw, key=lambda step: (step.get("sequence_index", 1), step.get("event_dt")))
        if not steps:
            continue

        event_order_valid = all(steps[i + 1]["event_dt"] >= steps[i]["event_dt"] for i in range(len(steps) - 1))
        sequence_values = [s.get("sequence_index", 1) for s in steps]
        sequence_order_valid = all(sequence_values[i + 1] >= sequence_values[i] for i in range(len(sequence_values) - 1))
        sequence_unique = len(sequence_values) == len(set(sequence_values))
        temporal_valid = event_order_valid and sequence_order_valid and sequence_unique

        coordinate_valid_steps = sum(1 for s in steps if s.get("valid_coordinates"))
        distances: List[float] = []
        segment_count = 0
        for i in range(len(steps) - 1):
            a, b = steps[i], steps[i + 1]
            if a.get("lat") is not None and b.get("lat") is not None and a.get("lon") is not None and b.get("lon") is not None:
                distances.append(haversine_km(a["lat"], a["lon"], b["lat"], b["lon"]))
                segment_count += 1

        approx_distance = round(sum(distances), 2) if distances else None
        duration_days = round((steps[-1]["event_dt"] - steps[0]["event_dt"]).total_seconds() / 86400, 2) if len(steps) >= 2 else None
        has_followup = len(steps) >= 2
        has_approx_distance = has_followup and approx_distance is not None and approx_distance >= 0
        zones = sorted({s.get("region") or "Unknown" for s in steps})

        if not has_followup:
            confidence = "Low"
        elif temporal_valid and has_approx_distance and coordinate_valid_steps == len(steps) and len(steps) >= 3:
            confidence = "High"
        elif temporal_valid and has_approx_distance:
            confidence = "Medium"
        else:
            confidence = "Low"

        tracks.append({
            "entity_id": entity_id,
            "num_points": len(steps),
            "observations": len(steps),
            "people": steps[0].get("numPersons", 0),
            "first_datetime": iso_dt(steps[0].get("event_dt")),
            "last_datetime": iso_dt(steps[-1].get("event_dt")),
            "duration_days": duration_days,
            "estimated_distance_km": approx_distance,
            "estimated_approx_distance_km": approx_distance,
            "avg_segment_distance_km": _mean(distances),
            "segment_count": segment_count,
            "has_followup": has_followup,
            "has_local_followup": has_followup,
            "has_approx_distance": has_approx_distance,
            "has_calculable_distance": has_approx_distance,
            "valid_coordinates": coordinate_valid_steps == len(steps),
            "valid_sequence": temporal_valid,
            "zones_observed": zones,
            "zones_observed_count": len(zones),
            "confidence": confidence,
            "steps": steps,
        })
    return tracks


# Backward-compatible alias for older frontend/tests that still refer to local tracks.
def _local_tracks(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return _movement_tracks(rows)


def _confidence_from_rate(rate: float) -> str:
    if rate >= 50:
        return "High"
    if rate >= 20:
        return "Medium"
    return "Low"


def _mean(values: Sequence[float]) -> Optional[float]:
    nums = [float(v) for v in values if v is not None]
    return round(sum(nums) / len(nums), 2) if nums else None


def _d04_kpis(points: Sequence[Dict[str, Any]], tracks: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    entity_people = _entity_people(points)
    followup_tracks = [t for t in tracks if t.get("has_followup")]
    distance_tracks = [t for t in tracks if t.get("has_approx_distance")]
    single_point_tracks = [t for t in tracks if not t.get("has_followup")]
    distances = [t["estimated_distance_km"] for t in distance_tracks if t.get("estimated_distance_km") is not None]
    followup_rate = weighted_percent(len(followup_tracks), len(tracks))
    distance_rate = weighted_percent(len(distance_tracks), len(tracks))
    single_rate = weighted_percent(len(single_point_tracks), len(tracks))
    avg_points = round(sum(t.get("num_points", 0) for t in tracks) / len(tracks), 2) if tracks else None
    return {
        "observed_entities": len(entity_people),
        "total_groups": len(entity_people),
        "people_observed": sum(entity_people.values()),
        "total_people": sum(entity_people.values()),
        "active_zones": len({p.get("region") for p in points if p.get("region")}),
        "zone_observations": len(points),
        "entity_records": len(tracks),
        "entity_zone_records": len(tracks),
        "tracks_with_2plus_points": len(followup_tracks),
        "trackable_records": len(followup_tracks),
        "trackable_rate": followup_rate,
        "valid_local_tracks": len(followup_tracks),
        "local_track_rate": followup_rate,
        "distance_records": len(distance_tracks),
        "distance_calculable_rate": distance_rate,
        "single_observation_records": len(single_point_tracks),
        "single_observation_rate": single_rate,
        "avg_points_per_entity": avg_points,
        "avg_points_per_trajectory": avg_points,
        "avg_points_per_entity_zone": avg_points,
        "avg_estimated_distance_km": _mean(distances),
        "avg_approx_distance_km": _mean(distances),
        "avg_local_distance_km": _mean(distances),
        "avg_distance_km": _mean(distances),
        "median_estimated_distance_km": median(distances),
        "median_local_distance_km": median(distances),
        "median_distance_km": median(distances),
        "min_approx_distance_km": round(min(distances), 2) if distances else None,
        "max_approx_distance_km": round(max(distances), 2) if distances else None,
        "p95_estimated_distance_km": percentile(distances, 95) if distances else None,
        "invalid_sequences": sum(1 for t in tracks if not t.get("valid_sequence")),
        "invalid_local_sequences": sum(1 for t in tracks if not t.get("valid_sequence")),
        "invalid_temporal_sequences": sum(1 for t in tracks if not t.get("valid_sequence")),
        "tracking_confidence": _confidence_from_rate(distance_rate),
        "interpretation": "Distances are approximate straight-line sums between ordered points of the same entity/testimony.",
    }


def _d04_tracking_funnel(points: Sequence[Dict[str, Any]], tracks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    total = len(points)
    entity_records = len(tracks)
    valid_coordinate_tracks = sum(1 for t in tracks if t.get("valid_coordinates"))
    followup = sum(1 for t in tracks if t.get("has_followup"))
    calculable_distance = sum(1 for t in tracks if t.get("has_approx_distance"))
    return [
        {"stage": "point_observations", "label": "Point observations", "count": total, "pct": 100 if total else 0},
        {"stage": "entity_records", "label": "Entity/testimony records", "count": entity_records, "pct": weighted_percent(entity_records, total)},
        {"stage": "valid_coordinates", "label": "Records with valid coordinates", "count": valid_coordinate_tracks, "pct": weighted_percent(valid_coordinate_tracks, entity_records)},
        {"stage": "followup", "label": "2+ ordered points", "count": followup, "pct": weighted_percent(followup, entity_records)},
        {"stage": "approx_distance", "label": "Approx. distance calculable", "count": calculable_distance, "pct": weighted_percent(calculable_distance, entity_records)},
    ]


def _d04_zone_summary(points: Sequence[Dict[str, Any]], tracks: Sequence[Dict[str, Any]], all_regions: Sequence[str]) -> List[Dict[str, Any]]:
    by_region = defaultdict(list)
    for point in points:
        by_region[point.get("region") or "Unknown"].append(point)

    tracks_by_region: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for track in tracks:
        for region in track.get("zones_observed") or []:
            tracks_by_region[region].append(track)

    out: List[Dict[str, Any]] = []
    for region in all_regions:
        region_points = by_region.get(region, [])
        if not region_points:
            continue
        testimony_people: Dict[str, int] = {}
        for point in region_points:
            eid = point.get("entity_id")
            if eid:
                testimony_people.setdefault(eid, point.get("numPersons", 0))
        region_tracks = tracks_by_region.get(region, [])
        distance_values = [t.get("estimated_distance_km") for t in region_tracks if t.get("estimated_distance_km") is not None]
        points_values = [t.get("num_points") for t in region_tracks if t.get("num_points") is not None]
        latest = max((p.get("event_dt") for p in region_points if p.get("event_dt") is not None), default=None)
        out.append({
            "zone": region,
            "region": region,
            "observations": len(region_points),
            "observed_entities": len(testimony_people),
            "testimonies_observed": len(testimony_people),
            "people_observed": sum(testimony_people.values()),
            "avg_points_per_entity": round(len(region_points) / len(testimony_people), 2) if testimony_people else None,
            "avg_points_per_trajectory": _mean(points_values),
            "avg_distance_per_trajectory_km": _mean(distance_values),
            "tracks_with_distance": len(distance_values),
            "latest_activity": iso_dt(latest),
        })
    return sorted(out, key=lambda row: (-row["people_observed"], row["zone"]))

def _d04_series(points: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str, all_regions: Sequence[str]) -> List[Dict[str, Any]]:
    observations = defaultdict(int)
    entity_sets = defaultdict(set)
    people_sets = defaultdict(dict)
    for point in points:
        if point.get("event_dt") is None:
            continue
        b = iso_dt(floor_bucket(point["event_dt"], granularity))
        region = point.get("region") or "Unknown"
        eid = point.get("entity_id")
        observations[(b, region)] += 1
        if eid:
            entity_sets[(b, region)].add(eid)
            people_sets[(b, region)].setdefault(eid, point.get("numPersons", 0))
    out = []
    for bucket in dense_buckets(from_dt, to_dt, granularity, max_buckets=5000):
        b = iso_dt(bucket)
        for region in all_regions:
            people = sum(people_sets.get((b, region), {}).values())
            out.append({
                "bucket": b,
                "bucket_start": b,
                "bucket_label": bucket_label(bucket, granularity),
                "region": region,
                "observations": observations.get((b, region), 0),
                "count": len(entity_sets.get((b, region), set())),
                "entities": len(entity_sets.get((b, region), set())),
                "people": people,
            })
    return out


def _d04_tracking_quality(tracks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    total = len(tracks)
    buckets = [
        ("single_observation", "Single point only", sum(1 for t in tracks if not t.get("has_followup"))),
        ("followup_no_distance", "2+ points, distance not calculable", sum(1 for t in tracks if t.get("has_followup") and not t.get("has_approx_distance"))),
        ("distance_calculable", "Approx. distance calculable", sum(1 for t in tracks if t.get("has_approx_distance"))),
        ("sequence_issue", "Sequence/time issue", sum(1 for t in tracks if not t.get("valid_sequence"))),
    ]
    return [{"level": key, "label": label, "count": count, "pct": weighted_percent(count, total)} for key, label, count in buckets]


def _d04_distance_distribution(tracks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    distances = [t.get("estimated_distance_km") for t in tracks if t.get("estimated_distance_km") is not None]
    return _dynamic_distance_distribution(distances)


def _d04_observation_clusters(points: Sequence[Dict[str, Any]], top_n: int = 15) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: {"lat": None, "lon": None, "zone": None, "region": None, "observations": 0, "entities": set(), "people": {}})
    for point in points:
        if point.get("lat") is None or point.get("lon") is None:
            continue
        key = (point.get("region") or "Unknown", round(point["lat"], 2), round(point["lon"], 2))
        item = mapping[key]
        item["lat"] = round(point["lat"], 4)
        item["lon"] = round(point["lon"], 4)
        item["zone"] = point.get("region") or "Unknown"
        item["region"] = point.get("region") or "Unknown"
        item["observations"] += 1
        eid = point.get("entity_id")
        if eid:
            item["entities"].add(eid)
            item["people"].setdefault(eid, point.get("numPersons", 0))
    out = []
    for item in mapping.values():
        people_dict = item.pop("people")
        entities_set = item.pop("entities")
        item["entities"] = len(entities_set)
        item["people_observed"] = sum(people_dict.values())
        out.append(item)
    return sorted(out, key=lambda row: (-row["people_observed"], -row["observations"]))[:top_n]


def _d04_tracking_index(tracks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = []
    for idx, track in enumerate(tracks, start=1):
        rows.append({
            "record": idx,
            "entity_id": track.get("entity_id"),
            "num_points": track.get("num_points"),
            "people": track.get("people"),
            "first_datetime": track.get("first_datetime"),
            "last_datetime": track.get("last_datetime"),
            "duration_days": track.get("duration_days"),
            "estimated_distance_km": track.get("estimated_distance_km"),
            "zones_observed": track.get("zones_observed"),
            "zones_observed_count": track.get("zones_observed_count"),
            "has_followup": track.get("has_followup"),
            "has_approx_distance": track.get("has_approx_distance"),
            "valid_sequence": track.get("valid_sequence"),
            "tracking_confidence": track.get("confidence"),
        })
    return sorted(rows, key=lambda row: (-(row.get("estimated_distance_km") or -1), -(row.get("num_points") or 0)))[:250]


# Backward-compatible alias.
def _d04_local_tracking_index(tracks: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return _d04_tracking_index(tracks)


def build_dashboard_04_output(
    raw: Sequence[Dict[str, Any]],
    selected_regions: Sequence[str] = (),
    from_dt=None,
    to_dt=None,
    granularity: str = "week",
    max_points: int = 120,
    default_days: int | None = None,
) -> Dict[str, Any]:
    """Build mobility evidence and approximate distance metrics.

    Distances are approximate straight-line sums between ordered recorded points
    belonging to the same entity/testimony. This analytical dashboard does not
    infer operational routes between zones; map/route rendering remains a separate module.
    """
    all_points = _trajectory_points(raw)
    requested_granularity = granularity if granularity in {"hour", "day", "week", "month", "year"} else "week"
    try:
        requested_max_points = max(1, int(max_points or 120))
    except (TypeError, ValueError):
        requested_max_points = 120

    def _iso_arg(value):
        if value is None:
            return None
        if isinstance(value, str):
            return value
        return iso_dt(value)

    from_dt, to_dt, dataset_min, dataset_max = coerce_window(
        all_points,
        "event_datetime",
        _iso_arg(from_dt),
        _iso_arg(to_dt),
        default_days=default_days,
        max_days=MAX_WINDOW_DAYS,
    )
    selected = set(selected_regions)
    points = [p for p in all_points if in_window(p.get("event_dt"), from_dt, to_dt) and (not selected or p.get("region") in selected)]
    tracks = _movement_tracks(points)
    all_regions = sorted({p.get("region") for p in all_points if p.get("region")})
    zone_summary = _d04_zone_summary(points, tracks, all_regions)
    tracking_index = _d04_tracking_index(tracks)
    return {
        "meta": {
            "dashboard": "04_mobility_approx_distance",
            "generated_at": iso_dt(datetime.now(dataset_max.tzinfo)),
            "dataset_min": iso_dt(dataset_min),
            "dataset_max": iso_dt(dataset_max),
            "window_from": iso_dt(from_dt),
            "window_to": iso_dt(to_dt),
            "total_entities": len({p.get("entity_id") for p in points if p.get("entity_id")}),
            "total_points": len(points),
            "total_approx_distance_tracks": sum(1 for t in tracks if t.get("has_approx_distance")),
            "all_regions": all_regions,
            "available_regions": all_regions,
            "selected_regions": list(selected_regions),
            "granularity": requested_granularity,
            "max_points": requested_max_points,
            "notes": [
                "Approximate distance is calculated from ordered points of the same entity/testimony using straight-line Haversine segments.",
                "The value is an estimate between recorded points and may understate real distance travelled.",
            ],
        },
        "kpis_global": _d04_kpis(points, tracks),
        "series": {
            "by_hour": _d04_series(points, from_dt, to_dt, "hour", all_regions) if requested_granularity == "hour" else [],
            "by_day": _d04_series(points, from_dt, to_dt, "day", all_regions),
            "by_week": _d04_series(points, from_dt, to_dt, "week", all_regions),
            "by_month": _d04_series(points, from_dt, to_dt, "month", all_regions),
            "by_year": _d04_series(points, from_dt, to_dt, "year", all_regions) if requested_granularity == "year" else [],
        },
        "tracking_funnel": _d04_tracking_funnel(points, tracks),
        "zone_summary": zone_summary,
        "coverage_by_region": zone_summary,
        "tracking_quality": _d04_tracking_quality(tracks),
        "distance_distribution": _d04_distance_distribution(tracks),
        "observation_clusters": _d04_observation_clusters(points),
        "top_nodes": _d04_observation_clusters(points),
        "tracking_index": tracking_index,
        "local_tracking_index": tracking_index,
        "data_quality": field_quality(raw, ["entity_id", "sequence_index", "current_Location", "numPersons", "event_datetime"], ["entity_id", "sequence_index", "current_Location", "numPersons", "event_datetime"]),
        "records_preview": raw[:250],
    }

def build_dashboard_01(input_dir: Path, output_dir: Path) -> None:
    save_json(build_dashboard_01_output(load_json(input_dir / "testimonies.json")), output_dir / "dashboard_01_kpis.json")
    print("Dashboard 01 built")


def build_dashboard_02(input_dir: Path, output_dir: Path) -> None:
    save_json(build_dashboard_02_output(load_json(input_dir / "events.json")), output_dir / "dashboard_02_kpis.json")
    print("Dashboard 02 built")


def build_dashboard_03(input_dir: Path, output_dir: Path) -> None:
    save_json(build_dashboard_03_output(load_json(input_dir / "events.json")), output_dir / "dashboard_03_kpis.json")
    print("Dashboard 03 built")


def build_dashboard_04(input_dir: Path, output_dir: Path) -> None:
    save_json(build_dashboard_04_output(load_json(input_dir / "trajectories.json")), output_dir / "dashboard_04_kpis.json")
    print("Dashboard 04 built")


DASHBOARDS = {"01": build_dashboard_01, "02": build_dashboard_02, "03": build_dashboard_03, "04": build_dashboard_04}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build dashboard KPI JSON files")
    parser.add_argument("--dashboard", choices=list(DASHBOARDS.keys()) + ["all"], default="all")
    parser.add_argument("--input-dir", default=str(DEFAULT_IN))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUT))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_dir = Path(args.input_dir)
    output_dir = Path(args.output_dir)
    to_run = DASHBOARDS if args.dashboard == "all" else {args.dashboard: DASHBOARDS[args.dashboard]}
    for _, func in to_run.items():
        func(input_dir, output_dir)
    print("Dashboard build completed")


if __name__ == "__main__":
    main()