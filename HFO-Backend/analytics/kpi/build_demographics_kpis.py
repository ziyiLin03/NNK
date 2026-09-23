from __future__ import annotations

import argparse
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

from kpi_utils import (
    bucket_label,
    coerce_window,
    dense_buckets,
    field_quality,
    floor_bucket,
    infer_region,
    in_window,
    iso_dt,
    load_json,
    normalize_category,
    normalize_regions,
    parse_dt,
    safe_float,
    safe_int,
    save_json,
    weighted_percent,
)

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent if (SCRIPT_DIR.parent / "data_mock").exists() else SCRIPT_DIR
INPUT_FILE = PROJECT_ROOT / "data_mock" / "testimonies.json"
OUTPUT_FILE = PROJECT_ROOT / "outputs" / "demographics_kpis_overview.json"
MAX_WINDOW_DAYS = 365 * 20


VULNERABILITY_LABELS = {
    "pregnant": "Pregnancy",
    "disability": "Disability",
    "chronic_illnes": "Chronic illness",
    "acute_illnes": "Acute illness",
    "injured": "Injured",
    "lgbtq": "LGBTQ",
    "elderly": "Elderly",
    "family_separation": "Family separation",
    "psychological_distress": "Psychological distress",
    "food_insecurity": "Food insecurity",
    "communication_barrier": "Communication barrier",
    "religion_risk": "Religion risk",
    "trafficking_risk": "Trafficking risk",
    "gbv_risk": "GBV risk",
    "other": "Other",
}

VULNERABILITY_ALIASES = {
    "pregnancy": "pregnant",
    "pregnant": "pregnant",
    "disability": "disability",
    "disabled": "disability",
    "chronic illness": "chronic_illnes",
    "chronic_illness": "chronic_illnes",
    "chronic_illnes": "chronic_illnes",
    "acute illness": "acute_illnes",
    "acute_illness": "acute_illnes",
    "acute_illnes": "acute_illnes",
    "medical": "acute_illnes",
    "dehydration": "acute_illnes",
    "injury": "injured",
    "injured": "injured",
    "lgbtq": "lgbtq",
    "lgbtqi": "lgbtq",
    "elderly": "elderly",
    "family": "family_separation",
    "family separation": "family_separation",
    "family_separation": "family_separation",
    "psychological distress": "psychological_distress",
    "psychological_distress": "psychological_distress",
    "mental distress": "psychological_distress",
    "mental_distress": "psychological_distress",
    "food insecurity": "food_insecurity",
    "food_insecurity": "food_insecurity",
    "communication barrier": "communication_barrier",
    "communication_barrier": "communication_barrier",
    "language": "communication_barrier",
    "religion risk": "religion_risk",
    "religion_risk": "religion_risk",
    "trafficking": "trafficking_risk",
    "trafficking risk": "trafficking_risk",
    "trafficking_risk": "trafficking_risk",
    "gbv risk": "gbv_risk",
    "gbv_risk": "gbv_risk",
    "violence_survivor": "gbv_risk",
    "violence survivor": "gbv_risk",
    "sleeping_rough": "other",
    "sleeping rough": "other",
    "minor": "other",
    "other": "other",
}

NON_VULNERABILITY_VALUES = {"", "none", "none reported", "no", "unknown", "not assessed", "null", "nan"}
VULNERABILITY_GROUP_HEADERS = {"health_and_physiology", "protection_and_rights", "adaptabily_conditionals"}


def _canonical_vulnerability(raw: Any) -> Optional[str]:
    text = str(raw).strip()
    if not text:
        return None
    key = text.lower().strip().replace("-", "_")
    key = " ".join(key.split())
    if key in NON_VULNERABILITY_VALUES or key in VULNERABILITY_GROUP_HEADERS:
        return None
    canonical = VULNERABILITY_ALIASES.get(key) or VULNERABILITY_ALIASES.get(key.replace(" ", "_"))
    if canonical is None:
        canonical = "other"
    return VULNERABILITY_LABELS[canonical]


