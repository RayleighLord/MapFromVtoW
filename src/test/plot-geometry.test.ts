import type { Rational, Vector2 } from "../types";
import { describe, expect, it } from "vitest";
import {
  basisDecomposition,
  chooseIntegerTickStep,
  clientToModelPoint,
  clipSegmentToBounds,
  createCoordinateTransform,
  denseGridTicks,
  expandSymmetricBounds,
  fitSymmetricBounds,
  integerTicks,
  rationalToFiniteNumber,
  snapToIntegerGrid,
  sourceDecomposition,
} from "../plot/geometry";
import {
  formatComponentForLatex,
  formatRationalForLatex,
} from "../plot/labels";
import {
  chooseNearbyLabelCenter,
  estimateMathLabelSize,
  type LabelBox,
} from "../plot/label-layout";
import { PLOT_LAYER_PAINT_ORDER } from "../plot/svg-plane";
import {
  collectLinkedScenePoints,
  resolveFocusedDecomposition,
  resolveSourceDecomposition,
  type VPlaneScene,
  type WPlaneScene,
} from "../plot/scenes";

function rational(numerator: bigint, denominator = 1n): Rational {
  return { numerator, denominator };
}

function vector(x: bigint, y: bigint): Vector2<Rational> {
  return { x: rational(x), y: rational(y) };
}

