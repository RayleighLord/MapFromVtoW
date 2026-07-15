import type {
  AppNotice,
  AppState,
  BasisV,
  BasisW,
  DecompositionFocus,
  LinearMap2D,
  PlotBounds,
  Rational,
  Vector2,
  ViewModel,
} from "../types";
import {
  analyzeMap,
  analyzeVectorWithMapAnalysis,
  fitPlotBounds,
  integerVector2,
  matrix2,
  normalizeBasisW,
  normalizeBasisV,
  normalizeMatrix2,
  normalizePlotBounds,
  normalizeVector2,
  parseRational,
  rational,
  vector2,
  DEFAULT_PLOT_BOUNDS,
  STANDARD_BASIS_V,
} from "../math";

export interface LinearMapFields {
  a: string;
  b: string;
  c: string;
  d: string;
}

export interface BasisFields {
  w1x: string;
  w1y: string;
  w2x: string;
  w2y: string;
}

export type BasisWFields = BasisFields;

export interface BasisVFields {
  e1x: string;
  e1y: string;
  e2x: string;
  e2y: string;
}

export interface VectorFields {
  x: string;
  y: string;
}

export type AppControllerListener = (viewModel: ViewModel) => void;

export const DEFAULT_MAP: LinearMap2D = matrix2(
  [rational(1n), rational(2n)],
  [rational(0n), rational(1n)],
);

export const DEFAULT_BASIS_V: BasisV = STANDARD_BASIS_V;

export const DEFAULT_BASIS_W: BasisW = Object.freeze({
  first: integerVector2(1n, 1n),
  second: integerVector2(-1n, 1n),
});

export const DEFAULT_SELECTED_VECTOR: Vector2<Rational> = integerVector2(2n, 1n);

function freezeState(state: AppState): AppState {
  return Object.freeze({
    map: normalizeMatrix2(state.map),
    basisV: normalizeBasisV(state.basisV),
    basisW: normalizeBasisW(state.basisW),
    selectedVector:
      state.selectedVector === null
        ? null
        : normalizeVector2(state.selectedVector),
    focus:
      state.focus === "image-v" && state.selectedVector === null
        ? "image-e1"
        : state.focus,
    bounds: normalizePlotBounds(state.bounds),
  });
}

export function createDefaultAppState(): AppState {
  const state = freezeState({
    map: DEFAULT_MAP,
    basisV: DEFAULT_BASIS_V,
    basisW: DEFAULT_BASIS_W,
    selectedVector: DEFAULT_SELECTED_VECTOR,
    focus: "image-v",
    bounds: DEFAULT_PLOT_BOUNDS,
  });

  return freezeState({
    ...state,
    bounds: fitPlotBounds(deriveViewModel(state)),
  });
}

export function deriveViewModel(stateValue: AppState): ViewModel {
  const state = freezeState(stateValue);
  const analysis = analyzeMap(state.map, state.basisV, state.basisW);
  const vector =
    state.selectedVector === null
      ? null
      : analyzeVectorWithMapAnalysis(
          state.map,
          analysis,
          state.selectedVector,
        );
  const notices: AppNotice[] = [];

  if (analysis.inverseSourceBasis === null) {
    notices.push(
      Object.freeze({
        tone: "warning",
        text: "Not a basis in V: e₁ and e₂ are linearly dependent. Source coordinates, the source decomposition, and the representation matrix are unavailable.",
      }),
    );
  }

  if (analysis.inverseBasis === null) {
    notices.push(
      Object.freeze({
        tone: "warning",
        text: "Not a basis: w₁ and w₂ are linearly dependent. Coordinates and the representation matrix are unavailable.",
      }),
    );
  }

  return Object.freeze({
    state,
    analysis,
    vector,
    notices,
  });
}

export function parseLinearMapFields(fields: LinearMapFields): LinearMap2D {
  // Parse every field before constructing the result, so callers can apply it
  // as one atomic transition.
  const a = parseRational(fields.a);
  const b = parseRational(fields.b);
  const c = parseRational(fields.c);
  const d = parseRational(fields.d);
  return matrix2([a, b], [c, d]);
}

export function parseBasisFields(fields: BasisFields): BasisW {
  return parseBasisWFields(fields);
}

export function parseBasisWFields(fields: BasisWFields): BasisW {
  const w1x = parseRational(fields.w1x);
  const w1y = parseRational(fields.w1y);
  const w2x = parseRational(fields.w2x);
  const w2y = parseRational(fields.w2y);
  return Object.freeze({
    first: vector2(w1x, w1y),
    second: vector2(w2x, w2y),
  });
}

