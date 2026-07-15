import katex from "katex";

import {
  formatRational,
  matrix2,
  tryParseRational,
  vector2,
} from "./math";
import {
  VPlanePlot,
  WPlanePlot,
  vPlaneSceneFromViewModel,
  wPlaneSceneFromViewModel,
} from "./plot";
import type {
  Matrix2,
  Rational,
  Vector2,
  ViewModel,
} from "./types";
import { AppController, snapVectorToInteger } from "./ui/controller";

type Theme = "dark" | "light";

interface FieldTarget {
  input: HTMLInputElement;
  error: HTMLElement;
}

const THEME_STORAGE_KEY = "map-from-v-to-w-theme";
const GREEN = "#1B7F5A";
const RED = "#C4454D";
const BLUE = "#2F6FDB";
const PURPLE = "#9B6ACB";

export function startApp(): void {
  renderStaticMath();

  const interactionStatus = getElement<HTMLElement>("interaction-status");
  const mapStatus = getElement<HTMLElement>("map-status");
  const sourceBasisStatus = getElement<HTMLElement>("source-basis-status");
  const basisStatus = getElement<HTMLElement>("basis-status");
  const mapFormError = getElement<HTMLElement>("map-form-error");
  const sourceBasisFormError = getElement<HTMLElement>("source-basis-form-error");
  const basisFormError = getElement<HTMLElement>("basis-form-error");
  const vectorFormError = getElement<HTMLElement>("vector-form-error");

  const mapFields = {
    a: fieldTarget("map-11"),
    b: fieldTarget("map-12"),
    c: fieldTarget("map-21"),
    d: fieldTarget("map-22"),
  };
  const basisFields = {
    w1x: fieldTarget("basis-first-x"),
    w1y: fieldTarget("basis-first-y"),
    w2x: fieldTarget("basis-second-x"),
    w2y: fieldTarget("basis-second-y"),
  };
  const sourceBasisFields = {
    e1x: fieldTarget("source-basis-first-x"),
    e1y: fieldTarget("source-basis-first-y"),
    e2x: fieldTarget("source-basis-second-x"),
    e2y: fieldTarget("source-basis-second-y"),
  };
  const vectorFields = {
    x: fieldTarget("vector-x"),
    y: fieldTarget("vector-y"),
  };

  let mapDirty = false;
  let sourceBasisDirty = false;
  let basisDirty = false;

  for (const target of Object.values(mapFields)) {
    target.input.addEventListener("input", () => {
      mapDirty = true;
      clearFieldError(target);
      mapFormError.textContent = "";
      renderMapStatus(mapStatus, mapDirty);
    });
  }
  for (const target of Object.values(basisFields)) {
    target.input.addEventListener("input", () => {
      basisDirty = true;
      clearFieldError(target);
      basisFormError.textContent = "";
      basisStatus.textContent = "Unapplied";
      basisStatus.className = "status-chip is-dirty";
    });
  }
  for (const target of Object.values(sourceBasisFields)) {
    target.input.addEventListener("input", () => {
      sourceBasisDirty = true;
      clearFieldError(target);
      sourceBasisFormError.textContent = "";
      sourceBasisStatus.textContent = "Unapplied";
      sourceBasisStatus.className = "status-chip is-dirty";
    });
  }
  for (const target of Object.values(vectorFields)) {
    target.input.addEventListener("input", () => {
      clearFieldError(target);
      vectorFormError.textContent = "";
    });
  }

  const controller = new AppController();
  const vPlot = new VPlanePlot(getElement<SVGSVGElement>("v-plot"), {
    onSelect: ({ x, y }) => {
      const vector = snapVectorToInteger(x, y);
      syncVectorFields(vectorFields, vector);
      clearAllFieldErrors(Object.values(vectorFields));
      vectorFormError.textContent = "";
      controller.setSelectedVector(vector);
      announce(interactionStatus, `Vector v set to (${Math.round(x)}, ${Math.round(y)}).`);
    },
  });
  const wPlot = new WPlanePlot(getElement<SVGSVGElement>("w-plot"));

  configureTheme(interactionStatus);

  const mapForm = getElement<HTMLFormElement>("map-form");
  mapForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const a = readField(mapFields.a);
    const b = readField(mapFields.b);
    const c = readField(mapFields.c);
    const d = readField(mapFields.d);
    if (a === null || b === null || c === null || d === null) {
      mapFormError.textContent = "Correct the highlighted coefficients; the last applied map is still shown.";
      announce(interactionStatus, "The linear map was not applied because one or more coefficients are invalid.");
      return;
    }

    mapDirty = false;
    mapFormError.textContent = "";
    controller.updateMap(matrix2([a, b], [c, d]));
    announce(interactionStatus, "Linear map applied.");
  });

  const basisForm = getElement<HTMLFormElement>("basis-form");
  basisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const w1x = readField(basisFields.w1x);
    const w1y = readField(basisFields.w1y);
    const w2x = readField(basisFields.w2x);
    const w2y = readField(basisFields.w2y);
    if (w1x === null || w1y === null || w2x === null || w2y === null) {
      basisFormError.textContent = "Correct the highlighted coordinates; the last applied pair is still shown.";
      announce(interactionStatus, "The output basis was not updated because one or more coordinates are invalid.");
      return;
    }

    basisDirty = false;
    basisFormError.textContent = "";
    const viewModel = controller.updateBasisW({
      first: vector2(w1x, w1y),
      second: vector2(w2x, w2y),
    });
    announce(
      interactionStatus,
      viewModel.analysis.inverseBasis === null
        ? "Candidate output basis updated. Its determinant is zero, so it is not a basis."
        : "Output basis updated.",
    );
  });

  const sourceBasisForm = getElement<HTMLFormElement>("source-basis-form");
  sourceBasisForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const e1x = readField(sourceBasisFields.e1x);
    const e1y = readField(sourceBasisFields.e1y);
    const e2x = readField(sourceBasisFields.e2x);
    const e2y = readField(sourceBasisFields.e2y);
    if (e1x === null || e1y === null || e2x === null || e2y === null) {
      sourceBasisFormError.textContent = "Correct the highlighted coordinates; the last applied pair is still shown.";
      announce(interactionStatus, "The input basis was not updated because one or more coordinates are invalid.");
      return;
    }

    sourceBasisDirty = false;
    sourceBasisFormError.textContent = "";
    const viewModel = controller.updateBasisV({
      first: vector2(e1x, e1y),
      second: vector2(e2x, e2y),
    });
    announce(
      interactionStatus,
      viewModel.analysis.inverseSourceBasis === null
        ? "Candidate input basis updated. Its determinant is zero, so it is not a basis."
        : "Input basis updated.",
    );
  });

  const vectorForm = getElement<HTMLFormElement>("vector-form");
  vectorForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const x = readField(vectorFields.x);
    const y = readField(vectorFields.y);
    if (x === null || y === null) {
      vectorFormError.textContent = "Correct the highlighted coordinates; the previous vector is unchanged.";
      announce(interactionStatus, "The vector was not changed because one or more coordinates are invalid.");
      return;
    }

    vectorFormError.textContent = "";
    controller.setSelectedVector(vector2(x, y));
    announce(interactionStatus, "Input vector set.");
  });

  getElement<HTMLButtonElement>("clear-vector-button").addEventListener("click", () => {
    vectorFields.x.input.value = "";
    vectorFields.y.input.value = "";
    clearAllFieldErrors(Object.values(vectorFields));
    vectorFormError.textContent = "";
    controller.clearSelectedVector();
    announce(interactionStatus, "Input vector cleared. The first matrix column is now focused.");
  });

  getElement<SVGSVGElement>("v-plot").addEventListener("contextmenu", (event) => {
    event.preventDefault();
    vectorFields.x.input.value = "";
    vectorFields.y.input.value = "";
    controller.clearSelectedVector();
    announce(interactionStatus, "Input vector cleared.");
  });

  controller.subscribe((viewModel) => {
    renderMapStatus(mapStatus, mapDirty);
    renderBasisStatus(
      sourceBasisStatus,
      sourceBasisDirty,
      viewModel.analysis.inverseSourceBasis !== null,
    );
    renderBasisStatus(
      basisStatus,
      basisDirty,
      viewModel.analysis.inverseBasis !== null,
    );
    renderResults(viewModel);
    vPlot.render(vPlaneSceneFromViewModel(viewModel));
    wPlot.render(wPlaneSceneFromViewModel(viewModel));
  });
}

