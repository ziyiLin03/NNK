"""Data source abstraction for HFO Analytics.

The KPI builders should not care whether records come from the current mock JSON
files or from the future project database. This module centralizes that boundary.

Current runtime default:
    HFO_DATA_SOURCE=json

Future integration target:
    HFO_DATA_SOURCE=db

The database source is intentionally a stub for now. The application/backend team
can implement the query methods without changing dashboard JavaScript or KPI
calculation modules.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, NoReturn, Optional

from kpi_utils import infer_region, iso_dt, load_json, parse_dt, to_utc


Record = Dict[str, Any]


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA_SOURCE = "json"

import os, sys
from pathlib import Path
_ANALYTICS_APP = Path(__file__).resolve().parents[2]  # sube a analytics/
if str(_ANALYTICS_APP) not in sys.path:
    sys.path.insert(0, str(_ANALYTICS_APP))


class DataSourceError(RuntimeError):
    """Raised when the configured data source cannot serve analytics data."""


class AnalyticsDataSource(ABC):
    """Common interface used by the analytics API.

    The optional arguments are reserved for the future database implementation.
    The current JSON implementation returns the full mock datasets because the
    existing KPI code applies filtering after loading records.
    """

    name: str

    @abstractmethod
    def get_testimonies(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        """Return testimony records using the current project field contract."""

    @abstractmethod
    def get_events(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        """Return event/incident records using the current project field contract."""

    @abstractmethod
    def get_trajectories(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        """Return trajectory records using the current project field contract."""

    @abstractmethod
    def get_metadata(self) -> Dict[str, Any]:
        """Return dataset bounds and counts used by the initial analysis window."""


class JsonDataSource(AnalyticsDataSource):
    """Data source backed by data_mock/*.json files."""

    name = "json"

    def __init__(self, project_root: Path = PROJECT_ROOT):
        self.project_root = project_root
        self.data_dir = project_root / "data_mock"

    @staticmethod
    @lru_cache(maxsize=8)
    def _load_file(path_text: str) -> List[Record]:
        path = Path(path_text)
        data = load_json(path)
        if not isinstance(data, list):
            raise DataSourceError(f"Expected list records in {path}")
        return data

    def _load(self, filename: str) -> List[Record]:
        # Return a shallow copy so callers can annotate rows without mutating the
        # cached object itself.
        return list(self._load_file(str(self.data_dir / filename)))

    def get_testimonies(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._load("testimonies.json")

    def get_events(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._load("events.json")

    def get_trajectories(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._load("trajectories.json")

    @staticmethod
    def _date_values(rows: List[Record], *fields: str) -> List[Any]:
        values = []
        for row in rows:
            for field in fields:
                dt = parse_dt(row.get(field))
                if dt is not None:
                    values.append(to_utc(dt))
        return values

    @staticmethod
    def _regions_from(rows: List[Record]) -> List[str]:
        regions = {infer_region(row) for row in rows}
        return sorted(region for region in regions if region and region != "Unknown")

    def get_metadata(self) -> Dict[str, Any]:
        testimonies = self.get_testimonies()
        events = self.get_events()
        trajectories = self.get_trajectories()

        date_values = []
        date_values.extend(self._date_values(testimonies, "recorded_datetime", "event_datetime"))
        date_values.extend(self._date_values(events, "recorded_datetime", "event_datetime"))
        date_values.extend(self._date_values(trajectories, "event_datetime"))

        if not date_values:
            raise DataSourceError("No valid datetime values found in the configured data source.")

        dataset_min = min(date_values)
        dataset_max = max(date_values)
        all_regions = set()
        all_regions.update(self._regions_from(testimonies))
        all_regions.update(self._regions_from(events))
        all_regions.update(self._regions_from(trajectories))

        return {
            "meta": {
                "data_source": self.name,
                "dataset_min": iso_dt(dataset_min),
                "dataset_max": iso_dt(dataset_max),
                "dataset_min_recorded_datetime": iso_dt(dataset_min),
                "dataset_max_recorded_datetime": iso_dt(dataset_max),
                "available_regions": sorted(all_regions),
            },
            "counts": {
                "testimonies": len(testimonies),
                "events": len(events),
                "trajectories": len(trajectories),
            },
        }


class DatabaseDataSource(AnalyticsDataSource):
    """Prepared database integration point.

    Implement this class when the database schema/API is ready. Each method must
    return dictionaries with the same field names currently used by the project:
    testimony_ID, entity_id, event_datetime, recorded_datetime, timezone,
    current_Location, location_Tag, point_type, numPersons, sequence_index,
    gender, nationality, vulnerability_types and general_health.
    """

    name = "db"

    def __init__(self) -> None:
        self.database_url = os.getenv("HFO_DATABASE_URL")

    def _not_ready(self) -> NoReturn:
        raise DataSourceError(
            "HFO_DATA_SOURCE=db was selected, but DatabaseDataSource is not implemented yet. "
            "Use HFO_DATA_SOURCE=json for the current mock-data prototype."
        )

    def get_testimonies(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._not_ready()

    def get_events(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._not_ready()

    def get_trajectories(self, *, from_dt: Any = None, to_dt: Any = None, regions: Optional[List[str]] = None) -> List[Record]:
        return self._not_ready()

    def get_metadata(self) -> Dict[str, Any]:
        return self._not_ready()

@lru_cache(maxsize=1)
def get_data_source() -> AnalyticsDataSource:
    source = os.getenv("HFO_DATA_SOURCE", DEFAULT_DATA_SOURCE).strip().lower()
    if source in {"json", "mock", "local"}:
        return JsonDataSource(PROJECT_ROOT)
    if source in {"db", "database", "postgres", "postgresql"}:
        from db_source import DjangoORMDataSource  # type: ignore
        return DjangoORMDataSource()
    raise DataSourceError(
        f"Unsupported HFO_DATA_SOURCE={source!r}. Valid values are 'json' and 'db'."
    )
