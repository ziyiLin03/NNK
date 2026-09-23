"""
DjangoORMDataSource — reads from real core/models.py models:
  - FieldReport      → testimonies + events
  - ReportPosition   → positions/trajectories

KEY CONTRACT:
  - current_Location must always be {"lat": float, "lon": float} so that
    infer_region() and get_lat_lon() in kpi_utils work correctly.
    The model's ReportPosition.location_name is a free-text label for UI;
    analytics regions are derived from lat/lon bounding boxes (regions.py).
  - numPersons must be set to 0 on every position row after the first one
    within a given report. The KPI builders sum numPersons across all rows,
    so if a report with people_count=3 has 5 positions we would count 15
    instead of 3. Only the first position row carries the real count.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

Record = Dict[str, Any]


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _safe_int(value, default=1) -> int:
    try:
        return int(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def _clean_str(value, fallback="Unknown") -> str:
    if not value:
        return fallback
    s = str(value).strip()
    return fallback if s.lower() in ("", "unknown", "null", "none") else s


def _make_location(lat, lon) -> Optional[Dict[str, float]]:
    """Return {lat, lon} dict if coords are valid, else None.
    infer_region() in kpi_utils rejects anything that isn't this exact shape."""
    try:
        flat = float(lat)
        flon = float(lon)
        if -90 <= flat <= 90 and -180 <= flon <= 180:
            return {"lat": flat, "lon": flon}
    except (TypeError, ValueError):
        pass
    return None


# Map ReportPosition.category → analytics point_type
# (build_dashboards.py POINT_TYPE_LABELS keys)
_CATEGORY_TO_POINT_TYPE = {
    "pushback":    "pushback",
    "police":      "police_control",
    "medical":     "medical_need",
    "shelter":     "shelter_need",
    "food":        "shelter_need",
    "mafia":       "observation",
    "violence":    "observation",
    "robbery":     "observation",
    "extortion":   "observation",
    "safe_point":  "observation",
    "nothing":     "observation",
    "future":      "observation",
    "origin":      "observation",
    "destination": "observation",
}

# Map ReportPosition.category → location_Tag list
_CATEGORY_TO_TAGS = {
    "pushback":    ["pushback"],
    "police":      ["police", "id_check"],
    "medical":     ["medical"],
    "shelter":     ["shelter"],
    "food":        ["food"],
    "mafia":       ["violence"],
    "violence":    ["violence", "beating"],
    "robbery":     ["violence", "confiscation"],
    "extortion":   ["violence"],
    "safe_point":  [],
    "nothing":     [],
    "future":      ["movement"],
    "origin":      ["movement"],
    "destination": ["movement"],
}