function configureTheme(status: HTMLElement): void {
  const toggle = getElement<HTMLButtonElement>("theme-toggle");
  const icon = getElement<HTMLElement>("theme-toggle-icon");
  const label = getElement<HTMLElement>("theme-toggle-label");
  let theme = readTheme();

  const apply = (): void => {
    const destination = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = theme;
    toggle.setAttribute("aria-pressed", `${theme === "dark"}`);
    toggle.setAttribute("aria-label", `Switch to ${destination} mode`);
    icon.textContent = destination === "light" ? "☀" : "☾";
    label.textContent = `${destination === "light" ? "Light" : "Dark"} mode`;
  };

  apply();
  toggle.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    apply();
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme switching remains available when storage is blocked.
    }
    announce(status, `${theme === "dark" ? "Dark" : "Light"} mode enabled.`);
  });
}

function readTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function renderStaticMath(): void {
  document.querySelectorAll<HTMLElement>("[data-math]").forEach((element) => {
    renderMath(element, element.dataset.math ?? "");
  });
}

function renderMapStatus(element: HTMLElement, dirty: boolean): void {
  element.textContent = dirty ? "Unapplied" : "Applied";
  element.className = `status-chip ${dirty ? "is-dirty" : "is-ready"}`;
}

function renderBasisStatus(
  element: HTMLElement,
  dirty: boolean,
  valid: boolean,
): void {
  if (dirty) {
    element.textContent = "Unapplied";
    element.className = "status-chip is-dirty";
    return;
  }

  element.textContent = valid ? "Valid basis" : "Not a basis";
  element.className = `status-chip ${valid ? "is-valid" : "is-invalid"}`;
}