describe("plot coordinate geometry", () => {
  it("keeps selected vector arrows in a stable foreground layer", () => {
    expect(PLOT_LAYER_PAINT_ORDER).toEqual([
      "grid",
      "axes",
      "vectors",
      "components",
      "foreground",
      "labels",
      "interaction",
    ]);

    const foregroundIndex = PLOT_LAYER_PAINT_ORDER.indexOf("foreground");
    expect(foregroundIndex).toBeGreaterThan(
      PLOT_LAYER_PAINT_ORDER.indexOf("vectors"),
    );
    expect(foregroundIndex).toBeGreaterThan(
      PLOT_LAYER_PAINT_ORDER.indexOf("components"),
    );
  });

  it("uses one isotropic scale and round-trips model points", () => {
    const transform = createCoordinateTransform(
      { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      { width: 800, height: 500 },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    const origin = transform.modelToSvg({ x: 0, y: 0 });
    const xUnit = transform.modelToSvg({ x: 1, y: 0 });
    const yUnit = transform.modelToSvg({ x: 0, y: 1 });

    expect(xUnit.x - origin.x).toBeCloseTo(transform.scale);
    expect(origin.y - yUnit.y).toBeCloseTo(transform.scale);
    expect(transform.svgToModel(transform.modelToSvg({ x: -3.25, y: 6.5 }))).toEqual({
      x: -3.25,
      y: 6.5,
    });
    expect(transform.viewport.width).toBe(500);
    expect(transform.viewport.left).toBe(150);
  });

  it("converts scaled client coordinates back to model coordinates", () => {
    const transform = createCoordinateTransform(
      { xMin: -2, xMax: 2, yMin: -2, yMax: 2 },
      { width: 400, height: 400 },
      { top: 0, right: 0, bottom: 0, left: 0 },
    );
    const model = clientToModelPoint(
      { x: 210, y: 120 },
      { left: 10, top: 20, width: 200, height: 200 },
      transform,
    );
    expect(model).toEqual({ x: 2, y: 0 });
  });

  it("produces integer grid ticks and clamps snapped selections", () => {
    const ticks = integerTicks(-8, 8);
    expect(ticks).toContain(0);
    expect(ticks.every(Number.isInteger)).toBe(true);
    expect(chooseIntegerTickStep(16)).toBeGreaterThanOrEqual(1);
    expect(
      snapToIntegerGrid(
        { x: 8.8, y: -9.2 },
        { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      ),
    ).toEqual({ x: 8, y: -8 });
    expect(snapToIntegerGrid({ x: 1.49, y: -2.51 })).toEqual({ x: 1, y: -3 });
  });

  it("adds unlabeled minor subdivisions between major grid lines", () => {
    const integerGrid = integerTicks(-4, 4);
    const denseGrid = denseGridTicks(-4, 4);

    expect(denseGrid.length).toBeGreaterThan(integerGrid.length);
    expect(denseGrid.some((tick) => tick.kind === "minor")).toBe(true);
    expect(denseGrid.some((tick) => tick.kind === "major")).toBe(true);
    expect(denseGrid).toContainEqual({ value: 0.25, kind: "minor" });
    expect(
      denseGrid
        .filter((tick) => tick.kind === "major")
        .every((tick) => Number.isInteger(tick.value)),
    ).toBe(true);
  });

  it("uses every integer as a major line in the default -6 to 6 view", () => {
    const denseGrid = denseGridTicks(-6, 6);
    const majorValues = denseGrid
      .filter((tick) => tick.kind === "major")
      .map((tick) => tick.value);

    expect(majorValues).toEqual([
      -6,
      -5,
      -4,
      -3,
      -2,
      -1,
      0,
      1,
      2,
      3,
      4,
      5,
      6,
    ]);
    expect(denseGrid).toContainEqual({ value: 0.25, kind: "minor" });
  });

  it("clips off-screen vector segments without non-finite coordinates", () => {
    const clipped = clipSegmentToBounds(
      { start: { x: -20, y: 2 }, end: { x: 20, y: 2 } },
      { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
    );
    expect(clipped).toEqual({
      start: { x: -8, y: 2 },
      end: { x: 8, y: 2 },
    });
    expect(
      clipSegmentToBounds(
        { start: { x: -20, y: 20 }, end: { x: 20, y: 20 } },
        { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      ),
    ).toBeNull();
  });
});

describe("local plot label geometry", () => {
  const viewport = {
    left: 0,
    right: 300,
    top: 0,
    bottom: 300,
    width: 300,
    height: 300,
  };

  it("reserves content-sized chip padding for endpoint and component labels", () => {
    const endpoint = estimateMathLabelSize(
      "\\vec{e}_1",
      "near-endpoint",
      300,
    );
    expect(endpoint).toEqual({
      width: 54,
      height: 38,
    });

    const longerEndpoint = estimateMathLabelSize(
      "f(\\vec{e}_1)",
      "near-endpoint",
      300,
    );
    expect(longerEndpoint).toEqual({ width: 70, height: 38 });
    expect(longerEndpoint.width).toBeGreaterThan(endpoint.width);

    const plainComponent = estimateMathLabelSize(
      "3\\vec{w}_1",
      "adaptive",
      300,
    );
    expect(plainComponent).toEqual({ width: 68, height: 42 });

    const fractionComponent = estimateMathLabelSize(
      "\\frac{3}{2}\\vec{w}_1",
      "adaptive",
      300,
    );
    expect(fractionComponent).toEqual({ width: 72, height: 48 });
    expect(fractionComponent.width).toBeGreaterThan(plainComponent.width);
    expect(fractionComponent.height).toBeGreaterThan(plainComponent.height);
  });

  it("caps collision displacement to the local search radius", () => {
    const size = estimateMathLabelSize(
      "\\frac{3}{2}\\vec{w}_1",
      "adaptive",
      viewport.width,
    );
    const occupied: LabelBox[] = [
      { centerX: 150, centerY: 150, ...size },
    ];
    const placed = chooseNearbyLabelCenter(
      { x: 150, y: 150 },
      size,
      viewport,
      occupied,
      26,
    );
    expect(Math.hypot(placed.x - 150, placed.y - 150)).toBeLessThanOrEqual(26.01);
  });

  it("keeps label boxes inside the plot viewport near an edge", () => {
    const size = { width: 80, height: 42 };
    const placed = chooseNearbyLabelCenter(
      { x: 2, y: 2 },
      size,
      viewport,
      [],
    );
    expect(placed.x - size.width / 2).toBeGreaterThanOrEqual(viewport.left);
    expect(placed.y - size.height / 2).toBeGreaterThanOrEqual(viewport.top);
  });
});

describe("plot decomposition geometry", () => {
  it("formats exact component coefficients as LaTeX fractions", () => {
    expect(formatRationalForLatex(rational(3n))).toBe("3");
    expect(formatRationalForLatex(rational(-1n, 2n))).toBe("-\\frac{1}{2}");
    expect(formatRationalForLatex(rational(1n, -4n))).toBe("-\\frac{1}{4}");
    expect(formatRationalForLatex(rational(-3n, -5n))).toBe("\\frac{3}{5}");
    expect(
      formatComponentForLatex(rational(3n, 2n), "\\vec{e}_1"),
    ).toBe("\\frac{3}{2}\\vec{e}_1");
    expect(
      formatComponentForLatex(rational(-3n, 2n), "\\vec{w}_1"),
    ).toBe("-\\frac{3}{2}\\vec{w}_1");
    expect(
      formatComponentForLatex(rational(-1n), "\\vec{w}_2"),
    ).toBe("-1\\vec{w}_2");
  });

  it("ends the standard-basis path at the input vector", () => {
    expect(sourceDecomposition({ x: 3, y: -2 })).toEqual({
      origin: { x: 0, y: 0 },
      elbow: { x: 3, y: 0 },
      end: { x: 3, y: -2 },
    });
  });

  it("ends an output-basis path at the represented vector", () => {
    const path = basisDecomposition(
      { x: 1, y: 1 },
      { x: -1, y: 1 },
      { x: 0.5, y: -0.5 },
    );
    expect(path.elbow).toEqual({ x: 0.5, y: 0.5 });
    expect(path.end).toEqual({ x: 1, y: 0 });
  });

  it("decomposes v in the chosen source basis and disables singular cases", () => {
    const scene: VPlaneScene = {
      bounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      basis: { first: vector(2n, 1n), second: vector(1n, 2n) },
      vector: vector(5n, 4n),
      vectorCoordinates: vector(2n, 1n),
    };

    const decomposition = resolveSourceDecomposition(scene);
    expect(decomposition?.path.elbow).toEqual({ x: 4, y: 2 });
    expect(decomposition?.path.end).toEqual({ x: 5, y: 4 });

    scene.vectorCoordinates = null;
    expect(resolveSourceDecomposition(scene)).toBeNull();
  });

  it("resolves each requested output decomposition and rejects unavailable coordinates", () => {
    const scene: WPlaneScene = {
      bounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      basis: { first: vector(1n, 1n), second: vector(-1n, 1n) },
      imageE1: vector(1n, 0n),
      imageE2: vector(0n, 1n),
      imageV: vector(2n, 1n),
      focus: "image-e1",
      coordinates: {
        "image-e1": { x: rational(1n, 2n), y: rational(-1n, 2n) },
        "image-e2": { x: rational(1n, 2n), y: rational(1n, 2n) },
        "image-v": { x: rational(3n, 2n), y: rational(-1n, 2n) },
      },
    };
    const cases = [
      {
        focus: "image-e1",
        elbow: { x: 0.5, y: 0.5 },
        end: { x: 1, y: 0 },
      },
      {
        focus: "image-e2",
        elbow: { x: 0.5, y: 0.5 },
        end: { x: 0, y: 1 },
      },
      {
        focus: "image-v",
        elbow: { x: 1.5, y: 1.5 },
        end: { x: 2, y: 1 },
      },
    ] as const;

    for (const focusCase of cases) {
      scene.focus = focusCase.focus;
      const focused = resolveFocusedDecomposition(scene);
      expect(focused?.key).toBe(focusCase.focus);
      expect(focused?.path.elbow).toEqual(focusCase.elbow);
      expect(focused?.path.end).toEqual(focusCase.end);

      const coordinates = scene.coordinates[focusCase.focus];
      scene.coordinates[focusCase.focus] = null;
      expect(resolveFocusedDecomposition(scene)).toBeNull();
      scene.coordinates[focusCase.focus] = coordinates;
    }
  });
});

describe("plot fitting and finite conversion", () => {
  it("uses the fixed [-6, 6] view as the minimum fitted extent", () => {
    expect(fitSymmetricBounds([])).toEqual({
      xMin: -6,
      xMax: 6,
      yMin: -6,
      yMax: 6,
    });
  });

  it("fits all linked source/output endpoints and focused elbows", () => {
    const sourceScene: VPlaneScene = {
      bounds: { xMin: -8, xMax: 8, yMin: -8, yMax: 8 },
      basis: { first: vector(1n, 1n), second: vector(-1n, 1n) },
      vector: vector(2n, 1n),
      vectorCoordinates: {
        x: rational(3n, 2n),
        y: rational(-1n, 2n),
      },
    };
    const targetScene: WPlaneScene = {
      bounds: sourceScene.bounds,
      basis: { first: vector(1n, 1n), second: vector(-1n, 1n) },
      imageE1: vector(1n, 0n),
      imageE2: vector(0n, 1n),
      imageV: vector(20n, -3n),
      focus: "image-e1",
      coordinates: {
        "image-e1": { x: rational(1n, 2n), y: rational(-1n, 2n) },
      },
    };
    const points = collectLinkedScenePoints(sourceScene, targetScene);
    expect(points).toContainEqual({ x: 1.5, y: 1.5 });
    expect(points).toContainEqual({ x: 0.5, y: 0.5 });
    expect(points).toContainEqual({ x: 20, y: -3 });
    expect(fitSymmetricBounds(points, { paddingRatio: 0.1 })).toEqual({
      xMin: -22,
      xMax: 22,
      yMin: -22,
      yMax: 22,
    });
    expect(
      expandSymmetricBounds(
        { xMin: -30, xMax: 30, yMin: -30, yMax: 30 },
        points,
      ),
    ).toEqual({ xMin: -30, xMax: 30, yMin: -30, yMax: 30 });
  });

  it("converts large ratios when finite and rejects overflowing geometry", () => {
    expect(
      rationalToFiniteNumber({
        numerator: 10n ** 400n,
        denominator: 10n ** 399n,
      }),
    ).toBe(10);
    expect(
      rationalToFiniteNumber({ numerator: 10n ** 400n, denominator: 1n }),
    ).toBeNull();
    expect(rationalToFiniteNumber({ numerator: 1n, denominator: 0n })).toBeNull();
  });
});
