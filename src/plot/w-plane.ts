import type { Rational, Vector2 } from "../types";
import { rationalVectorToNumbers } from "./geometry";
import { formatComponentForLatex } from "./labels";
import { resolveFocusedDecomposition, type WPlaneScene } from "./scenes";
import { RetainedSvgPlane } from "./svg-plane";

const ORIGIN: Vector2<number> = { x: 0, y: 0 };
const INVALID_POINT: Vector2<number> = { x: Number.NaN, y: Number.NaN };

function numericOrInvalid(vector: Vector2<Rational>): Vector2<number> {
  return rationalVectorToNumbers(vector) ?? INVALID_POINT;
}

/** Read-only output-space plot with one focused basis decomposition at a time. */
export class WPlanePlot extends RetainedSvgPlane {
  private lastScene: WPlaneScene | null = null;

  public constructor(svg: SVGSVGElement) {
    super(
      svg,
      "Output vector space W",
      "The basis vectors w one and w two, images of the input basis and selected input vector, and the focused head-to-tail output-basis decomposition.",
    );
    svg.dataset.plane = "W";
    svg.setAttribute(
      "aria-label",
      "Output space W. This plane is read-only because the linear map may not be invertible.",
    );
    this.observeResize(() => {
      if (this.lastScene !== null) {
        this.render(this.lastScene);
      }
    });
  }

  public render(scene: WPlaneScene): void {
    this.lastScene = scene;
    this.svg.dataset.focus = scene.focus;
    this.beginFrame(scene.bounds);

    const focused = resolveFocusedDecomposition(scene);
    const focusedCoordinates = scene.coordinates[scene.focus] ?? null;
    this.svg.dataset.hasDecomposition = String(
      focused !== null && focusedCoordinates !== null,
    );
    if (focused !== null && focusedCoordinates !== null) {
      this.drawArrow(
        this.layers.components,
        "decomposition-w1",
        focused.path.origin,
        focused.path.elbow,
        "blue",
        {
          label: formatComponentForLatex(
            focusedCoordinates.x,
            "\\vec{w}_1",
          ),
          description: `The w one component of ${this.focusLabel(scene.focus)}`,
          dashed: true,
          labelAtMidpoint: true,
        },
      );
      this.drawArrow(
        this.layers.components,
        "decomposition-w2",
        focused.path.elbow,
        focused.path.end,
        "purple",
        {
          label: formatComponentForLatex(
            focusedCoordinates.y,
            "\\vec{w}_2",
          ),
          description: `The w two component of ${this.focusLabel(scene.focus)}`,
          dashed: true,
          labelAtMidpoint: true,
        },
      );
    }

    this.drawArrow(
      this.layers.vectors,
      "basis-w1",
      ORIGIN,
      numericOrInvalid(scene.basis.first),
      "blue",
      {
        label: "\\vec{w}_1",
        description: "First candidate output basis vector w one",
      },
    );
    this.drawArrow(
      this.layers.vectors,
      "basis-w2",
      ORIGIN,
      numericOrInvalid(scene.basis.second),
      "purple",
      {
        label: "\\vec{w}_2",
        description: "Second candidate output basis vector w two",
      },
    );
    this.drawArrow(
      this.layers.vectors,
      "image-e1",
      ORIGIN,
      numericOrInvalid(scene.imageE1),
      "green",
      {
        label: "f(\\vec{e}_1)",
        description: "Image of the first input basis vector",
      },
    );
    this.drawArrow(
      this.layers.vectors,
      "image-e2",
      ORIGIN,
      numericOrInvalid(scene.imageE2),
      "red",
      {
        label: "f(\\vec{e}_2)",
        description: "Image of the second input basis vector",
      },
    );
    if (scene.imageV !== null) {
      this.drawArrow(
        this.layers.foreground,
        "image-v",
        ORIGIN,
        numericOrInvalid(scene.imageV),
        "neutral",
        {
          label: "f(\\vec{v})",
          description: "Image of the selected input vector v",
        },
      );
    }
  }

  private focusLabel(focus: WPlaneScene["focus"]): string {
    switch (focus) {
      case "image-e1":
        return "f(e one)";
      case "image-e2":
        return "f(e two)";
      case "image-v":
        return "f(v)";
    }
  }
}
