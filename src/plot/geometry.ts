import type { PlotBounds, Rational, Vector2 } from "../types";

export interface PlotSize {
  width: number;
  height: number;
}

export interface PlotInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SvgPoint {
  x: number;
  y: number;
}

export interface PlotViewport {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface CoordinateTransform {
  bounds: PlotBounds;
  size: PlotSize;
  insets: PlotInsets;
  viewport: PlotViewport;
  /** Pixels per mathematical unit, shared by the x and y axes. */
  scale: number;
  modelToSvg(point: Vector2<number>): SvgPoint;
  svgToModel(point: SvgPoint): Vector2<number>;
}

export interface ClientRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface DecompositionPath {
  origin: Vector2<number>;
  elbow: Vector2<number>;
  end: Vector2<number>;
}

export interface LineSegment {
  start: Vector2<number>;
  end: Vector2<number>;
}

export interface FitOptions {
  minimumExtent?: number;
  paddingRatio?: number;
}

export interface GridTick {
  value: number;
  kind: "major" | "minor";
}

export const DEFAULT_PLOT_BOUNDS: PlotBounds = {
  xMin: -6,
  xMax: 6,
  yMin: -6,
  yMax: 6,
};

/** Keeps symmetric ranges, padding, and SVG transforms comfortably finite. */
export const MAX_PLOT_EXTENT = 1e300;

export const DEFAULT_PLOT_INSETS: PlotInsets = {
  top: 20,
  right: 20,
  bottom: 20,
  left: 20,
};

const ZERO_POINT: Vector2<number> = { x: 0, y: 0 };

function assertFinitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function isValidBounds(bounds: PlotBounds): boolean {
  return (
    Number.isFinite(bounds.xMin) &&
    Number.isFinite(bounds.xMax) &&
    Number.isFinite(bounds.yMin) &&
    Number.isFinite(bounds.yMax) &&
    bounds.xMax > bounds.xMin &&
    bounds.yMax > bounds.yMin &&
    Number.isFinite(bounds.xMax - bounds.xMin) &&
    Number.isFinite(bounds.yMax - bounds.yMin)
  );
}

/**
 * Builds an isotropic model/SVG transform. On a non-square canvas the smaller
 * axis determines the scale and the mathematical viewport is centred in the
 * remaining space.
 */
export function createCoordinateTransform(
  bounds: PlotBounds,
  size: PlotSize,
  insets: PlotInsets = DEFAULT_PLOT_INSETS,
): CoordinateTransform {
  if (!isValidBounds(bounds)) {
    throw new RangeError("Plot bounds must be finite and strictly increasing.");
  }
  assertFinitePositive(size.width, "Plot width");
  assertFinitePositive(size.height, "Plot height");

  const availableWidth = size.width - insets.left - insets.right;
  const availableHeight = size.height - insets.top - insets.bottom;
  assertFinitePositive(availableWidth, "Drawable width");
  assertFinitePositive(availableHeight, "Drawable height");

  const xRange = bounds.xMax - bounds.xMin;
  const yRange = bounds.yMax - bounds.yMin;
  const scale = Math.min(availableWidth / xRange, availableHeight / yRange);
  assertFinitePositive(scale, "Plot scale");

  const viewportWidth = xRange * scale;
  const viewportHeight = yRange * scale;
  const left = insets.left + (availableWidth - viewportWidth) / 2;
  const top = insets.top + (availableHeight - viewportHeight) / 2;
  const viewport: PlotViewport = {
    left,
    right: left + viewportWidth,
    top,
    bottom: top + viewportHeight,
    width: viewportWidth,
    height: viewportHeight,
  };

  return {
    bounds,
    size,
    insets,
    viewport,
    scale,
    modelToSvg(point) {
      return {
        x: viewport.left + (point.x - bounds.xMin) * scale,
        y: viewport.top + (bounds.yMax - point.y) * scale,
      };
    },
    svgToModel(point) {
      return {
        x: bounds.xMin + (point.x - viewport.left) / scale,
        y: bounds.yMax - (point.y - viewport.top) / scale,
      };
    },
  };
}

/** Convert a browser client coordinate into the SVG viewBox coordinate. */
export function clientToSvgPoint(
  clientPoint: SvgPoint,
  clientRect: ClientRectLike,
  svgSize: PlotSize,
): SvgPoint | null {
  if (
    !Number.isFinite(clientPoint.x) ||
    !Number.isFinite(clientPoint.y) ||
    !Number.isFinite(clientRect.left) ||
    !Number.isFinite(clientRect.top) ||
    !Number.isFinite(clientRect.width) ||
    !Number.isFinite(clientRect.height) ||
    clientRect.width <= 0 ||
    clientRect.height <= 0
  ) {
    return null;
  }

  return {
    x: ((clientPoint.x - clientRect.left) / clientRect.width) * svgSize.width,
    y: ((clientPoint.y - clientRect.top) / clientRect.height) * svgSize.height,
  };
}

export function clientToModelPoint(
  clientPoint: SvgPoint,
  clientRect: ClientRectLike,
  transform: CoordinateTransform,
): Vector2<number> | null {
  const svgPoint = clientToSvgPoint(clientPoint, clientRect, transform.size);
  return svgPoint === null ? null : transform.svgToModel(svgPoint);
}

export function isFinitePoint(point: Vector2<number>): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function isPointInBounds(
  point: Vector2<number>,
  bounds: PlotBounds,
  tolerance = 0,
): boolean {
  return (
    isFinitePoint(point) &&
    point.x >= bounds.xMin - tolerance &&
    point.x <= bounds.xMax + tolerance &&
    point.y >= bounds.yMin - tolerance &&
    point.y <= bounds.yMax + tolerance
  );
}

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/** Snap to the integer lattice, optionally clamping to visible lattice points. */
export function snapToIntegerGrid(
  point: Vector2<number>,
  bounds?: PlotBounds,
): Vector2<number> | null {
  if (!isFinitePoint(point)) {
    return null;
  }

  let x = Math.round(point.x);
  let y = Math.round(point.y);
  if (bounds !== undefined) {
    x = Math.min(Math.floor(bounds.xMax), Math.max(Math.ceil(bounds.xMin), x));
    y = Math.min(Math.floor(bounds.yMax), Math.max(Math.ceil(bounds.yMin), y));
  }
  return { x: normalizeNegativeZero(x), y: normalizeNegativeZero(y) };
}

/** Returns an integer 1/2/5 × 10^n tick spacing. */
export function chooseIntegerTickStep(range: number, targetTickCount = 12): number {
  if (!Number.isFinite(range) || range <= 0) {
    return 1;
  }
  const target = Math.max(2, Math.floor(targetTickCount));
  const roughStep = Math.max(1, range / target);
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / power;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * power;
  return Number.isSafeInteger(step) ? step : Math.max(1, step);
}

export function integerTicks(
  minimum: number,
  maximum: number,
  targetTickCount = 12,
): number[] {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum < minimum) {
    return [];
  }
  const step = chooseIntegerTickStep(maximum - minimum, targetTickCount);
  if (!Number.isFinite(step) || step <= 0) {
    return [];
  }

