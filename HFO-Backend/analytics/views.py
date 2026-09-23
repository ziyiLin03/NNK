"""
Analytics API views — wraps hfo-analytics KPI builders as Django endpoints.

Endpoints (all GET, same query params as the original api_server.py):
    /api/analytics/meta
    /api/analytics/operational-kpis
    /api/analytics/demographics-kpis
    /api/analytics/incident-needs
    /api/analytics/data-quality
    /api/analytics/mobility-route
"""

import sys
from pathlib import Path

from django.http import JsonResponse
from django.views import View

from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
    
# ── Make the analytics backend importable ────────────────────────────────────
ANALYTICS_BACKEND = Path(__file__).resolve().parent / "kpi"
if str(ANALYTICS_BACKEND) not in sys.path:
    sys.path.insert(0, str(ANALYTICS_BACKEND))

import build_dashboards as dashboards # type: ignore
import build_demographics_kpis as demographics # type: ignore
import build_operational_kpis as operational # type: ignore
from kpi_utils import coerce_window, iso_dt, normalize_regions # type: ignore

# Al inicio del fichero, junto a los otros imports
DATA_MOCK = Path(__file__).resolve().parents[2] / "data_mock"

class DemographicsKpisView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            raw = source.get_testimonies()
            all_rows = demographics.annotate_rows(raw)
            regions = _regions(request)
            available = demographics.get_available_regions(all_rows)
            from_dt, to_dt, dataset_min, dataset_max = coerce_window(
                all_rows, "recorded_datetime",
                _p(request, "from"), _p(request, "to"),
                default_days=30, max_days=demographics.MAX_WINDOW_DAYS,
            )
            filtered = demographics.filter_rows(all_rows, regions, from_dt, to_dt)
            # build_output() requires input_file as a positional Path argument
            # (used only for the source_file metadata label)
            input_file = DATA_MOCK / "testimonies.json"
            data = demographics.build_output(
                all_rows, filtered, regions, available,
                from_dt, to_dt, dataset_min, dataset_max,
                input_file,
            )
            return _json(data)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

# ── Helpers ───────────────────────────────────────────────────────────────────

def _p(request, name, default=None):
    """Get a single query param, stripped."""
    v = request.GET.get(name, default)
    return v.strip() if isinstance(v, str) else default


def _regions(request):
    return normalize_regions(_p(request, "regions"))


def _parse_dt(value):
    if not value:
        return None
    from datetime import datetime, timezone
    # "+" in URLs is decoded as space by some clients; restore it
    raw = value.strip().replace(" ", "+").replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        # Truncate to seconds and force UTC
        raw = raw[:19] + "+00:00"
        dt = datetime.fromisoformat(raw)
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _from_to(request):
    return _parse_dt(_p(request, "from")), _parse_dt(_p(request, "to"))


def _max_points(request, default=120):
    try:
        return int(_p(request, "max_points", str(default)))
    except (TypeError, ValueError):
        return default


def _granularity(request, default="week"):
    return _p(request, "granularity", default) or default


def _cors(response):
    response["Access-Control-Allow-Origin"] = "*"
    return response


def _json(data, status=200):
    return _cors(JsonResponse(data, status=status, safe=False))


def _get_source():
    """Return the configured analytics data source (json or db)."""
    from data_source import get_data_source # type: ignore
    return get_data_source()


# ── Views ─────────────────────────────────────────────────────────────────────

class AnalyticsMetaView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            meta = source.get_metadata()
            from_dt, to_dt = _from_to(request)
            meta["window_from"] = iso_dt(from_dt) if from_dt else None
            meta["window_to"] = iso_dt(to_dt) if to_dt else None
            meta["dashboard"] = "analytics_meta"
            return _json(meta)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

    def options(self, request, *args, **kwargs):
        r = _cors(JsonResponse({}))
        r["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        r["Access-Control-Allow-Headers"] = "Accept, Authorization"
        return r


class OperationalKpisView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            raw = source.get_testimonies()
            all_rows = operational.annotate_rows(raw)
            regions = _regions(request)
            available = operational.get_available_regions(all_rows)
            from_dt, to_dt, dataset_min, dataset_max = coerce_window(
                all_rows, "recorded_datetime",
                _p(request, "from"), _p(request, "to"),
                default_days=30, max_days=operational.MAX_WINDOW_DAYS,
            )
            filtered = operational.filter_rows(all_rows, regions, from_dt, to_dt)
            max_points = _max_points(request, operational.DEFAULT_MAX_POINTS)
            gran = operational.choose_granularity(
                from_dt, to_dt,
                _p(request, "granularity", "auto") or "auto",
                max_points,
            )
            data = operational.build_output(
                all_rows, filtered, regions, available,
                from_dt, to_dt, dataset_min, dataset_max, gran, max_points,
            )
            return _json(data)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

    def options(self, request, *args, **kwargs):
        r = _cors(JsonResponse({}))
        r["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return r

class IncidentNeedsView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            raw = source.get_events()
            from_dt, to_dt = _from_to(request)
            data = dashboards.build_dashboard_02_output(
                raw, _regions(request), from_dt, to_dt,
                _granularity(request, "week"), _max_points(request),
            )
            return _json(data)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

    def options(self, request, *args, **kwargs):
        r = _cors(JsonResponse({}))
        r["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return r


class DataQualityView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            raw = source.get_events()
            from_dt, to_dt = _from_to(request)
            data = dashboards.build_dashboard_03_output(
                raw, _regions(request), from_dt, to_dt,
                _granularity(request, "week"), _max_points(request),
            )
            return _json(data)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

    def options(self, request, *args, **kwargs):
        r = _cors(JsonResponse({}))
        r["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return r


class MobilityRouteView(View):
    permission_classes = [AllowAny]
    def get(self, request):
        try:
            source = _get_source()
            raw = source.get_trajectories()
            from_dt, to_dt = _from_to(request)
            data = dashboards.build_dashboard_04_output(
                raw, _regions(request), from_dt, to_dt,
                _granularity(request, "week"), _max_points(request),
            )
            return _json(data)
        except Exception as exc:
            return _json({"error": type(exc).__name__, "message": str(exc)}, 500)

    def options(self, request, *args, **kwargs):
        r = _cors(JsonResponse({}))
        r["Access-Control-Allow-Methods"] = "GET, OPTIONS"
        return r