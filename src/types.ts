export interface Rational {
  numerator: bigint;
  denominator: bigint;
}

export interface Vector2<T = number> {
  x: T;
  y: T;
}

export type Matrix2<T> = readonly [
  readonly [T, T],
  readonly [T, T]
];

export interface BasisV {
  first: Vector2<Rational>;
  second: Vector2<Rational>;
}

export interface BasisW {
  first: Vector2<Rational>;
  second: Vector2<Rational>;
}

export type LinearMap2D = Matrix2<Rational>;

export type DecompositionFocus = "image-e1" | "image-e2" | "image-v";

export interface PlotBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface MapAnalysis {
  sourceBasisMatrix: Matrix2<Rational>;
  sourceDeterminant: Rational;
  inverseSourceBasis: Matrix2<Rational> | null;
  basisMatrix: Matrix2<Rational>;
  determinant: Rational;
  inverseBasis: Matrix2<Rational> | null;
  representation: Matrix2<Rational> | null;
  imageE1: Vector2<Rational>;
  imageE2: Vector2<Rational>;
  imageE1Coordinates: Vector2<Rational> | null;
  imageE2Coordinates: Vector2<Rational> | null;
}

export interface VectorAnalysis {
  source: Vector2<Rational>;
  sourceCoordinates: Vector2<Rational> | null;
  image: Vector2<Rational>;
  imageCoordinates: Vector2<Rational> | null;
}

export interface AppState {
  map: LinearMap2D;
  basisV: BasisV;
  basisW: BasisW;
  selectedVector: Vector2<Rational> | null;
  focus: DecompositionFocus;
  bounds: PlotBounds;
}

export type NoticeTone = "info" | "warning" | "error";

export interface AppNotice {
  tone: NoticeTone;
  text: string;
}

export interface ViewModel {
  state: AppState;
  analysis: MapAnalysis;
  vector: VectorAnalysis | null;
  notices: AppNotice[];
}
