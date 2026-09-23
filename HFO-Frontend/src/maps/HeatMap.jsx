import {useCallback, useMemo, useState} from "react";
import DeckGL from "@deck.gl/react";
import {BitmapLayer, ScatterplotLayer} from "@deck.gl/layers";
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

const WORLD_ORIGIN_SHIFT = 20037508.34;
const TURBO_STOPS = [
  [48, 18, 59],
  [54, 92, 190],
  [31, 144, 140],
  [50, 185, 105],
  [235, 226, 54],
  [248, 169, 35],
  [122, 4, 3],
];

function lngLatToMeters([longitude, latitude]) {
  const x = longitude * WORLD_ORIGIN_SHIFT / 180;
  let y = Math.log(Math.tan((90 + latitude) * Math.PI / 360)) / (Math.PI / 180);
  y = y * WORLD_ORIGIN_SHIFT / 180;
  return [x, y];
}

function metersToLngLat([x, y]) {
  const longitude = (x / WORLD_ORIGIN_SHIFT) * 180;
  const latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((y / WORLD_ORIGIN_SHIFT) * Math.PI)) - (Math.PI / 2));
  return [longitude, latitude];
}

function colorForIntensity(value) {
  const clamped = Math.max(0, Math.min(1, value));
  const scaled = clamped * (TURBO_STOPS.length - 1);
  const index = Math.min(TURBO_STOPS.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const left = TURBO_STOPS[index];
  const right = TURBO_STOPS[index + 1];
  return [
    Math.round(left[0] + ((right[0] - left[0]) * t)),
    Math.round(left[1] + ((right[1] - left[1]) * t)),
    Math.round(left[2] + ((right[2] - left[2]) * t)),
    Math.round(210 * clamped),
  ];
}

function buildHeatmap(points) {
  if (points.length === 0 || typeof document === "undefined") return null;

  const projected = points
    .map(point => ({point, meters: lngLatToMeters(point.position)}))
    .filter(e => Number.isFinite(e.meters[0]) && Number.isFinite(e.meters[1]));

  if (projected.length === 0) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const entry of projected) {
    if (entry.meters[0] < minX) minX = entry.meters[0];
    if (entry.meters[0] > maxX) maxX = entry.meters[0];
    if (entry.meters[1] < minY) minY = entry.meters[1];
    if (entry.meters[1] > maxY) maxY = entry.meters[1];
  }

  const padding = Math.max(maxX - minX, maxY - minY) * 0.10;
  const bounds = {
    minX: minX - padding, maxX: maxX + padding,
    minY: minY - padding, maxY: maxY + padding,
  };

  const width = 512;
  const height = 512;
  const density = new Float32Array(width * height);

  const xSpanMeters = bounds.maxX - bounds.minX;
  const ySpanMeters = bounds.maxY - bounds.minY;
  const metersPerPixelX = xSpanMeters / width;
  const metersPerPixelY = ySpanMeters / height;

  const targetRadiusMeters = 200000; // 600km
  const sigmaX = targetRadiusMeters / metersPerPixelX;
  const sigmaY = targetRadiusMeters / metersPerPixelY;

  // FIX 1: Define separate pixel radii for X and Y loops to prevent vertical clipping
  const radiusX = Math.ceil(sigmaX * 3);
  const radiusY = Math.ceil(sigmaY * 3);
  
  const varX = 2 * sigmaX * sigmaX;
  const varY = 2 * sigmaY * sigmaY;

  for (const entry of projected) {
    // FIX 2: Scale by full width/height instead of width-1 to fix sub-pixel shifts
    const cx = ((entry.meters[0] - bounds.minX) / xSpanMeters) * width;
    const cy = (1 - ((entry.meters[1] - bounds.minY) / ySpanMeters)) * height;
    
    const minCellX = Math.max(0, Math.floor(cx - radiusX));
    const maxCellX = Math.min(width - 1, Math.ceil(cx + radiusX));
    const minCellY = Math.max(0, Math.floor(cy - radiusY));
    const maxCellY = Math.min(height - 1, Math.ceil(cy + radiusY));
    
    for (let y = minCellY; y <= maxCellY; y++) {
      for (let x = minCellX; x <= maxCellX; x++) {
        const dx = x - cx, dy = y - cy;
        density[(y * width) + x] += Math.min(
          Math.exp(-((dx * dx) / varX) - ((dy * dy) / varY)) * (entry.point.weight ?? 1),
          0.3
        );
      }
    }
  }

  let maxDensity = 0;
  for (const value of density) {
    maxDensity = Math.max(maxDensity, value);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  
  for (let index = 0; index < density.length; index++) {
    const intensity = maxDensity > 0 ? density[index] / maxDensity : 0;
    if (intensity < 0.002) {
      image.data[index * 4 + 3] = 0;
      continue;
    }
    const [red, green, blue, alpha] = colorForIntensity(intensity);
    image.data[index * 4]     = red;
    image.data[index * 4 + 1] = green;
    image.data[index * 4 + 2] = blue;
    
    const smoothAlpha = alpha * Math.pow(intensity, 0.4);
    image.data[index * 4 + 3] = Math.round(smoothAlpha);
  }
  context.putImageData(image, 0, 0);

  return {
    image: canvas,
    bounds: [
      metersToLngLat([bounds.minX, bounds.minY])[0],  // west
      metersToLngLat([bounds.minX, bounds.minY])[1],  // south  
      metersToLngLat([bounds.maxX, bounds.maxY])[0],  // east
      metersToLngLat([bounds.maxX, bounds.maxY])[1],  // north
    ],
  };
}

export default function HeatMap() {
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [selectedPoint, setSelectedPoint] = useState(null);
  const {points, loadedDateRange, loading, error, loadReports} = useReportPoints();
  const filters = useDateAndCategoryFilters(points, loadedDateRange, 30);
  const heatmap = useMemo(() => buildHeatmap(filters.filteredPoints), [filters.filteredPoints]);

  const reload = useCallback(() => {
    loadReports({from: filters.dateStart, to: filters.dateEnd}, {
      focus: true,
      onFocus: (nextPoints) => setViewState(focusViewOnPoints(nextPoints)),
    });
  }, [filters.dateEnd, filters.dateStart, loadReports]);

  const stats = useMemo(() => [
    {label: "Points", value: filters.filteredPoints.length},
    {label: "Reports", value: new Set(filters.filteredPoints.map((point) => point.testimonyId ?? point.entityId)).size},
    {label: "Max Density", value: filters.filteredPoints.reduce((sum, point) => sum + point.weight, 0)},
  ], [filters.filteredPoints]);

  const layers = useMemo(() => [
    heatmap ? new BitmapLayer({
      id: "heat-raster",
      image: heatmap.image,
      bounds: heatmap.bounds,
      opacity: 0.78,
    }) : null,
    new ScatterplotLayer({
      id: "heat-points",
      data: filters.filteredPoints,
      pickable: true,
      radiusUnits: "pixels",
      getPosition: (point) => point.position,
      getRadius: 4,
      getFillColor: (point) => [point.color[0], point.color[1], point.color[2], 175],
      getLineColor: [255, 255, 255, 210],
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      onClick: ({object}) => {
        setSelectedPoint(object ?? null);
        return true;
      },
    }),
  ].filter(Boolean), [filters.filteredPoints, heatmap]);

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
        title="Heat map"
        subtitle={`Density from backend report positions. Loaded ${loadedRangeLabel(loadedDateRange)}.`}
        filters={filters}
        stats={stats}
        loading={loading}
        error={error}
        onReload={reload}
        extra={<div className="hfo-map-status"><div className="hfo-map-gradient" /></div>}
      />
      <PointDetails item={selectedPoint} onClose={() => setSelectedPoint(null)} />
    </main>
  );
}