function renderResults(viewModel: ViewModel): void {
  const { analysis } = viewModel;
  const representation = getElement<HTMLElement>("representation-matrix");
  const warning = getElement<HTMLElement>("basis-warning");

  renderMatrixComponent(
    "matrix-component-e1",
    "1",
    analysis.imageE1Coordinates,
  );
  renderMatrixComponent(
    "matrix-component-e2",
    "2",
    analysis.imageE2Coordinates,
  );

  const valid = analysis.representation !== null;
  if (valid && analysis.representation !== null) {
    renderMath(
      representation,
      String.raw`[f]_{B_W\leftarrow B_V}=A=${coloredMatrixTex(analysis.representation)}`,
      true,
    );
    representation.dataset.matrix = matrixData(analysis.representation);
    warning.hidden = true;
    warning.textContent = "";
  } else {
    delete representation.dataset.matrix;
    const invalidSource = analysis.inverseSourceBasis === null;
    const invalidTarget = analysis.inverseBasis === null;
    const unavailableBasis = invalidSource && invalidTarget
      ? String.raw`B_V\text{ and }B_W\text{ are not bases}`
      : invalidSource
        ? String.raw`B_V\text{ is not a basis}`
        : String.raw`B_W\text{ is not a basis}`;
    renderMath(
      representation,
      String.raw`[f]_{B_W\leftarrow B_V}=A\text{ is unavailable because }${unavailableBasis}`,
      true,
    );
    warning.hidden = false;
    warning.textContent = invalidSource
      ? "The selected vectors in V are linearly dependent. Their ambient images still exist, but they cannot define matrix columns for a source basis."
      : "The selected vectors in W are linearly dependent. Ambient image vectors still exist, but their coordinates in B_W are not uniquely available.";
  }
}

