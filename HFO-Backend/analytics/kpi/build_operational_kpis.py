from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from kpi_utils import (
    choose_granularity,
    coerce_window,
    dense_buckets,
    field_quality,
    floor_bucket,
    infer_region,
    in_window,
    iso_dt,
    load_json,
    normalize_regions,
    parse_dt,
    rolling_average,
    safe_int,
    save_json,
    bucket_label,
)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / "data_mock").exists() else SCRIPT_DIR
INPUT_FILE = PROJECT_ROOT / "data_mock" / "testimonies.json"
OUTPUT_FILE = PROJECT_ROOT / "outputs" / "operational_kpis_overview.json"
SUPPORTED_GRANULARITIES = ("hour", "day", "week", "month", "year")
DEFAULT_MAX_POINTS = 120
MAX_WINDOW_DAYS = 365 * 20


def annotate_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for row in rows:
        recorded_dt = parse_dt(row.get("recorded_datetime"))
        event_dt = parse_dt(row.get("event_datetime"))
        out.append({
            "submitted_by": row.get("submitted_by", "Unknown"),
            "testimony_ID": row.get("testimony_ID"),
            "entity_id": row.get("entity_id"),
            "recorded_datetime": row.get("recorded_datetime"),
            "recorded_dt": recorded_dt,
            "event_datetime": row.get("event_datetime"),
            "event_dt": event_dt,
            "timezone": row.get("timezone"),
            "current_Location": row.get("current_Location"),
            "numPersons": row.get("numPersons"),
            "people_weight": max(safe_int(row.get("numPersons"), 0), 0),
            "gender": row.get("gender"),
            "nationality": row.get("nationality"),
            "region": infer_region(row),
        })
    return out


def get_available_regions(rows: Sequence[Dict[str, Any]]) -> List[str]:
    return sorted({row.get("region") or "Unknown" for row in rows})


def filter_rows(rows: Sequence[Dict[str, Any]], selected_regions: Sequence[str], from_dt, to_dt) -> List[Dict[str, Any]]:
    selected = set(selected_regions)
    return [
        row for row in rows
        if in_window(row.get("recorded_dt"), from_dt, to_dt)
        and (not selected or row.get("region") in selected)
    ]


