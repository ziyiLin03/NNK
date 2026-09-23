import {useCallback, useMemo, useState} from "react";
import DeckGL from "@deck.gl/react";
import {ScatterplotLayer} from "@deck.gl/layers";
import MapView from "react-map-gl/maplibre";
import {
  ControlsPanel,
  focusViewOnPoints,
  INITIAL_VIEW_STATE,
  loadedRangeLabel,
  MAP_STYLE,
  PointDetails,
  useDateAndCategoryFilters,
  useReportPoints,
} from "./MapCommon.jsx";

export default function EventMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const {points, loadedDateRange, loading, error, loadReports} = useReportPoints();
  const filters = useDateAndCategoryFilters(points, loadedDateRange, 30);

  const reload = useCallback(() => {
    loadReports({from: filters.dateStart, to: filters.dateEnd}, {
      focus: true,
      onFocus: (nextPoints) => setViewState(focusViewOnPoints(nextPoints)),
    });
  }, [filters.dateEnd, filters.dateStart, loadReports]);

  const stats = useMemo(() => {
    const reports = new Set(filters.filteredPoints.map((point) => point.testimonyId ?? point.entityId)).size;
    const people = filters.filteredPoints.reduce((sum, point) => sum + (point.numPersons ?? point.numPers ?? 0), 0);
    return [
      {label: "Points", value: filters.filteredPoints.length},
      {label: "Reports", value: reports},
      {label: "Max Density", value: people},
    ];
  }, [filters.filteredPoints]);

  const layers = useMemo(() => [
    new ScatterplotLayer({
      id: "events",
      data: filters.filteredPoints,
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      getPosition: (point) => point.position,
      getRadius: 7,
      getFillColor: (point) => point.color,
      getLineColor: [17, 24, 39, 210],
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      onClick: ({object}) => {
        setSelectedPoint(object ?? null);
        return true;
      },
    }),
  ], [filters.filteredPoints]);

  return (
    <main className="hfo-map-page">
      <DeckGL
        controller
        layers={layers}
        viewState={viewState}
        onViewStateChange={({viewState: nextViewState}) => setViewState(nextViewState)}
        getCursor={({isDragging, isHovering}) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab")}
      >
        <MapView mapStyle={MAP_STYLE} reuseMaps />
      </DeckGL>

      <ControlsPanel
        title="Event map"
        subtitle={`Backend reports with positions. Loaded ${loadedRangeLabel(loadedDateRange)}.`}
        filters={filters}
        stats={stats}
        loading={loading}
        error={error}
        onReload={reload}
      />
      <PointDetails item={selectedPoint} onClose={() => setSelectedPoint(null)} />
    </main>
  );
}
