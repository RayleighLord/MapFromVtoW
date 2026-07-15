import type {
  DecompositionFocus,
  PlotBounds,
  Rational,
  Vector2,
  ViewModel,
} from "../types";
import { MAX_FINITE_MAGNITUDE, rational, rationalToNumber } from "./rational";
import { scaleVector2, vector2 } from "./vector";

export const MIN_PLOT_EXTENT = 6;
export const PLOT_PADDING_RATIO = 0.12;

export const DEFAULT_PLOT_BOUNDS: PlotBounds = Object.freeze({
  xMin: -MIN_PLOT_EXTENT,
  xMax: MIN_PLOT_EXTENT,
  yMin: -MIN_PLOT_EXTENT,
  yMax: MIN_PLOT_EXTENT,
});

function freezeBounds(extent: number): PlotBounds {
  const safeExtent = Math.max(
    MIN_PLOT_EXTENT,
    Math.min(MAX_FINITE_MAGNITUDE, extent),
  );
  return Object.freeze({
    xMin: -safeExtent,
    xMax: safeExtent,
    yMin: -safeExtent,
    yMax: safeExtent,
  });
}

export function normalizePlotBounds(bounds: PlotBounds): PlotBounds {
  const values = [bounds.xMin, bounds.xMax, bounds.yMin, bounds.yMax];
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError("Plot bounds must be finite numbers.");
  }

  const extent = Math.max(...values.map((value) => Math.abs(value)));
  return freezeBounds(extent);
}

function selectedOutput(
  viewModel: ViewModel,
  focus: DecompositionFocus,
): {
  endpoint: Vector2<Rational>;
  coordinates: Vector2<Rational> | null;
} | null {
  switch (focus) {
    case "image-e1":
      return {
        endpoint: viewModel.analysis.imageE1,
        coordinates: viewModel.analysis.imageE1Coordinates,
      };
    case "image-e2":
      return {
        endpoint: viewModel.analysis.imageE2,
        coordinates: viewModel.analysis.imageE2Coordinates,
      };
    case "image-v":
      return viewModel.vector === null
        ? null
        : {
            endpoint: viewModel.vector.image,
            coordinates: viewModel.vector.imageCoordinates,
          };
  }
}

/** All source/output arrow endpoints and currently visible component elbows. */
export function collectPlotPoints(viewModel: ViewModel): Vector2<Rational>[] {
  const points: Vector2<Rational>[] = [
    vector2(rational(0n), rational(0n)),
    viewModel.state.basisV.first,
    viewModel.state.basisV.second,
    viewModel.state.basisW.first,
    viewModel.state.basisW.second,
    viewModel.analysis.imageE1,
    viewModel.analysis.imageE2,
  ];

  if (viewModel.vector !== null) {
    points.push(viewModel.vector.source, viewModel.vector.image);
    if (viewModel.vector.sourceCoordinates !== null) {
      // The V decomposition draws the e1 component first.
      points.push(
        scaleVector2(
          viewModel.vector.sourceCoordinates.x,
          viewModel.state.basisV.first,
        ),
      );
    }
  }

  const focused = selectedOutput(viewModel, viewModel.state.focus);
  if (focused !== null && focused.coordinates !== null) {
    points.push(
      focused.endpoint,
      // The W decomposition draws the w1 component first.
      scaleVector2(focused.coordinates.x, viewModel.state.basisW.first),
    );
  }

  return points;
}

function extentForPoints(
  points: readonly Vector2<Rational>[],
  paddingRatio: number,
): number {
  if (!Number.isFinite(paddingRatio) || paddingRatio < 0) {
    throw new RangeError("Plot padding must be a finite non-negative number.");
  }

  let maximum = 0;
  for (const point of points) {
    maximum = Math.max(
      maximum,
      Math.abs(rationalToNumber(point.x)),
      Math.abs(rationalToNumber(point.y)),
    );
  }

  if (maximum === 0) {
    return MIN_PLOT_EXTENT;
  }

  const padded = maximum * (1 + paddingRatio);
  if (!Number.isFinite(padded) || padded >= MAX_FINITE_MAGNITUDE) {
    return MAX_FINITE_MAGNITUDE;
  }

  // Integer limits make axes easier to read and ensure a visible margin.
  return Math.max(MIN_PLOT_EXTENT, Math.ceil(padded));
}

export function fitPlotBounds(
  viewModel: ViewModel,
  paddingRatio = PLOT_PADDING_RATIO,
): PlotBounds {
  return freezeBounds(extentForPoints(collectPlotPoints(viewModel), paddingRatio));
}

export function expandPlotBounds(
  current: PlotBounds,
  viewModel: ViewModel,
  paddingRatio = PLOT_PADDING_RATIO,
): PlotBounds {
  const normalized = normalizePlotBounds(current);
  const fitted = fitPlotBounds(viewModel, paddingRatio);
  const currentExtent = normalized.xMax;
  const fittedExtent = fitted.xMax;

  return fittedExtent > currentExtent ? fitted : normalized;
}

export function equalPlotBounds(left: PlotBounds, right: PlotBounds): boolean {
  return (
    left.xMin === right.xMin &&
    left.xMax === right.xMax &&
    left.yMin === right.yMin &&
    left.yMax === right.yMax
  );
}