def compute_overview(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    seen_entities: set = set()
    total_people = 0
    for row in rows:
        e_id = row.get("entity_id")
        if e_id:
            if e_id not in seen_entities:
                total_people += row.get("people_weight", 0)
                seen_entities.add(e_id)
        else:
            total_people += row.get("people_weight", 0)
    return {
        "total_people_represented": total_people,
        "total_testimonies": len({row.get("testimony_ID") for row in rows if row.get("testimony_ID")}),
        "total_entities": len(seen_entities),
    }


def compute_region_totals(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    ids: Dict[str, set] = defaultdict(set)
    people: Dict[str, int] = defaultdict(int)
    seen_entities: Dict[str, set] = defaultdict(set)
    for row in rows:
        region = row.get("region") or "Unknown"
        if row.get("testimony_ID"):
            ids[region].add(row["testimony_ID"])
        e_id = row.get("entity_id")
        if e_id:
            if e_id not in seen_entities[region]:
                people[region] += row.get("people_weight", 0)
                seen_entities[region].add(e_id)
        else:
            people[region] += row.get("people_weight", 0)
    return sorted([
        {"region": region, "testimonies_count": len(ids[region]), "people_represented": people[region]}
        for region in set(ids) | set(people)
    ], key=lambda item: -item["people_represented"])


def time_series(rows: Sequence[Dict[str, Any]], from_dt, to_dt, granularity: str, by_region: bool = False) -> List[Dict[str, Any]]:
    id_map: Dict[Any, set] = defaultdict(set)
    people_map: Dict[Any, int] = defaultdict(int)
    seen_entity_keys: set = set()
    regions = sorted({row.get("region") or "Unknown" for row in rows}) or ["Unknown"]
    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        bucket = floor_bucket(dt, granularity)
        key = (bucket, row.get("region") or "Unknown") if by_region else bucket
        if row.get("testimony_ID"):
            id_map[key].add(row["testimony_ID"])
        e_id = row.get("entity_id")
        entity_key = (key, e_id) if e_id else None
        if entity_key:
            if entity_key not in seen_entity_keys:
                people_map[key] += row.get("people_weight", 0)
                seen_entity_keys.add(entity_key)
        else:
            people_map[key] += row.get("people_weight", 0)
    buckets = dense_buckets(from_dt, to_dt, granularity, max_buckets=5000)
    output = []
    if by_region:
        for bucket in buckets:
            for region in regions:
                key = (bucket, region)
                output.append({
                    "bucket_start": iso_dt(bucket),
                    "bucket_label": bucket_label(bucket, granularity),
                    "granularity": granularity,
                    "region": region,
                    "testimonies_count": len(id_map.get(key, set())),
                    "people_represented": people_map.get(key, 0),
                })
    else:
        for bucket in buckets:
            output.append({
                "bucket_start": iso_dt(bucket),
                "bucket_label": bucket_label(bucket, granularity),
                "granularity": granularity,
                "testimonies_count": len(id_map.get(bucket, set())),
                "people_represented": people_map.get(bucket, 0),
            })
    return output


def activity_curve(rows: Sequence[Dict[str, Any]], by_region: bool = False) -> List[Dict[str, Any]]:
    id_map: Dict[Any, set] = defaultdict(set)
    regions = sorted({row.get("region") or "Unknown" for row in rows}) or ["Unknown"]
    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        key = (dt.hour, row.get("region") or "Unknown") if by_region else dt.hour
        if row.get("testimony_ID"):
            id_map[key].add(row["testimony_ID"])
    output = []
    if by_region:
        for hour in range(24):
            for region in regions:
                output.append({"hour": hour, "region": region, "testimonies_count": len(id_map.get((hour, region), set()))})
    else:
        for hour in range(24):
            output.append({"hour": hour, "testimonies_count": len(id_map.get(hour, set()))})
    return output




def activity_average_by_hour(rows: Sequence[Dict[str, Any]], by_region: bool = False) -> List[Dict[str, Any]]:
    """Average testimonies by hour of day within the selected window.

    The denominator is the number of calendar days with at least one recorded testimony
    in the filtered dataset. This keeps the chart meaningful for short windows and avoids
    dividing by inactive days outside the selected data.
    """
    id_map: Dict[Any, set] = defaultdict(set)
    people_map: Dict[Any, int] = defaultdict(int)
    dates_by_region: Dict[str, set] = defaultdict(set)
    all_dates = set()
    regions = sorted({row.get("region") or "Unknown" for row in rows}) or ["Unknown"]

    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        region = row.get("region") or "Unknown"
        date_key = dt.date().isoformat()
        all_dates.add(date_key)
        dates_by_region[region].add(date_key)
        key = (dt.hour, region) if by_region else dt.hour
        if row.get("testimony_ID"):
            id_map[key].add(row["testimony_ID"])
        people_map[key] += row.get("people_weight", 0)

    output: List[Dict[str, Any]] = []
    if by_region:
        for hour in range(24):
            for region in regions:
                denominator = max(len(dates_by_region.get(region, set())), 1)
                total_testimonies = len(id_map.get((hour, region), set()))
                total_people = people_map.get((hour, region), 0)
                output.append({
                    "hour": hour,
                    "region": region,
                    "testimonies_count": total_testimonies,
                    "people_represented": total_people,
                    "active_days": denominator,
                    "avg_testimonies_per_day": round(total_testimonies / denominator, 2),
                    "avg_people_per_day": round(total_people / denominator, 2),
                })
    else:
        denominator = max(len(all_dates), 1)
        for hour in range(24):
            total_testimonies = len(id_map.get(hour, set()))
            total_people = people_map.get(hour, 0)
            output.append({
                "hour": hour,
                "testimonies_count": total_testimonies,
                "people_represented": total_people,
                "active_days": denominator,
                "avg_testimonies_per_day": round(total_testimonies / denominator, 2),
                "avg_people_per_day": round(total_people / denominator, 2),
            })
    return output

def week_comparison(rows: Sequence[Dict[str, Any]], dataset_max) -> Dict[str, Any]:
    end = dataset_max
    start = end - timedelta(days=7)
    prev_start = start - timedelta(days=7)

    def stats(a, b):
        subset = [r for r in rows if in_window(r.get("recorded_dt"), a, b)]
        # Deduplicate people by entity_id, same as compute_overview.
        seen_entities: set = set()
        total_people = 0
        entity_ids: set = set()
        for r in subset:
            e_id = r.get("entity_id")
            if e_id:
                if e_id not in seen_entities:
                    total_people += r.get("people_weight", 0)
                    seen_entities.add(e_id)
                entity_ids.add(e_id)
            else:
                total_people += r.get("people_weight", 0)
        return {
            "groups": len(entity_ids),
            "people": total_people,
            "active_regions": sorted({str(r.get("region")) for r in subset if r.get("region")}),
            "from": iso_dt(a),
            "to": iso_dt(b),
        }

    current = stats(start, end)
    previous = stats(prev_start, start)

    def pct(curr, prev):
        if prev == 0:
            return None
        return round((curr - prev) / prev * 100, 1)

    return {"current_week": current, "previous_week": previous, "change": {"groups_pct": pct(current["groups"], previous["groups"]), "people_pct": pct(current["people"], previous["people"])}}


def last_region(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    valid = [r for r in rows if r.get("recorded_dt") and r.get("region")]
    if not valid:
        return {"region": None, "recorded_at": None, "days_ago": None}
    last = max(valid, key=lambda r: r["recorded_dt"])
    now = max(r["recorded_dt"] for r in valid)
    return {"region": last["region"], "recorded_at": iso_dt(last["recorded_dt"]), "days_ago": max(0, (now - last["recorded_dt"]).days)}


def region_last_activity(rows: Sequence[Dict[str, Any]], regions: Sequence[str], reference_dt=None) -> List[Dict[str, Any]]:
    valid = [r for r in rows if r.get("recorded_dt")]
    reference = reference_dt or max((r["recorded_dt"] for r in valid), default=None)
    result = []
    for region in regions:
        dts = [r["recorded_dt"] for r in valid if r.get("region") == region]
        if not dts or reference is None:
            result.append({"region": region, "last_active": None, "days_ago": None, "status": "red"})
            continue
        last = max(dts)
        days = max(0, (reference - last).days)
        status = "green" if days <= 7 else "yellow" if days <= 14 else "red"
        result.append({"region": region, "last_active": iso_dt(last), "days_ago": days, "status": status})
    return result


def moving_average_weekly(rows: Sequence[Dict[str, Any]], from_dt, to_dt) -> List[Dict[str, Any]]:
    base = time_series(rows, from_dt, to_dt, "week", by_region=False)
    vals = [row["testimonies_count"] for row in base]
    ma = rolling_average(vals, 4)
    return [{**row, "moving_avg": ma[i]} for i, row in enumerate(base)]


def heatmap_day_hour(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    counts = defaultdict(int)
    for row in rows:
        dt = row.get("recorded_dt")
        if dt:
            counts[(dt.weekday(), dt.hour)] += 1
    return [{"day": labels[d], "day_n": d, "hour": h, "count": counts.get((d, h), 0)} for d in range(7) for h in range(24)]


def heatmap_week_region(rows: Sequence[Dict[str, Any]], from_dt, to_dt, regions: Sequence[str]) -> List[Dict[str, Any]]:
    counts = defaultdict(int)
    for row in rows:
        dt = row.get("recorded_dt")
        if dt:
            counts[(iso_dt(floor_bucket(dt, "week")), row.get("region") or "Unknown")] += 1
    buckets = [iso_dt(b) for b in dense_buckets(from_dt, to_dt, "week", max_buckets=2000)]
    return [{"bucket_start": b, "region": region, "count": counts.get((b, region), 0)} for b in buckets for region in regions]


def operational_dq(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    # Only fields that exist in the current project contract are measured.
    # gender/nationality are informative fields, not required for the operational KPI.
    fields = ["testimony_ID", "recorded_datetime", "event_datetime", "numPersons", "current_Location", "gender", "nationality"]
    required = ["testimony_ID", "recorded_datetime", "event_datetime", "numPersons", "current_Location"]
    return field_quality(rows, fields, required)


def build_output(all_rows, filtered_rows, selected_regions, available_regions, from_dt, to_dt, dataset_min, dataset_max, granularity, max_points, previous_step_days=365) -> Dict[str, Any]:
    by_gran = {g: time_series(filtered_rows, from_dt, to_dt, g, False) for g in SUPPORTED_GRANULARITIES}
    by_region = {g: time_series(filtered_rows, from_dt, to_dt, g, True) for g in SUPPORTED_GRANULARITIES}
    has_older = from_dt > dataset_min
    display_regions = list(selected_regions) if selected_regions else list(available_regions)
    return {
        "meta": {
            "selected_regions": list(selected_regions),
            "available_regions": list(available_regions),
            "available_granularities": list(SUPPORTED_GRANULARITIES),
            "is_region_filtered": bool(selected_regions),
            "loaded_records": len(filtered_rows),
            "total_records_in_dataset": len(all_rows),
            "requested_max_points": max_points,
            "granularity_used": granularity,
            "series_contract_version": 3,
            "source_file": "testimonies.json",
            "dataset_min_recorded_datetime": iso_dt(dataset_min),
            "dataset_max_recorded_datetime": iso_dt(dataset_max),
            "window_from": iso_dt(from_dt),
            "window_to": iso_dt(to_dt),
            "window_days": (to_dt - from_dt).days,
            "has_older_data": has_older,
            "suggested_previous_query": {"from": iso_dt(max(dataset_min, from_dt - timedelta(days=previous_step_days))), "to": iso_dt(from_dt - timedelta(seconds=1))} if has_older else None,
            "notes": ["No volunteer KPIs are computed because volunteer_ID is not part of the current data contract."],
        },
        "overview": compute_overview(filtered_rows),
        "week_comparison": week_comparison(filtered_rows, to_dt),
        "last_region": last_region(filtered_rows),
        "region_last_activity": region_last_activity(filtered_rows, display_regions, to_dt),
        "breakdowns": {"region_totals": compute_region_totals(filtered_rows)},
        "series": {
            "testimonies_over_time": by_gran.get(granularity) or by_gran["week"],
            "activity_curve_by_hour": activity_curve(filtered_rows, by_region=False),
            "testimonies_over_time_by_granularity": by_gran,
            "testimonies_over_time_by_region": by_region,
            "activity_curve_by_hour_by_region": activity_curve(filtered_rows, by_region=True),
            "activity_average_by_hour": activity_average_by_hour(filtered_rows, by_region=False),
            "activity_average_by_hour_by_region": activity_average_by_hour(filtered_rows, by_region=True),
            "moving_average_weekly": moving_average_weekly(filtered_rows, from_dt, to_dt),
            "heatmap_day_hour": heatmap_day_hour(filtered_rows),
            "heatmap_week_region": heatmap_week_region(filtered_rows, from_dt, to_dt, display_regions),
            "activity_hour_by_region_period": activity_curve(filtered_rows, by_region=True),
        },
        "data_quality": operational_dq(filtered_rows),
        "records_preview": [
            {"testimony_ID": r.get("testimony_ID"), "recorded_datetime": r.get("recorded_datetime"), "event_datetime": r.get("event_datetime"), "region": r.get("region"), "numPersons": r.get("numPersons"), "current_Location": r.get("current_Location"), "gender": r.get("gender"), "nationality": r.get("nationality")}
            for r in filtered_rows[:max_points]
        ],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build operational KPIs")
    parser.add_argument("--from-date", dest="from_date")
    parser.add_argument("--to-date", dest="to_date")
    parser.add_argument("--regions")
    parser.add_argument("--granularity", choices=["auto", *SUPPORTED_GRANULARITIES], default="auto")
    parser.add_argument("--max-points", type=int, default=DEFAULT_MAX_POINTS)
    parser.add_argument("--previous-step-days", type=int, default=365)
    parser.add_argument("--input-file", default=str(INPUT_FILE))
    parser.add_argument("--output-file", default=str(OUTPUT_FILE))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    raw = load_json(Path(args.input_file))
    all_rows = annotate_rows(raw)
    selected_regions = normalize_regions(args.regions)
    available_regions = get_available_regions(all_rows)
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", args.from_date, args.to_date, default_days=None, max_days=MAX_WINDOW_DAYS)
    filtered = filter_rows(all_rows, selected_regions, from_dt, to_dt)
    granularity = choose_granularity(from_dt, to_dt, args.granularity, args.max_points)
    output = build_output(all_rows, filtered, selected_regions, available_regions, from_dt, to_dt, dataset_min, dataset_max, granularity, args.max_points, args.previous_step_days)
    save_json(output, Path(args.output_file))
    print("Operational KPIs built")
    print(f"Output: {args.output_file}")
    print(f"Records: {len(filtered)} / {len(all_rows)}")


if __name__ == "__main__":
    main()