class DjangoORMDataSource:
    name = "db"

    # ── Testimonies ───────────────────────────────────────────────────────────
    # One row per FieldReport. people_count is passed as-is; no duplication risk.

    def get_testimonies(self, *, from_dt=None, to_dt=None, regions=None) -> List[Record]:
        from core.models import FieldReport

        qs = (FieldReport.objects
              .filter(is_submitted=True)
              .select_related("submitted_by")
              .prefetch_related("positions"))
        if from_dt:
            qs = qs.filter(timestamp__gte=from_dt)
        if to_dt:
            qs = qs.filter(timestamp__lte=to_dt)

        # PEOPLE COUNT RULE: when multiple FieldReports share the same group_id
        # (i.e. several volunteers filed separate reports for the same group of
        # people), only the first report in the group carries the real
        # people_count. All subsequent reports in that group get numPersons=0
        # so the KPI builder does not multiply the headcount.
        seen_groups: set = set()

        records = []
        for r in qs:
            first_pos = r.positions.order_by("order").first()
            location = (
                _make_location(first_pos.latitude, first_pos.longitude)
                if first_pos else None
            )

            group_key = r.group_id if r.group_id else None
            if group_key and group_key in seen_groups:
                # Already counted this group's people — don't double-count
                num_persons = 0
            else:
                num_persons = _safe_int(r.people_count, default=1)
                if group_key:
                    seen_groups.add(group_key)

            records.append({
                "testimony_ID":        str(r.id),
                "entity_id":           _clean_str(r.group_id, fallback=str(r.id)),
                "recorded_datetime":   _iso(r.timestamp),
                "event_datetime":      _iso(r.hora_evento or r.timestamp),
                "timezone":            r.timezone or "Europe/Madrid",
                "current_Location":    location,
                "numPersons":          num_persons,
                "gender":              _clean_str(r.gender),
                "nationality":         _clean_str(r.nationality),
                "vulnerability_types": _clean_str(r.vulnerability_type, fallback=""),
                "legal_situation":     _clean_str(r.legal_situation,    fallback=""),
                "general_health":      None,
            })
        return records

    # ── Events ────────────────────────────────────────────────────────────────
    # One row per ReportPosition (or one fallback row for reports with no positions).
    #
    # PEOPLE COUNT RULE: numPersons is only non-zero on the FIRST position row of
    # each report. All subsequent rows for the same report carry numPersons=0.
    # This prevents the KPI builder from summing people_count × num_positions.

    def get_events(self, *, from_dt=None, to_dt=None, regions=None) -> List[Record]:
        from core.models import FieldReport

        qs = (FieldReport.objects
              .filter(is_submitted=True)
              .prefetch_related("positions"))
        if from_dt:
            qs = qs.filter(timestamp__gte=from_dt)
        if to_dt:
            qs = qs.filter(timestamp__lte=to_dt)

        records = []
        for r in qs:
            positions = list(r.positions.order_by("order"))
            num_persons = _safe_int(r.people_count, default=1)

            if not positions:
                records.append({
                    "event_datetime":    _iso(r.timestamp),
                    "recorded_datetime": _iso(r.timestamp),
                    "timezone":          r.timezone or "Europe/Madrid",
                    "current_Location":  None,
                    "location_Tag":      [],
                    "numPersons":        num_persons,
                    "point_type":        "unknown",
                })
            else:
                for idx, pos in enumerate(positions):
                    cat = (pos.category or "").lower()
                    records.append({
                        "event_datetime":    _iso(r.hora_evento or r.timestamp),
                        "recorded_datetime": _iso(r.timestamp),
                        "timezone":          r.timezone or "Europe/Madrid",
                        "current_Location":  _make_location(pos.latitude, pos.longitude),
                        "location_Tag":      _CATEGORY_TO_TAGS.get(cat, []),
                        # Only the first position carries the people count.
                        # The rest are 0 so the KPI builder doesn't multiply.
                        "numPersons":        num_persons if idx == 0 else 0,
                        "point_type":        _CATEGORY_TO_POINT_TYPE.get(cat, "observation"),
                    })
        return records

    # ── Trajectories ──────────────────────────────────────────────────────────
    # Same people-count rule: only the first position row in each report
    # carries the real numPersons; the rest are 0.

    def get_trajectories(self, *, from_dt=None, to_dt=None, regions=None) -> List[Record]:
        from core.models import FieldReport

        qs = (FieldReport.objects
              .filter(is_submitted=True)
              .prefetch_related("positions"))
        if from_dt:
            qs = qs.filter(timestamp__gte=from_dt)
        if to_dt:
            qs = qs.filter(timestamp__lte=to_dt)

        records = []
        for r in qs:
            entity_id   = _clean_str(r.group_id, fallback=str(r.id))
            num_persons = _safe_int(r.people_count, default=1)

            for idx, pos in enumerate(r.positions.order_by("order")):
                records.append({
                    "entity_id":        entity_id,
                    "sequence_index":   pos.order,
                    "current_Location": _make_location(pos.latitude, pos.longitude),
                    # Only first position carries the count
                    "numPersons":       num_persons if idx == 0 else 0,
                    "event_datetime":   _iso(pos.passed_at or r.timestamp),
                    "latitude":         float(pos.latitude),
                    "longitude":        float(pos.longitude),
                    "category":         pos.category or "unknown",
                })
        return records

    # ── Metadata ──────────────────────────────────────────────────────────────

    def get_metadata(self) -> Dict[str, Any]:
        from core.models import FieldReport, ReportPosition
        import sys
        from pathlib import Path

        _kpi = Path(__file__).resolve().parent
        if str(_kpi) not in sys.path:
            sys.path.insert(0, str(_kpi))
        from kpi_utils import infer_region, iso_dt, parse_dt, to_utc  # type: ignore

        qs = FieldReport.objects.filter(is_submitted=True)
        count = qs.count()

        dates = []
        for ts in qs.values_list("timestamp", flat=True):
            dt = parse_dt(_iso(ts))
            if dt:
                dates.append(to_utc(dt))

        # Regions are derived from lat/lon bounding boxes (see regions.py),
        # NOT from ReportPosition.location_name (that's a free-text UI label).
        regions = set()
        for lat, lon in ReportPosition.objects.filter(
            report__is_submitted=True
        ).values_list("latitude", "longitude"):
            loc = _make_location(lat, lon)
            if loc:
                region = infer_region(loc)
                if region and region != "Unknown":
                    regions.add(region)

        dataset_min = min(dates) if dates else None
        dataset_max = max(dates) if dates else None

        return {
            "meta": {
                "data_source": self.name,
                "dataset_min": iso_dt(dataset_min) if dataset_min else None,
                "dataset_max": iso_dt(dataset_max) if dataset_max else None,
                "dataset_min_recorded_datetime": iso_dt(dataset_min) if dataset_min else None,
                "dataset_max_recorded_datetime": iso_dt(dataset_max) if dataset_max else None,
                "available_regions": sorted(regions),
            },
            "counts": {
                "testimonies":  count,
                "events":       count,
                "trajectories": ReportPosition.objects.filter(
                    report__is_submitted=True
                ).count(),
            },
        }