def normalize_vulnerabilities(value: Any) -> Tuple[List[str], str]:
    if value is None:
        return [], "unknown"
    if isinstance(value, list):
        if len(value) == 0:
            return [], "none_reported"
        raw_values = value
    else:
        text = str(value).strip()
        if not text:
            return [], "unknown"
        # Accept either a single value or comma/semicolon separated strings from APIs/CSV exports.
        raw_values = [chunk.strip() for part in text.split(";") for chunk in part.split(",")]

    labels = []
    had_non_empty = False
    for item in raw_values:
        if item is None:
            continue
        if str(item).strip():
            had_non_empty = True
        label = _canonical_vulnerability(item)
        if label:
            labels.append(label)

    labels = sorted(set(labels))
    if labels:
        return labels, "reported"
    return [], "none_reported" if had_non_empty else "unknown"


def annotate_rows(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for row in rows:
        recorded_dt = parse_dt(row.get("recorded_datetime"))
        event_dt = parse_dt(row.get("event_datetime"))
        vulns, vuln_status = normalize_vulnerabilities(row.get("vulnerability_types"))
        health = safe_float(row.get("general_health"))
        if health is not None and not (1 <= health <= 5):
            health = None
        out.append({
            "testimony_ID": row.get("testimony_ID"),
            "entity_id": row.get("entity_id"),
            "recorded_datetime": row.get("recorded_datetime"),
            "recorded_dt": recorded_dt,
            "event_datetime": row.get("event_datetime"),
            "event_dt": event_dt,
            "timezone": row.get("timezone"),
            "current_Location": row.get("current_Location"),
            "region": infer_region(row),
            "numPersons": row.get("numPersons"),
            "people_weight": max(safe_int(row.get("numPersons"), 0), 0),
            "gender": normalize_category(row.get("gender")),
            "nationality": normalize_category(row.get("nationality")),
            "legal_situation": normalize_category(row.get("legal_situation")),
            "vulnerability_types": vulns,
            "vulnerability_status": vuln_status,
            "general_health": health,
        })
    return out


def get_available_regions(rows: Sequence[Dict[str, Any]]) -> List[str]:
    return sorted({row.get("region") or "Unknown" for row in rows})


def filter_rows(rows: Sequence[Dict[str, Any]], selected_regions: Sequence[str], from_dt, to_dt) -> List[Dict[str, Any]]:
    selected = set(selected_regions)
    return [r for r in rows if in_window(r.get("recorded_dt"), from_dt, to_dt) and (not selected or r.get("region") in selected)]


def total_people(rows: Sequence[Dict[str, Any]]) -> int:
    seen_entities = set()
    total = 0
    for r in rows:
        e_id = r.get("entity_id")
        if e_id:
            if e_id not in seen_entities:
                total += r.get("people_weight", 0)
                seen_entities.add(e_id)
        else:
            total += r.get("people_weight", 0)
    return total


def weighted_average_health(rows: Sequence[Dict[str, Any]]) -> Optional[float]:
    num = 0.0
    den = 0
    seen_entities = set()
    for row in rows:
        score = row.get("general_health")
        weight = row.get("people_weight", 0)
        if score is None or weight <= 0:
            continue
        e_id = row.get("entity_id")
        if e_id:
            if e_id not in seen_entities:
                num += score * weight
                den += weight
                seen_entities.add(e_id)
        else:
            num += score * weight
            den += weight
    return round(num / den, 2) if den else None


def compute_overview(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    known_nat = {r.get("nationality") for r in rows if r.get("nationality") and r.get("nationality") != "Unknown"}
    return {
        "total_testimonies": len({r.get("testimony_ID") for r in rows if r.get("testimony_ID")}),
        "total_entities": len({r.get("entity_id") for r in rows if r.get("entity_id")}),
        "total_people_represented": total_people(rows),
        "unique_nationalities": len(known_nat),
        "avg_health_weighted": weighted_average_health(rows),
    }


def format_rows(totals: Dict[str, Dict[str, int]], denominator: int) -> List[Dict[str, Any]]:
    rows = []
    total_testimonies = sum(values["testimonies_count"] for values in totals.values())
    for label, values in totals.items():
        people = values["people_represented"]
        people_percent = round(people / denominator * 100, 2) if denominator else 0
        testimonies_percent = round(values["testimonies_count"] / total_testimonies * 100, 2) if total_testimonies else 0
        rows.append({
            "label": label,
            "people_represented": people,
            "value": people,
            "testimonies_count": values["testimonies_count"],
            "share_people": testimonies_percent,
            "share_people_raw": people_percent,
            "share_testimonies": testimonies_percent,
            "pct": testimonies_percent,
        })
    return sorted(rows, key=lambda r: (-r["people_represented"], r["label"]))


def build_breakdown(rows: Sequence[Dict[str, Any]], field: str, exclude_unknown: bool = True) -> List[Dict[str, Any]]:
    totals = defaultdict(lambda: {"people_represented": 0, "testimonies_count": 0})
    denominator = 0
    
    for row in rows:
        label = normalize_category(row.get(field))
        if exclude_unknown and label == "Unknown":
            continue
        weight = row.get("people_weight", 0)
        
        totals[label]["testimonies_count"] += 1
        totals[label]["people_represented"] += weight
        denominator += weight
            
    return format_rows(totals, denominator)


def vulnerability_status(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    labels = {"reported": "Any vulnerability reported", "none_reported": "None reported", "unknown": "Unknown / not assessed"}
    totals = defaultdict(lambda: {"people_represented": 0, "testimonies_count": 0})
    seen_keys = set()
    denominator = 0
    
    for row in rows:
        status = row.get("vulnerability_status") or "unknown"
        label = labels[status]
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        
        totals[label]["testimonies_count"] += 1
        
        if e_id:
            key = (label, e_id)
            if key not in seen_keys:
                totals[label]["people_represented"] += weight
                denominator += weight
                seen_keys.add(key)
        else:
            totals[label]["people_represented"] += weight
            denominator += weight
            
    return format_rows(totals, denominator)


def build_vulnerability_breakdown(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    totals = defaultdict(lambda: {"people_represented": 0, "testimonies_count": 0})
    seen_keys = set()
    seen_denom_entities = set()
    denominator = 0
    
    for row in rows:
        if row.get("vulnerability_status") == "unknown":
            continue
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        
        if e_id:
            if e_id not in seen_denom_entities:
                denominator += weight
                seen_denom_entities.add(e_id)
        else:
            denominator += weight
            
        for label in row.get("vulnerability_types") or []:
            totals[label]["testimonies_count"] += 1
            if e_id:
                key = (label, e_id)
                if key not in seen_keys:
                    totals[label]["people_represented"] += weight
                    seen_keys.add(key)
            else:
                totals[label]["people_represented"] += weight
                
    result = format_rows(totals, denominator)
    for item in result:
        item["prevalence_pct"] = item.pop("share_people")
        item["share_people"] = item["prevalence_pct"]
    return result


def health_distribution(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    totals = defaultdict(lambda: {"people_represented": 0, "testimonies_count": 0})
    seen_keys = set()
    seen_denom_entities = set()
    denominator = 0
    
    for row in rows:
        score = row.get("general_health")
        if score is None:
            continue
        label = str(int(score))
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        
        if e_id:
            if e_id not in seen_denom_entities:
                denominator += weight
                seen_denom_entities.add(e_id)
        else:
            denominator += weight
            
        totals[label]["testimonies_count"] += 1
        if e_id:
            key = (label, e_id)
            if key not in seen_keys:
                totals[label]["people_represented"] += weight
                seen_keys.add(key)
        else:
            totals[label]["people_represented"] += weight
            
    return sorted(format_rows(totals, denominator), key=lambda r: int(r["label"]))


def gender_by_context(rows: Sequence[Dict[str, Any]], context_field: str) -> List[Dict[str, Any]]:
    people_mapping = defaultdict(lambda: defaultdict(int))
    testimony_mapping = defaultdict(lambda: defaultdict(int))
    testimony_totals = defaultdict(int)

    for row in rows:
        ctx = normalize_category(row.get(context_field))
        gender = normalize_category(row.get("gender"))
        if ctx == "Unknown" or gender == "Unknown":
            continue
        weight = row.get("people_weight", 0)
        people_mapping[ctx][gender] += weight
        testimony_mapping[ctx][gender] += 1
        testimony_totals[ctx] += 1

    out = []
    for ctx, genders in people_mapping.items():
        total_people = sum(genders.values())
        total_testimonies = testimony_totals[ctx]
        out.append({
            "context": ctx,
            "total_people": total_people,
            "total_testimonies": total_testimonies,
            "genders": [
                {
                    "gender": g,
                    "people": p,
                    "testimonies": testimony_mapping[ctx].get(g, 0),
                    "people_pct": weighted_percent(p, total_people),
                    "pct": round(testimony_mapping[ctx].get(g, 0) / total_testimonies * 100, 2) if total_testimonies else 0,
                }
                for g, p in sorted(genders.items(), key=lambda x: -x[1])
            ],
        })
    return sorted(out, key=lambda x: -x["total_testimonies"])


def nationality_by_region(rows: Sequence[Dict[str, Any]], top_n: int = 8) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: defaultdict(int))
    for row in rows:
        nat = normalize_category(row.get("nationality"))
        if nat == "Unknown":
            continue
        region = row.get("region") or "Unknown"
        weight = row.get("people_weight", 0)
        mapping[region][nat] += weight
            
    out = []
    for region, nats in mapping.items():
        total = sum(nats.values())
        top = sorted(nats.items(), key=lambda x: -x[1])[:top_n]
        out.append({"region": region, "total_people": total, "nationalities": [{"nationality": n, "people": p, "pct": weighted_percent(p, total)} for n, p in top]})
    return sorted(out, key=lambda x: -x["total_people"])


def monthly_series(rows: Sequence[Dict[str, Any]], from_dt, to_dt, field: str, top_n: int = 5, exclude_unknown: bool = True) -> Dict[str, Any]:
    totals = defaultdict(int)
    for row in rows:
        label = normalize_category(row.get(field))
        if exclude_unknown and label == "Unknown":
            continue
        weight = row.get("people_weight", 0)
        totals[label] += weight
            
    top_labels = [label for label, _ in sorted(totals.items(), key=lambda x: -x[1])[:top_n]]
    buckets = [b.strftime("%Y-%m") for b in dense_buckets(from_dt, to_dt, "month", max_buckets=500)]
    mapping = defaultdict(int)
    
    for row in rows:
        dt = row.get("recorded_dt")
        label = normalize_category(row.get(field))
        if dt is None or label not in top_labels:
            continue
        bucket = dt.strftime("%Y-%m")
        weight = row.get("people_weight", 0)
        mapping[(label, bucket)] += weight
            
    return {field + "s": top_labels, "buckets": buckets, "series": [{field: label, "data": [mapping.get((label, b), 0) for b in buckets]} for label in top_labels]}


def vulnerability_by_gender(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: defaultdict(int))
    seen_keys = set()
    for row in rows:
        gender = normalize_category(row.get("gender"))
        if gender == "Unknown":
            continue
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        
        for vuln in row.get("vulnerability_types") or []:
            if e_id:
                key = (vuln, gender, e_id)
                if key not in seen_keys:
                    mapping[vuln][gender] += weight
                    seen_keys.add(key)
            else:
                mapping[vuln][gender] += weight
                
    out = []
    for vuln, genders in mapping.items():
        total = sum(genders.values())
        out.append({"vulnerability": vuln, "total_people": total, "genders": [{"gender": g, "people": p, "pct": weighted_percent(p, total)} for g, p in sorted(genders.items(), key=lambda x: -x[1])]})
    return sorted(out, key=lambda x: -x["total_people"])


def vulnerability_by_region(rows: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: defaultdict(int))
    seen_keys = set()
    for row in rows:
        region = row.get("region") or "Unknown"
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        
        for vuln in row.get("vulnerability_types") or []:
            if e_id:
                key = (region, vuln, e_id)
                if key not in seen_keys:
                    mapping[region][vuln] += weight
                    seen_keys.add(key)
            else:
                mapping[region][vuln] += weight
                
    out = []
    for region, vulns in mapping.items():
        total = sum(vulns.values())
        out.append({"region": region, "total_people": total, "vulnerabilities": [{"vulnerability": v, "people": p, "pct": weighted_percent(p, total)} for v, p in sorted(vulns.items(), key=lambda x: -x[1])]})
    return sorted(out, key=lambda x: -x["total_people"])


def vulnerability_over_time(rows: Sequence[Dict[str, Any]], from_dt, to_dt) -> Dict[str, Any]:
    totals = defaultdict(int)
    seen_totals_keys = set()
    for row in rows:
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        for vuln in row.get("vulnerability_types") or []:
            if e_id:
                key = (vuln, e_id)
                if key not in seen_totals_keys:
                    totals[vuln] += weight
                    seen_totals_keys.add(key)
            else:
                totals[vuln] += weight
                
    top = [v for v, _ in sorted(totals.items(), key=lambda x: -x[1])[:8]]
    buckets = [b.strftime("%Y-%m") for b in dense_buckets(from_dt, to_dt, "month", max_buckets=500)]
    mapping = defaultdict(int)
    seen_mapping_keys = set()
    
    for row in rows:
        dt = row.get("recorded_dt")
        if dt is None:
            continue
        bucket = dt.strftime("%Y-%m")
        weight = row.get("people_weight", 0)
        e_id = row.get("entity_id")
        for vuln in row.get("vulnerability_types") or []:
            if vuln in top:
                if e_id:
                    key = (vuln, bucket, e_id)
                    if key not in seen_mapping_keys:
                        mapping[(vuln, bucket)] += weight
                        seen_mapping_keys.add(key)
                else:
                    mapping[(vuln, bucket)] += weight
                    
    return {"vulnerabilities": top, "buckets": buckets, "series": [{"vulnerability": v, "data": [mapping.get((v, b), 0) for b in buckets]} for v in top]}


def health_by_group(rows: Sequence[Dict[str, Any]], field: str, key_name: str, top_n: Optional[int] = None) -> List[Dict[str, Any]]:
    mapping = defaultdict(lambda: {"num": 0.0, "den": 0, "people": 0, "count": 0})
    seen_keys = set()
    for row in rows:
        score = row.get("general_health")
        weight = row.get("people_weight", 0)
        label = normalize_category(row.get(field))
        if score is None or weight <= 0 or label == "Unknown":
            continue
        e_id = row.get("entity_id")
        
        mapping[label]["count"] += 1
        if e_id:
            key = (label, e_id)
            if key not in seen_keys:
                mapping[label]["num"] += score * weight
                mapping[label]["den"] += weight
                mapping[label]["people"] += weight
                seen_keys.add(key)
        else:
            mapping[label]["num"] += score * weight
            mapping[label]["den"] += weight
            mapping[label]["people"] += weight
            
    result = [{key_name: label, "avg_health": round(v["num"] / v["den"], 2) if v["den"] else None, "total_people": v["people"], "testimonies": v["count"]} for label, v in mapping.items()]
    result = sorted(result, key=lambda r: -r["total_people"])
    if top_n:
        result = result[:top_n]
    return sorted(result, key=lambda r: (r["avg_health"] if r["avg_health"] is not None else 99))


def health_over_time(rows: Sequence[Dict[str, Any]], from_dt, to_dt) -> Dict[str, Any]:
    buckets = [b.strftime("%Y-%m") for b in dense_buckets(from_dt, to_dt, "month", max_buckets=500)]
    mapping = defaultdict(lambda: {"num": 0.0, "den": 0})
    seen_keys = set()
    for row in rows:
        dt = row.get("recorded_dt")
        score = row.get("general_health")
        weight = row.get("people_weight", 0)
        if dt is None or score is None or weight <= 0:
            continue
        b = dt.strftime("%Y-%m")
        e_id = row.get("entity_id")
        
        if e_id:
            key = (b, e_id)
            if key not in seen_keys:
                mapping[b]["num"] += score * weight
                mapping[b]["den"] += weight
                seen_keys.add(key)
        else:
            mapping[b]["num"] += score * weight
            mapping[b]["den"] += weight
    return {"buckets": buckets, "data": [round(mapping[b]["num"] / mapping[b]["den"], 2) if mapping[b]["den"] else None for b in buckets]}


def demographics_dq(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    fields = ["testimony_ID", "entity_id", "recorded_datetime", "event_datetime", "current_Location", "numPersons", "gender", "nationality", "general_health", "vulnerability_types"]
    required = ["testimony_ID", "entity_id", "recorded_datetime", "event_datetime", "current_Location", "numPersons"]
    base = field_quality(rows, fields, required)
    base["critical_field_completeness"] = [{"field": f["field"], "filled_records": f["filled"], "empty_or_missing_records": f["missing"], "fill_percent": f["pct"]} for f in base["fields"]]
    return base


def data_quality_overview(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    dq = demographics_dq(rows)
    fields = [{"field": item["field"], "fill_percent": item["pct"], "filled": item["filled"], "missing": item["missing"]} for item in dq["fields"]]
    return {"overall_completeness_pct": dq["overall_pct"], "worst_field": dq["worst_field"], "worst_pct": dq["worst_pct"], "field_completeness": sorted(fields, key=lambda x: x["fill_percent"])}


def unknown_summary(rows: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    people = total_people(rows)
    
    def missing(field):
        seen_entities = set()
        p = 0
        for r in rows:
            if normalize_category(r.get(field)) == "Unknown":
                weight = r.get("people_weight", 0)
                e_id = r.get("entity_id")
                if e_id:
                    if e_id not in seen_entities:
                        p += weight
                        seen_entities.add(e_id)
                else:
                    p += weight
        return {"people": p, "pct": weighted_percent(p, people)}
        
    seen_vuln_unk = set()
    vuln_unknown = 0
    for r in rows:
        if r.get("vulnerability_status") == "unknown":
            weight = r.get("people_weight", 0)
            e_id = r.get("entity_id")
            if e_id:
                if e_id not in seen_vuln_unk:
                    vuln_unknown += weight
                    seen_vuln_unk.add(e_id)
            else:
                vuln_unknown += weight
                
    seen_vuln_none = set()
    vuln_none = 0
    for r in rows:
        if r.get("vulnerability_status") == "none_reported":
            weight = r.get("people_weight", 0)
            e_id = r.get("entity_id")
            if e_id:
                if e_id not in seen_vuln_none:
                    vuln_none += weight
                    seen_vuln_none.add(e_id)
            else:
                vuln_none += weight
                
    return {
        "gender_unknown": missing("gender"),
        "nationality_unknown": missing("nationality"),
        "vulnerability_unknown": {"people": vuln_unknown, "pct": weighted_percent(vuln_unknown, people)},
        "vulnerability_none_reported": {"people": vuln_none, "pct": weighted_percent(vuln_none, people)}
    }


def serialize(row: Dict[str, Any]) -> Dict[str, Any]:
    return {"testimony_ID": row.get("testimony_ID"), "entity_id": row.get("entity_id"), "recorded_datetime": row.get("recorded_datetime"), "event_datetime": row.get("event_datetime"), "region": row.get("region"), "numPersons": row.get("numPersons"), "people_weight": row.get("people_weight"), "gender": row.get("gender"), "nationality": row.get("nationality"), "legal_situation": row.get("legal_situation"), "vulnerability_types": row.get("vulnerability_types") or [], "vulnerability_status": row.get("vulnerability_status"), "general_health": row.get("general_health"), "current_Location": row.get("current_Location")}


def build_output(all_rows, filtered_rows, selected_regions, available_regions, from_dt, to_dt, dataset_min, dataset_max, input_file: Path) -> Dict[str, Any]:
    try:
        source_file = input_file.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        source_file = input_file.name
    return {
        "meta": {
            "source_file": source_file,
            "generated_at": iso_dt(datetime.now(dataset_max.tzinfo)),
            "selected_regions": list(selected_regions),
            "available_regions": list(available_regions),
            "is_region_filtered": bool(selected_regions),
            "loaded_records": len(filtered_rows),
            "total_records_in_dataset": len(all_rows),
            "dataset_min_recorded_datetime": iso_dt(dataset_min),
            "dataset_max_recorded_datetime": iso_dt(dataset_max),
            "window_from": iso_dt(from_dt),
            "window_to": iso_dt(to_dt),
            "window_days": (to_dt - from_dt).days,
            "weight_field": "numPersons",
            "frontend_filtering": "enabled_static_prototype",
            "notes": ["Unknown gender/nationality are excluded from composition charts and measured in data quality.", "None reported is not treated as a vulnerability type; it is exposed in vulnerability_status_by_people.", "No volunteer KPIs are computed because volunteer_ID is not part of the current data contract."],
        },
        "overview": compute_overview(filtered_rows),
        "breakdowns": {
            "gender_by_people": build_breakdown(filtered_rows, "gender", exclude_unknown=True),
            "nationality_by_people": build_breakdown(filtered_rows, "nationality", exclude_unknown=True),
            "legal_situation_by_people": build_breakdown(filtered_rows, "legal_situation", exclude_unknown=True),
            "vulnerability_status_by_people": vulnerability_status(filtered_rows),
            "vulnerability_types_by_people": build_vulnerability_breakdown(filtered_rows),
            "health_score_by_people": health_distribution(filtered_rows),
            "gender_by_nationality": gender_by_context(filtered_rows, "nationality"),
            "gender_by_legal_situation": gender_by_context(filtered_rows, "legal_situation"),
            "nationality_by_region": nationality_by_region(filtered_rows),
            "nationality_over_time": monthly_series(filtered_rows, from_dt, to_dt, "nationality", 5),
            "vulnerability_by_gender": vulnerability_by_gender(filtered_rows),
            "vulnerability_by_region": vulnerability_by_region(filtered_rows),
            "vulnerability_over_time": vulnerability_over_time(filtered_rows, from_dt, to_dt),
            "health_by_region": health_by_group(filtered_rows, "region", "region"),
            "health_by_gender": health_by_group(filtered_rows, "gender", "gender"),
            "health_by_nationality": health_by_group(filtered_rows, "nationality", "nationality", top_n=8),
            "health_over_time": health_over_time(filtered_rows, from_dt, to_dt),
            "data_quality_overview": data_quality_overview(filtered_rows),
            "unknown_summary": unknown_summary(filtered_rows),
        },
        "data_quality": demographics_dq(filtered_rows),
        "records_preview": [serialize(r) for r in filtered_rows[:250]],
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build demographics KPIs")
    parser.add_argument("--from-date", dest="from_date")
    parser.add_argument("--to-date", dest="to_date")
    parser.add_argument("--regions")
    parser.add_argument("--input-file", default=str(INPUT_FILE))
    parser.add_argument("--output-file", default=str(OUTPUT_FILE))
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_file = Path(args.input_file)
    raw = load_json(input_file)
    all_rows = annotate_rows(raw)
    selected_regions = normalize_regions(args.regions)
    available_regions = get_available_regions(all_rows)
    from_dt, to_dt, dataset_min, dataset_max = coerce_window(all_rows, "recorded_datetime", args.from_date, args.to_date, default_days=None, max_days=MAX_WINDOW_DAYS)
    filtered = filter_rows(all_rows, selected_regions, from_dt, to_dt)
    output = build_output(all_rows, filtered, selected_regions, available_regions, from_dt, to_dt, dataset_min, dataset_max, input_file)
    save_json(output, Path(args.output_file))
    print("Demographics KPIs built")
    print(f"Output: {args.output_file}")
    print(f"Records: {len(filtered)} / {len(all_rows)}")


if __name__ == "__main__":
    main()
