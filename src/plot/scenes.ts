import type {
  BasisV,
  BasisW,
  DecompositionFocus,
  PlotBounds,
  Rational,
  Vector2,
  ViewModel,
} from "../types";
import {
  basisDecomposition,
  rationalVectorToNumbers,
  type DecompositionPath,
} from "./geometry";

export interface VPlaneScene {
  bounds: PlotBounds;
  basis: BasisV;
  vector: Vector2<Rational> | null;
  vectorCoordinates: Vector2<Rational> | null;
}

export type WDecompositionCoordinates = Partial<
  Record<DecompositionFocus, Vector2<Rational> | null>
>;

export interface WPlaneScene {
  bounds: PlotBounds;
  basis: BasisW;
  imageE1: Vector2<Rational>;
  imageE2: Vector2<Rational>;
  imageV: Vector2<Rational> | null;
  focus: DecompositionFocus;
  coordinates: WDecompositionCoordinates;
}

export interface FocusedDecomposition {
  key: DecompositionFocus;
  target: Vector2<number>;
  coordinates: Vector2<number>;
  path: DecompositionPath;
}

export interface SourceDecomposition {
  target: Vector2<number>;
  coordinates: Vector2<number>;
  path: DecompositionPath;
}

export function vPlaneSceneFromViewModel(viewModel: ViewModel): VPlaneScene {
  return {
    bounds: viewModel.state.bounds,
    basis: viewModel.state.basisV,
    vector: viewModel.state.selectedVector,
    vectorCoordinates: viewModel.vector?.sourceCoordinates ?? null,
  };
}

export function wPlaneSceneFromViewModel(viewModel: ViewModel): WPlaneScene {
  return {
    bounds: viewModel.state.bounds,
    basis: viewModel.state.basisW,
    imageE1: viewModel.analysis.imageE1,
    imageE2: viewModel.analysis.imageE2,
    imageV: viewModel.vector?.image ?? null,
    focus: viewModel.state.focus,
    coordinates: {
      "image-e1": viewModel.analysis.imageE1Coordinates,
      "image-e2": viewModel.analysis.imageE2Coordinates,
      "image-v": viewModel.vector?.imageCoordinates ?? null,
    },
  };
}

export function selectedImage(scene: WPlaneScene): Vector2<Rational> | null {
  switch (scene.focus) {
    case "image-e1":
      return scene.imageE1;
    case "image-e2":
      return scene.imageE2;
    case "image-v":
      return scene.imageV;
  }
}

export function resolveFocusedDecomposition(
  scene: WPlaneScene,
): FocusedDecomposition | null {
  const targetRational = selectedImage(scene);
  const coordinateRational = scene.coordinates[scene.focus] ?? null;
  const firstBasisVector = rationalVectorToNumbers(scene.basis.first);
  const secondBasisVector = rationalVectorToNumbers(scene.basis.second);
  const target =
    targetRational === null ? null : rationalVectorToNumbers(targetRational);
  const coordinates =
    coordinateRational === null
      ? null
      : rationalVectorToNumbers(coordinateRational);
  if (
    target === null ||
    coordinates === null ||
    firstBasisVector === null ||
    secondBasisVector === null
  ) {
    return null;
  }

  const computedPath = basisDecomposition(
    firstBasisVector,
    secondBasisVector,
    coordinates,
  );
  return {
    key: scene.focus,
    target,
    coordinates,
    path: { ...computedPath, end: target },
  };
}

export function resolveSourceDecomposition(
  scene: VPlaneScene,
): SourceDecomposition | null {
  const target =
    scene.vector === null ? null : rationalVectorToNumbers(scene.vector);
  const coordinates =
    scene.vectorCoordinates === null
      ? null
      : rationalVectorToNumbers(scene.vectorCoordinates);
  const firstBasisVector = rationalVectorToNumbers(scene.basis.first);
  const secondBasisVector = rationalVectorToNumbers(scene.basis.second);
  if (
    target === null ||
    coordinates === null ||
    firstBasisVector === null ||
    secondBasisVector === null
  ) {
    return null;
  }

  const computedPath = basisDecomposition(
    firstBasisVector,
    secondBasisVector,
    coordinates,
  );
  return {
    target,
    coordinates,
    path: { ...computedPath, end: target },
  };
}

function pushRationalPoint(
  points: Vector2<number>[],
  point: Vector2<Rational> | null,
): void {
  if (point === null) {
    return;
  }
  const numeric = rationalVectorToNumbers(point);
  if (numeric !== null) {
    points.push(numeric);
  }
}

/** Every V-space endpoint/elbow that needs to remain visible. */
export function collectVScenePoints(scene: VPlaneScene): Vector2<number>[] {
  const points: Vector2<number>[] = [{ x: 0, y: 0 }];
  pushRationalPoint(points, scene.basis.first);
  pushRationalPoint(points, scene.basis.second);
  const vector =
    scene.vector === null ? null : rationalVectorToNumbers(scene.vector);
  if (vector !== null) {
    points.push(vector);
  }
  const decomposition = resolveSourceDecomposition(scene);
  if (decomposition !== null) {
    points.push(decomposition.path.elbow, decomposition.path.end);
  }
  return points;
}

/** Every W-space endpoint plus the currently displayed component elbow. */
export function collectWScenePoints(scene: WPlaneScene): Vector2<number>[] {
  const points: Vector2<number>[] = [{ x: 0, y: 0 }];
  pushRationalPoint(points, scene.basis.first);
  pushRationalPoint(points, scene.basis.second);
  pushRationalPoint(points, scene.imageE1);
  pushRationalPoint(points, scene.imageE2);
  pushRationalPoint(points, scene.imageV);
  const focused = resolveFocusedDecomposition(scene);
  if (focused !== null) {
    points.push(focused.path.elbow, focused.path.end);
  }
  return points;
}

export function collectLinkedScenePoints(
  sourceScene: VPlaneScene,
  targetScene: WPlaneScene,
): Vector2<number>[] {
  return [
    ...collectVScenePoints(sourceScene),
    ...collectWScenePoints(targetScene),
  ];
}
