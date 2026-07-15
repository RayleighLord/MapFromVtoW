import type {
  BasisV,
  BasisW,
  LinearMap2D,
  MapAnalysis,
  Matrix2,
  Rational,
  Vector2,
  VectorAnalysis,
} from "../types";
import {
  determinantMatrix2,
  inverseMatrix2,
  matrix2,
  multiplyMatrix2,
  multiplyMatrixVector2,
  normalizeMatrix2,
} from "./matrix";
import { integerVector2, normalizeVector2 } from "./vector";

export const STANDARD_BASIS_V: BasisV = Object.freeze({
  first: integerVector2(1n, 0n),
  second: integerVector2(0n, 1n),
});

export function normalizeBasisV(basis: BasisV): BasisV {
  return Object.freeze({
    first: normalizeVector2(basis.first),
    second: normalizeVector2(basis.second),
  });
}

export function normalizeBasisW(basis: BasisW): BasisW {
  return Object.freeze({
    first: normalizeVector2(basis.first),
    second: normalizeVector2(basis.second),
  });
}

export function basisVMatrix(basis: BasisV): Matrix2<Rational> {
  return matrix2(
    [basis.first.x, basis.second.x],
    [basis.first.y, basis.second.y],
  );
}

export function basisWMatrix(basis: BasisW): Matrix2<Rational> {
  return matrix2(
    [basis.first.x, basis.second.x],
    [basis.first.y, basis.second.y],
  );
}

export function analyzeMap(
  mapValue: LinearMap2D,
  basisWValue: BasisW,
): MapAnalysis;
export function analyzeMap(
  mapValue: LinearMap2D,
  basisVValue: BasisV,
  basisWValue: BasisW,
): MapAnalysis;
export function analyzeMap(
  mapValue: LinearMap2D,
  basisVOrWValue: BasisV | BasisW,
  optionalBasisWValue?: BasisW,
): MapAnalysis {
  const map = normalizeMatrix2(mapValue);
  const sourceBasis = normalizeBasisV(
    optionalBasisWValue === undefined
      ? STANDARD_BASIS_V
      : basisVOrWValue,
  );
  const basis = normalizeBasisW(
    optionalBasisWValue ?? basisVOrWValue,
  );
  const sourceBasisMatrix = basisVMatrix(sourceBasis);
  const sourceDeterminant = determinantMatrix2(sourceBasisMatrix);
  const inverseSourceBasis = inverseMatrix2(sourceBasisMatrix);
  const basisMatrix = basisWMatrix(basis);
  const determinant = determinantMatrix2(basisMatrix);
  const inverseBasis = inverseMatrix2(basisMatrix);
  const representation =
    inverseSourceBasis === null || inverseBasis === null
      ? null
      : multiplyMatrix2(
          multiplyMatrix2(inverseBasis, map),
          sourceBasisMatrix,
        );
  const imageE1 = multiplyMatrixVector2(map, sourceBasis.first);
  const imageE2 = multiplyMatrixVector2(map, sourceBasis.second);
  const imageE1Coordinates =
    inverseBasis === null
      ? null
      : multiplyMatrixVector2(inverseBasis, imageE1);
  const imageE2Coordinates =
    inverseBasis === null
      ? null
      : multiplyMatrixVector2(inverseBasis, imageE2);

  return Object.freeze({
    sourceBasisMatrix,
    sourceDeterminant,
    inverseSourceBasis,
    basisMatrix,
    determinant,
    inverseBasis,
    representation,
    imageE1,
    imageE2,
    imageE1Coordinates,
    imageE2Coordinates,
  });
}

export function analyzeVectorWithMapAnalysis(
  map: LinearMap2D,
  analysis: MapAnalysis,
  sourceValue: Vector2<Rational>,
): VectorAnalysis {
  const source = normalizeVector2(sourceValue);
  const sourceCoordinates =
    analysis.inverseSourceBasis === null
      ? null
      : multiplyMatrixVector2(analysis.inverseSourceBasis, source);
  const image = multiplyMatrixVector2(map, source);
  const imageCoordinates =
    analysis.inverseBasis === null
      ? null
      : multiplyMatrixVector2(analysis.inverseBasis, image);

  return Object.freeze({
    source,
    sourceCoordinates,
    image,
    imageCoordinates,
  });
}

export function analyzeVector(
  map: LinearMap2D,
  basisW: BasisW,
  source: Vector2<Rational>,
): VectorAnalysis;
export function analyzeVector(
  map: LinearMap2D,
  basisV: BasisV,
  basisW: BasisW,
  source: Vector2<Rational>,
): VectorAnalysis;
export function analyzeVector(
  map: LinearMap2D,
  basisVOrW: BasisV | BasisW,
  basisWOrSource: BasisW | Vector2<Rational>,
  optionalSource?: Vector2<Rational>,
): VectorAnalysis {
  if (optionalSource === undefined) {
    const source = basisWOrSource as Vector2<Rational>;
    return analyzeVectorWithMapAnalysis(
      map,
      analyzeMap(map, basisVOrW),
      source,
    );
  }

  return analyzeVectorWithMapAnalysis(
    map,
    analyzeMap(map, basisVOrW, basisWOrSource as BasisW),
    optionalSource,
  );
}
