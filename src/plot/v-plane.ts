import type { Rational, Vector2 } from "../types";
import {
  isPointInBounds,
  rationalVectorToNumbers,
  snapToIntegerGrid,
} from "./geometry";
import {
  formatComponentForLatex,
  formatRationalForPlot,
} from "./labels";
import { resolveSourceDecomposition, type VPlaneScene } from "./scenes";
import { RetainedSvgPlane } from "./svg-plane";

export interface VPlanePlotOptions {
  onSelect?: (point: Vector2<number>) => void;
}

const ORIGIN: Vector2<number> = { x: 0, y: 0 };
const INVALID_POINT: Vector2<number> = { x: Number.NaN, y: Number.NaN };

function numericOrInvalid(vector: Vector2<Rational>): Vector2<number> {
  return rationalVectorToNumbers(vector) ?? INVALID_POINT;
}

/** Interactive source-space plot. Clicking selects an integer lattice vector. */
export class VPlanePlot extends RetainedSvgPlane {
  private readonly options: VPlanePlotOptions;
  private lastScene: VPlaneScene | null = null;

  private readonly handleClick = (event: MouseEvent): void => {
    const transform = this.transform;
    const modelPoint = this.clientToModel(event.clientX, event.clientY);
    if (
      transform === null ||
      modelPoint === null ||
      !isPointInBounds(modelPoint, transform.bounds)
    ) {
      return;
    }
    const snapped = snapToIntegerGrid(modelPoint, transform.bounds);
    if (snapped !== null) {
      this.options.onSelect?.(snapped);
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const delta: Vector2<number> | null =
      event.key === "ArrowLeft"
        ? { x: -1, y: 0 }
        : event.key === "ArrowRight"
          ? { x: 1, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: 1 }
            : event.key === "ArrowDown"
              ? { x: 0, y: -1 }
              : null;
    const transform = this.transform;
    if (delta === null || transform === null || this.lastScene === null) {
      return;
    }
    const current =
      this.lastScene.vector === null
        ? ORIGIN
        : rationalVectorToNumbers(this.lastScene.vector) ?? ORIGIN;
    const snappedCurrent = snapToIntegerGrid(current, transform.bounds);
    if (snappedCurrent === null) {
      return;
    }
    const next = snapToIntegerGrid(
      {
        x: snappedCurrent.x + delta.x,
        y: snappedCurrent.y + delta.y,
      },
      transform.bounds,
    );
    if (next !== null) {
      event.preventDefault();
      this.options.onSelect?.(next);
    }
  };

  public constructor(svg: SVGSVGElement, options: VPlanePlotOptions = {}) {
    super(
      svg,
      "Input vector space V",
      "The chosen source basis vectors e one and e two, the selected vector v, and its available head-to-tail source-basis decomposition.",
    );
    this.options = options;
    svg.dataset.plane = "V";
    svg.setAttribute("tabindex", "0");
    svg.setAttribute(
      "aria-label",
      "Input space V. Click to select an integer vector, or use the arrow keys to move the selected vector one grid unit.",
    );
    svg.addEventListener("click", this.handleClick);
    svg.addEventListener("keydown", this.handleKeyDown);
    this.observeResize(() => {
      if (this.lastScene !== null) {
        this.render(this.lastScene);
      }
    });
  }

  public render(scene: VPlaneScene): void {
    this.lastScene = scene;
    this.svg.dataset.hasVector = String(scene.vector !== null);
    this.beginFrame(scene.bounds);

    const decomposition = resolveSourceDecomposition(scene);
    this.svg.dataset.hasDecomposition = String(decomposition !== null);

    this.drawArrow(
      this.layers.vectors,
      "basis-e1",
      ORIGIN,
      numericOrInvalid(scene.basis.first),
      "green",
      {
        label: "\\vec{e}_1",
        description: "First candidate source basis vector e one",
        labelPlacement: "near-endpoint",
      },
    );
    this.drawArrow(
      this.layers.vectors,
      "basis-e2",
      ORIGIN,
      numericOrInvalid(scene.basis.second),
      "red",
      {
        label: "\\vec{e}_2",
        description: "Second candidate source basis vector e two",
        labelPlacement: "near-endpoint",
      },
    );

    const vector =
      scene.vector === null ? null : rationalVectorToNumbers(scene.vector);
    if (vector !== null && scene.vector !== null) {
      if (decomposition !== null && scene.vectorCoordinates !== null) {
        this.drawArrow(
          this.layers.components,
          "source-component-e1",
          decomposition.path.origin,
          decomposition.path.elbow,
          "green",
          {
            label: formatComponentForLatex(
              scene.vectorCoordinates.x,
              "\\vec{e}_1",
            ),
            description: "The e one component of v",
            dashed: true,
            labelAtMidpoint: true,
          },
        );
        this.drawArrow(
          this.layers.components,
          "source-component-e2",
          decomposition.path.elbow,
          decomposition.path.end,
          "red",
          {
            label: formatComponentForLatex(
              scene.vectorCoordinates.y,
              "\\vec{e}_2",
            ),
            description: "The e two component of v",
            dashed: true,
            labelAtMidpoint: true,
          },
        );
      }
      this.drawArrow(
        this.layers.foreground,
        "source-v",
        ORIGIN,
        vector,
        "neutral",
        {
          label: "\\vec{v}",
          description: `Selected input vector v at (${formatRationalForPlot(scene.vector.x)}, ${formatRationalForPlot(scene.vector.y)})`,
        },
      );
    }

  }

  public override destroy(): void {
    this.svg.removeEventListener("click", this.handleClick);
    this.svg.removeEventListener("keydown", this.handleKeyDown);
    super.destroy();
  }
}
