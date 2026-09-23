import {useCallback, useMemo, useState} from "react";
import DeckGL from "@deck.gl/react";
import {IconLayer, LineLayer, ScatterplotLayer} from "@deck.gl/layers";
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

const ARROW_ICON = {
  url: "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'><polygon points='20,20 100,60 20,100 40,60' fill='%2317202a'/></svg>",
  width: 120,
  height: 120,
  anchorY: 60,
};

function getBearingDegrees(from, to) {
  const deltaX = to[0] - from[0];
  const deltaY = to[1] - from[1];
  return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
}

function getMidpoint(from, to) {
  return [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
}

function buildRouteSegments(points) {
  const grouped = new Map();
  for (const point of points) {
    const key = point.groupId ?? point.entityId;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(point);
  }

  const segments = [];
  for (const [routeId, routePoints] of grouped) {
    const ordered = routePoints
      .slice()
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return (left.timeTimestamp ?? 0) - (right.timeTimestamp ?? 0);
      });

    for (let index = 1; index < ordered.length; index += 1) {
      const from = ordered[index - 1];
      const to = ordered[index];
      segments.push({
        id: `${routeId}:${index}`,
        routeId,
        from,
        to,
        sourcePosition: from.position,
        targetPosition: to.position,
        midpoint: getMidpoint(from.position, to.position),
        bearing: getBearingDegrees(from.position, to.position),
        weight: Math.max(from.weight ?? 1, to.weight ?? 1),
      });
    }
  }
  return segments;
}

export default function RouteFlowMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedItem, setSelectedItem] = useState(null);
  const {points, loadedDateRange, loading, error, loadReports} = useReportPoints();
  const filters = useDateAndCategoryFilters(points, loadedDateRange, 90);
  const segments = useMemo(() => buildRouteSegments(filters.filteredPoints), [filters.filteredPoints]);

  const reload = useCallback(() => {
    loadReports({from: filters.dateStart, to: filters.dateEnd}, {
      focus: true,
      onFocus: (nextPoints) => setViewState(focusViewOnPoints(nextPoints)),
    });
  }, [filters.dateEnd, filters.dateStart, loadReports]);

  const stats = useMemo(() => [
    {label: "Points", value: filters.filteredPoints.length},
    {label: "Routes", value: new Set(filters.filteredPoints.map((point) => point.groupId ?? point.entityId)).size},
    {label: "Links", value: segments.length},
  ], [filters.filteredPoints, segments.length]);

  const layers = useMemo(() => [
    new LineLayer({
      id: "route-lines",
      data: segments,
      pickable: true,
      getSourcePosition: (segment) => segment.sourcePosition,
      getTargetPosition: (segment) => segment.targetPosition,
      getColor: (segment) => [24, 96, 171, Math.min(230, 90 + (segment.weight * 18))],
      getWidth: (segment) => Math.min(12, 2 + segment.weight),
      widthUnits: "pixels",
      onClick: ({object}) => {
        setSelectedItem(object ? {point: object.to, segment: object} : null);
        return true;
      },
    }),
    new IconLayer({
      id: "route-arrows",
      data: segments,
      pickable: false,
      iconAtlas: null,
      getIcon: () => ARROW_ICON,
      getPosition: (segment) => segment.midpoint,
      getAngle: (segment) => -segment.bearing,
      getSize: 18,
      sizeUnits: "pixels",
      getColor: [23, 32, 42, 210],
    }),
    new ScatterplotLayer({
      id: "route-points",
      data: filters.filteredPoints,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: (point) => point.position,
      getRadius: 5,
      getFillColor: (point) => point.color,
      getLineColor: [255, 255, 255, 230],
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      onClick: ({object}) => {
        setSelectedItem(object ?? null);
        return true;
      },
    }),
  ], [filters.filteredPoints, segments]);

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
        title="Route map"
        subtitle={`Report routes from backend positions. Loaded ${loadedRangeLabel(loadedDateRange)}.`}
        filters={filters}
        stats={stats}
        loading={loading}
        error={error}
        onReload={reload}
      />
      <PointDetails item={selectedItem} title={selectedItem?.segment ? "Route point" : "Point details"} onClose={() => setSelectedItem(null)} />
    </main>
  );
}