  const first = Math.ceil(minimum / step) * step;
  const ticks: number[] = [];
  const maximumTicks = 400;
  for (let index = 0; index < maximumTicks; index += 1) {
    const tick = first + index * step;
    if (!Number.isFinite(tick) || tick > maximum + step * 1e-9) {
      break;
    }
    ticks.push(normalizeNegativeZero(tick));
  }
  return ticks;
}

/**
 * Dense display grid with four subdivisions per major integer-scale interval.
 * Snapping remains on the integer lattice; minor lines are visual guides only.
 */
export function denseGridTicks(
  minimum: number,
  maximum: number,
  targetMajorTickCount = 12,
  subdivisions = 4,
): GridTick[] {
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    maximum < minimum ||
    !Number.isFinite(subdivisions) ||
    subdivisions < 1
  ) {
    return [];
  }

  const subdivisionCount = Math.max(1, Math.floor(subdivisions));
  const majorStep = chooseIntegerTickStep(
    maximum - minimum,
    targetMajorTickCount,
  );
  const minorStep = majorStep / subdivisionCount;
  if (!Number.isFinite(minorStep) || minorStep <= 0) {
    return [];
  }

  const firstIndex = Math.ceil(minimum / minorStep - 1e-10);
  const lastIndex = Math.floor(maximum / minorStep + 1e-10);
  const ticks: GridTick[] = [];
  const maximumTicks = 800;
  for (
    let index = firstIndex;
    index <= lastIndex && ticks.length < maximumTicks;
    index += 1
  ) {
    const rawValue = index * minorStep;
    if (!Number.isFinite(rawValue)) {
      break;
    }
    const value = normalizeNegativeZero(Number(rawValue.toPrecision(14)));
    ticks.push({
      value,
      kind: index % subdivisionCount === 0 ? "major" : "minor",
    });
  }
  return ticks;
}

export function sourceDecomposition(vector: Vector2<number>): DecompositionPath {
  return {
    origin: ZERO_POINT,
    elbow: { x: vector.x, y: 0 },
    end: { x: vector.x, y: vector.y },
  };
}

export function basisDecomposition(
  firstBasisVector: Vector2<number>,
  secondBasisVector: Vector2<number>,
  coordinates: Vector2<number>,
): DecompositionPath {
  const elbow = {
    x: coordinates.x * firstBasisVector.x,
    y: coordinates.x * firstBasisVector.y,
  };
  return {
    origin: ZERO_POINT,
    elbow,
    end: {
      x: elbow.x + coordinates.y * secondBasisVector.x,
      y: elbow.y + coordinates.y * secondBasisVector.y,
    },
  };
}