export function parseBasisVFields(fields: BasisVFields): BasisV {
  const e1x = parseRational(fields.e1x);
  const e1y = parseRational(fields.e1y);
  const e2x = parseRational(fields.e2x);
  const e2y = parseRational(fields.e2y);
  return Object.freeze({
    first: vector2(e1x, e1y),
    second: vector2(e2x, e2y),
  });
}

export function parseVectorFields(fields: VectorFields): Vector2<Rational> {
  const x = parseRational(fields.x);
  const y = parseRational(fields.y);
  return vector2(x, y);
}

export function snapVectorToInteger(x: number, y: number): Vector2<Rational> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError("Only finite plot coordinates can be selected.");
  }

  return integerVector2(BigInt(Math.round(x)), BigInt(Math.round(y)));
}

export class AppController {
  private state: AppState;
  private readonly listeners = new Set<AppControllerListener>();

  public constructor(initialState: AppState = createDefaultAppState()) {
    const normalized = freezeState(initialState);
    const initialViewModel = deriveViewModel(normalized);
    this.state = freezeState({
      ...normalized,
      bounds: fitPlotBounds(initialViewModel),
    });
  }

  public getState(): AppState {
    return this.state;
  }

  public getViewModel(): ViewModel {
    return deriveViewModel(this.state);
  }

  public subscribe(
    listener: AppControllerListener,
    emitImmediately = true,
  ): () => void {
    this.listeners.add(listener);
    if (emitImmediately) {
      listener(this.getViewModel());
    }

    return () => {
      this.listeners.delete(listener);
    };
  }

  public updateMap(map: LinearMap2D): ViewModel {
    return this.commit({ ...this.state, map: normalizeMatrix2(map) });
  }

  public updateMapFromFields(fields: LinearMapFields): ViewModel {
    const map = parseLinearMapFields(fields);
    return this.updateMap(map);
  }

  public updateBasisV(basisV: BasisV): ViewModel {
    return this.commit({ ...this.state, basisV: normalizeBasisV(basisV) });
  }

  public updateBasisVFromFields(fields: BasisVFields): ViewModel {
    const basisV = parseBasisVFields(fields);
    return this.updateBasisV(basisV);
  }

  public updateBasisW(basisW: BasisW): ViewModel {
    return this.commit({ ...this.state, basisW: normalizeBasisW(basisW) });
  }

  public updateBasisWFromFields(fields: BasisWFields): ViewModel {
    const basisW = parseBasisWFields(fields);
    return this.updateBasisW(basisW);
  }

  /** Backwards-compatible alias for updating B_W. */
  public updateBasis(basisW: BasisW): ViewModel {
    return this.updateBasisW(basisW);
  }

  /** Backwards-compatible alias for updating B_W from form values. */
  public updateBasisFromFields(fields: BasisFields): ViewModel {
    return this.updateBasisWFromFields(fields);
  }

  public setSelectedVector(selectedVector: Vector2<Rational>): ViewModel {
    return this.commit({
      ...this.state,
      selectedVector: normalizeVector2(selectedVector),
      focus: "image-v",
    });
  }

  public setSelectedVectorFromFields(fields: VectorFields): ViewModel {
    const selectedVector = parseVectorFields(fields);
    return this.setSelectedVector(selectedVector);
  }

  public clearSelectedVector(): ViewModel {
    return this.commit({
      ...this.state,
      selectedVector: null,
      focus: "image-e1",
    });
  }

  public setFocus(focus: DecompositionFocus): ViewModel {
    const current = this.getViewModel();
    if (current.analysis.inverseBasis === null) {
      return current;
    }

    const resolvedFocus =
      focus === "image-v" && this.state.selectedVector === null
        ? "image-e1"
        : focus;
    return this.commit({ ...this.state, focus: resolvedFocus });
  }

  public fitView(): ViewModel {
    return this.commit(this.state);
  }

  private commit(candidateValue: AppState): ViewModel {
    // All normalization/analysis occurs before state is assigned. Any thrown
    // validation error leaves both state and subscribers untouched.
    let candidate = freezeState(candidateValue);
    let viewModel = deriveViewModel(candidate);
    candidate = freezeState({
      ...candidate,
      bounds: fitPlotBounds(viewModel),
    });
    viewModel = deriveViewModel(candidate);

    this.state = candidate;
    for (const listener of this.listeners) {
      listener(viewModel);
    }

    return viewModel;
  }
}

export function createAppController(
  listener?: AppControllerListener,
): AppController {
  const controller = new AppController();
  if (listener !== undefined) {
    controller.subscribe(listener);
  }
  return controller;
}

/** Convenience for integrations that need an exact integer coordinate. */
export function integerCoordinate(value: number): Rational {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("The coordinate must be a safe integer.");
  }
  return rational(BigInt(value));
}

export type { PlotBounds };