function renderMatrixComponent(
  id: string,
  basisIndex: "1" | "2",
  coordinates: Vector2<Rational> | null,
): void {
  const element = getElement<HTMLElement>(id);
  const label = matrixComponentLabelTex(basisIndex);

  if (coordinates === null) {
    delete element.dataset.vector;
    delete element.dataset.coordinates;
    renderMath(
      element,
      String.raw`${label}=\text{unavailable}`,
    );
    return;
  }

  const exactCoordinates = `${formatRational(coordinates.x)},${formatRational(coordinates.y)}`;
  element.dataset.vector = exactCoordinates;
  element.dataset.coordinates = exactCoordinates;
  renderMath(
    element,
    String.raw`${label}=\begin{bmatrix}\color{${BLUE}}{${rationalTex(coordinates.x)}}\\[0.25em]\color{${PURPLE}}{${rationalTex(coordinates.y)}}\end{bmatrix}`,
  );
}

function matrixComponentLabelTex(basisIndex: "1" | "2"): string {
  const color = basisIndex === "1" ? GREEN : RED;
  return String.raw`\left[\color{${color}}{f(\vec e_${basisIndex})}\right]_{B_W}`;
}

function matrixData(matrix: Matrix2<Rational>): string {
  return `${formatRational(matrix[0][0])},${formatRational(matrix[0][1])};${formatRational(matrix[1][0])},${formatRational(matrix[1][1])}`;
}

function coloredMatrixTex(matrix: Matrix2<Rational>): string {
  return String.raw`\begin{bmatrix}\color{${BLUE}}{${rationalTex(matrix[0][0])}}&\color{${BLUE}}{${rationalTex(matrix[0][1])}}\\[0.55em]\color{${PURPLE}}{${rationalTex(matrix[1][0])}}&\color{${PURPLE}}{${rationalTex(matrix[1][1])}}\end{bmatrix}`;
}

function rationalTex(value: Rational): string {
  if (value.denominator === 1n) {
    return value.numerator.toString();
  }
  return value.numerator < 0n
    ? String.raw`-\frac{${-value.numerator}}{${value.denominator}}`
    : String.raw`\frac{${value.numerator}}{${value.denominator}}`;
}

function readField(target: FieldTarget): Rational | null {
  const result = tryParseRational(target.input.value);
  if (!result.ok) {
    target.input.setAttribute("aria-invalid", "true");
    target.error.textContent = result.error.message;
    return null;
  }
  clearFieldError(target);
  return result.value;
}

function fieldTarget(id: string): FieldTarget {
  return {
    input: getElement<HTMLInputElement>(id),
    error: getElement<HTMLElement>(`${id}-error`),
  };
}

function clearFieldError(target: FieldTarget): void {
  target.input.removeAttribute("aria-invalid");
  target.error.textContent = "";
}

function clearAllFieldErrors(targets: readonly FieldTarget[]): void {
  targets.forEach(clearFieldError);
}

function syncVectorFields(
  targets: { x: FieldTarget; y: FieldTarget },
  vector: Vector2<Rational>,
): void {
  targets.x.input.value = formatRational(vector.x);
  targets.y.input.value = formatRational(vector.y);
}

function renderMath(element: HTMLElement, tex: string, displayMode = false): void {
  katex.render(tex, element, {
    displayMode,
    throwOnError: false,
    strict: false,
    output: "htmlAndMathml",
  });
}

function announce(element: HTMLElement, message: string): void {
  element.textContent = "";
  window.setTimeout(() => {
    element.textContent = message;
  }, 0);
}

function getElement<T extends Element>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) {
    throw new Error(`Missing required element #${id}.`);
  }
  return element as unknown as T;
}