/** Liang–Barsky clipping against mathematical plot bounds. */
export function clipSegmentToBounds(
  segment: LineSegment,
  bounds: PlotBounds,
): LineSegment | null {
  if (
    !isValidBounds(bounds) ||
    !isFinitePoint(segment.start) ||
    !isFinitePoint(segment.end)
  ) {
    return null;
  }

  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  if (dx === 0 && dy === 0) {
    return isPointInBounds(segment.start, bounds) ? segment : null;
  }

  const p = [-dx, dx, -dy, dy];
  const q = [
    segment.start.x - bounds.xMin,
    bounds.xMax - segment.start.x,
    segment.start.y - bounds.yMin,
    bounds.yMax - segment.start.y,
  ];
  let entering = 0;
  let leaving = 1;

  for (let index = 0; index < 4; index += 1) {
    const direction = p[index];
    const distance = q[index];
    if (direction === undefined || distance === undefined) {
      return null;
    }
    if (direction === 0) {
      if (distance < 0) {
        return null;
      }
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) {
      entering = Math.max(entering, ratio);
    } else {
      leaving = Math.min(leaving, ratio);
    }
    if (entering > leaving) {
      return null;
    }
  }

  return {
    start: {
      x: segment.start.x + entering * dx,
      y: segment.start.y + entering * dy,
    },
    end: {
      x: segment.start.x + leaving * dx,
      y: segment.start.y + leaving * dy,
    },
  };
}

function bigintApproximation(value: bigint): { mantissa: number; exponent: number } {
  const digits = (value < 0n ? -value : value).toString();
  const significantDigits = digits.slice(0, 16);
  const divisor = 10 ** (significantDigits.length - 1);
  return {
    mantissa: Number(significantDigits) / divisor,
    exponent: digits.length - 1,
  };
}

/**
 * Converts an exact rational for display geometry without ever returning NaN
 * or Infinity. Values outside Number's finite range return null and are simply
 * omitted by renderers.
 */
export function rationalToFiniteNumber(value: Rational): number | null {
  if (value.denominator === 0n) {
    return null;
  }
  if (value.numerator === 0n) {
    return 0;
  }
  const numerator = bigintApproximation(value.numerator);
  const denominator = bigintApproximation(value.denominator);
  const sign =
    (value.numerator < 0n ? -1 : 1) * (value.denominator < 0n ? -1 : 1);
  const exponent = numerator.exponent - denominator.exponent;
  const result =
    sign * (numerator.mantissa / denominator.mantissa) * 10 ** exponent;
  return Number.isFinite(result) ? result : null;
}

export function rationalVectorToNumbers(
  vector: Vector2<Rational>,
): Vector2<number> | null {
  const x = rationalToFiniteNumber(vector.x);
  const y = rationalToFiniteNumber(vector.y);
  return x === null || y === null ? null : { x, y };
}

function extentFromBounds(bounds: PlotBounds): number {
  return Math.max(
    Math.abs(bounds.xMin),
    Math.abs(bounds.xMax),
    Math.abs(bounds.yMin),
    Math.abs(bounds.yMax),
  );
}

/** Recompute a square, origin-symmetric view for a set of scene points. */
export function fitSymmetricBounds(
  points: readonly Vector2<number>[],
  options: FitOptions = {},
): PlotBounds {
  const minimumExtent = Math.max(0.000001, options.minimumExtent ?? 6);
  const paddingRatio = Math.max(0, options.paddingRatio ?? 0.12);
  let maximumMagnitude = 0;
  for (const point of points) {
    if (isFinitePoint(point)) {
      maximumMagnitude = Math.max(
        maximumMagnitude,
        Math.abs(point.x),
        Math.abs(point.y),
      );
    }
  }
  const paddedMagnitude = maximumMagnitude * (1 + paddingRatio);
  const requiredExtent = Number.isFinite(paddedMagnitude)
    ? Math.min(MAX_PLOT_EXTENT, Math.ceil(paddedMagnitude))
    : MAX_PLOT_EXTENT;
  const extent = Math.max(
    Math.min(MAX_PLOT_EXTENT, minimumExtent),
    requiredExtent,
  );
  return { xMin: -extent, xMax: extent, yMin: -extent, yMax: extent };
}

/** Expand a linked view when needed, but never shrink the current bounds. */
export function expandSymmetricBounds(
  current: PlotBounds,
  points: readonly Vector2<number>[],
  options: FitOptions = {},
): PlotBounds {
  const fitted = fitSymmetricBounds(points, options);
  const extent = Math.max(
    isValidBounds(current) ? extentFromBounds(current) : 0,
    extentFromBounds(fitted),
  );
  return { xMin: -extent, xMax: extent, yMin: -extent, yMax: extent };
}
