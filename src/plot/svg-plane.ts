import katex from "katex";

import type { PlotBounds, Vector2 } from "../types";
import {
  clientToModelPoint,
  clipSegmentToBounds,
  createCoordinateTransform,
  denseGridTicks,
  isFinitePoint,
  isPointInBounds,
  type CoordinateTransform,
  type PlotSize,
} from "./geometry";
import {
  chooseNearbyLabelCenter,
  estimateMathLabelSize,
  type LabelBox,
  type LabelPlacementMode,
} from "./label-layout";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export type PlotColorRole =
  | "green"
  | "red"
  | "blue"
  | "purple"
  | "neutral"
  | "muted";

/**
 * SVG paint order, from back to front. Keep selected vectors in their own
 * foreground layer so v and f(v) cannot be obscured by basis, image, or
 * decomposition arrows.
 */
export const PLOT_LAYER_PAINT_ORDER = [
  "grid",
  "axes",
  "vectors",
  "components",
  "foreground",
  "labels",
  "interaction",
] as const;

export type PlotLayerName = (typeof PLOT_LAYER_PAINT_ORDER)[number];

export interface ArrowOptions {
  label?: string;
  description?: string;
  dashed?: boolean;
  labelAtMidpoint?: boolean;
  labelPlacement?: LabelPlacementMode;
  opacity?: number;
}

const ROLE_COLOR: Record<PlotColorRole, string> = {
  green: "var(--plot-green, #2f9e44)",
  red: "var(--plot-red, #e03131)",
  blue: "var(--plot-blue, #1971c2)",
  purple: "var(--plot-purple, #9c36b5)",
  neutral: "var(--plot-vector, var(--plot-text, #18212f))",
  muted: "var(--plot-muted, #687386)",
};

const ROLE_LABEL_COLOR: Record<PlotColorRole, string> = {
  green: "var(--standard-first-label, var(--plot-green, #2f9e44))",
  red: "var(--standard-second-label, var(--plot-red, #e03131))",
  blue: "var(--prime-first-label, var(--plot-blue, #1971c2))",
  purple: "var(--prime-second-label, var(--plot-purple, #9c36b5))",
  neutral: "var(--plot-vector, var(--plot-text, #18212f))",
  muted: "var(--plot-muted, #687386)",
};

let plotIdSequence = 0;

function nextPlotId(): string {
  plotIdSequence += 1;
  return `linear-map-plot-${plotIdSequence}`;
}

function svgElement<K extends keyof SVGElementTagNameMap>(
  tagName: K,
): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NAMESPACE, tagName);
}

function setNumberAttribute(
  element: Element,
  name: string,
  value: number,
): void {
  if (Number.isFinite(value)) {
    element.setAttribute(name, String(value));
  }
}

function clearChildren(element: Element): void {
  while (element.firstChild !== null) {
    element.removeChild(element.firstChild);
  }
}

function zeroMarkerRadius(key: string): number {
  const radii: Record<string, number> = {
    "source-component-e1": 5,
    "source-component-e2": 8,
    "source-v": 11,
    "basis-w1": 5,
    "basis-w2": 8,
    "image-e1": 6,
    "image-e2": 9,
    "image-v": 12,
    "decomposition-w1": 4,
    "decomposition-w2": 7,
  };
  return radii[key] ?? 5;
}

function measuredSize(svg: SVGSVGElement): PlotSize {
  const rectangle = svg.getBoundingClientRect();
  const attributeWidth = Number(svg.getAttribute("width"));
  const attributeHeight = Number(svg.getAttribute("height"));
  const width =
    rectangle.width > 0
      ? rectangle.width
      : svg.clientWidth > 0
        ? svg.clientWidth
        : attributeWidth > 0
          ? attributeWidth
          : 640;
  const height =
    rectangle.height > 0
      ? rectangle.height
      : svg.clientHeight > 0
        ? svg.clientHeight
        : attributeHeight > 0
          ? attributeHeight
          : 480;
  return {
    width: Math.max(240, Math.round(width)),
    height: Math.max(240, Math.round(height)),
  };
}

/** Shared retained SVG scaffold used by both vector-space planes. */
export abstract class RetainedSvgPlane {
  protected readonly svg: SVGSVGElement;
  protected readonly layers: Record<PlotLayerName, SVGGElement>;

  private readonly instanceId = nextPlotId();
  private readonly clipRectangle: SVGRectElement;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly occupiedLabelBoxes: LabelBox[] = [];
  private resizeCallback: (() => void) | null = null;
  private transformValue: CoordinateTransform | null = null;

  protected constructor(
    svg: SVGSVGElement,
    accessibleTitle: string,
    accessibleDescription: string,
  ) {
    this.svg = svg;
    clearChildren(svg);
    svg.classList.add("vector-plane");
    svg.setAttribute("role", "img");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const title = svgElement("title");
    const titleId = `${this.instanceId}-title`;
    title.id = titleId;
    title.textContent = accessibleTitle;
    svg.append(title);

    const description = svgElement("desc");
    const descriptionId = `${this.instanceId}-description`;
    description.id = descriptionId;
    description.textContent = accessibleDescription;
    svg.append(description);
    svg.setAttribute("aria-labelledby", `${titleId} ${descriptionId}`);

    const definitions = svgElement("defs");
    const clipPath = svgElement("clipPath");
    clipPath.id = `${this.instanceId}-clip`;
    this.clipRectangle = svgElement("rect");
    clipPath.append(this.clipRectangle);
    definitions.append(clipPath);

    for (const role of Object.keys(ROLE_COLOR) as PlotColorRole[]) {
      const marker = svgElement("marker");
      marker.id = this.markerId(role);
      marker.setAttribute("viewBox", "0 0 10 8");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "4");
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "7");
      marker.setAttribute("orient", "auto-start-reverse");
      marker.setAttribute("markerUnits", "strokeWidth");
      const arrowHead = svgElement("path");
      arrowHead.setAttribute("d", "M 0 0 L 10 4 L 0 8 z");
      arrowHead.setAttribute("fill", ROLE_COLOR[role]);
      marker.append(arrowHead);
      definitions.append(marker);
    }
    svg.append(definitions);

    const createLayer = (name: PlotLayerName): SVGGElement => {
      const layer = svgElement("g");
      layer.dataset.layer = name;
      if (name !== "labels" && name !== "interaction") {
        layer.setAttribute("clip-path", `url(#${this.instanceId}-clip)`);
      }
      svg.append(layer);
      return layer;
    };
    this.layers = Object.fromEntries(
      PLOT_LAYER_PAINT_ORDER.map((name) => [name, createLayer(name)]),
    ) as Record<PlotLayerName, SVGGElement>;

    if (typeof ResizeObserver === "undefined") {
      this.resizeObserver = null;
    } else {
      this.resizeObserver = new ResizeObserver(() => this.resizeCallback?.());
      this.resizeObserver.observe(svg);
    }
  }

  protected observeResize(callback: () => void): void {
    this.resizeCallback = callback;
  }

  protected beginFrame(bounds: PlotBounds): CoordinateTransform {
    const size = measuredSize(this.svg);
    const transform = createCoordinateTransform(bounds, size);
    this.transformValue = transform;
    this.svg.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
    this.svg.dataset.bounds = [
      bounds.xMin,
      bounds.xMax,
      bounds.yMin,
      bounds.yMax,
    ].join(",");

    setNumberAttribute(this.clipRectangle, "x", transform.viewport.left);
    setNumberAttribute(this.clipRectangle, "y", transform.viewport.top);
    setNumberAttribute(this.clipRectangle, "width", transform.viewport.width);
    setNumberAttribute(this.clipRectangle, "height", transform.viewport.height);

    for (const layer of Object.values(this.layers)) {
      clearChildren(layer);
    }
    this.occupiedLabelBoxes.length = 0;
    this.drawGridAndAxes(transform);
    return transform;
  }

  public get transform(): CoordinateTransform | null {
    return this.transformValue;
  }

  public clientToModel(clientX: number, clientY: number): Vector2<number> | null {
    if (this.transformValue === null) {
      return null;
    }
    return clientToModelPoint(
      { x: clientX, y: clientY },
      this.svg.getBoundingClientRect(),
      this.transformValue,
    );
  }

  protected drawArrow(
    layer: SVGGElement,
    key: string,
    start: Vector2<number>,
    end: Vector2<number>,
    role: PlotColorRole,
    options: ArrowOptions = {},
  ): SVGGElement {
    const group = svgElement("g");
    group.dataset.arrow = key;
    group.dataset.role = role;
    group.dataset.strokeStyle = options.dashed === true ? "dashed" : "solid";
    group.classList.add("plot-arrow", `plot-arrow-${role}`);
    layer.append(group);

    const title = svgElement("title");
    title.textContent = options.description ?? options.label ?? key;
    group.append(title);

    const transform = this.transformValue;
    if (
      transform === null ||
      !isFinitePoint(start) ||
      !isFinitePoint(end)
    ) {
      group.dataset.invalid = "true";
      return group;
    }

    const color = ROLE_COLOR[role];
    const differenceX = end.x - start.x;
    const differenceY = end.y - start.y;
    const isZero = Math.hypot(differenceX, differenceY) <= 1e-12;
    if (isZero) {
      if (isPointInBounds(start, transform.bounds)) {
        const point = transform.modelToSvg(start);
        const zeroMarker = svgElement("circle");
        zeroMarker.dataset.zeroVector = key;
        setNumberAttribute(zeroMarker, "cx", point.x);
        setNumberAttribute(zeroMarker, "cy", point.y);
        zeroMarker.setAttribute("r", String(zeroMarkerRadius(key)));
        zeroMarker.setAttribute("fill", "none");
        zeroMarker.setAttribute("stroke", color);
        zeroMarker.setAttribute("stroke-width", "2.5");
        zeroMarker.setAttribute("vector-effect", "non-scaling-stroke");
        group.append(zeroMarker);
      }
    } else {
      const clipped = clipSegmentToBounds({ start, end }, transform.bounds);
      if (clipped !== null) {
        const clippedStart = transform.modelToSvg(clipped.start);
        const clippedEnd = transform.modelToSvg(clipped.end);
        const line = svgElement("line");
        line.classList.add("plot-arrow-line");
        setNumberAttribute(line, "x1", clippedStart.x);
        setNumberAttribute(line, "y1", clippedStart.y);
        setNumberAttribute(line, "x2", clippedEnd.x);
        setNumberAttribute(line, "y2", clippedEnd.y);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", options.dashed === true ? "3.2" : "4.1");
        line.setAttribute("stroke-linecap", "round");
        line.setAttribute("vector-effect", "non-scaling-stroke");
        line.setAttribute("marker-end", `url(#${this.markerId(role)})`);
        if (options.dashed === true) {
          line.setAttribute("stroke-dasharray", "7 5");
        }
        if (options.opacity !== undefined) {
          line.setAttribute("opacity", String(options.opacity));
        }
        group.append(line);
      }
    }

    if (options.label !== undefined) {
      const anchor = options.labelAtMidpoint === true
        ? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
        : end;
      if (isPointInBounds(anchor, transform.bounds)) {
        this.drawLabel(
          `${key}-label`,
          options.label,
          anchor,
          role,
          { x: end.x - start.x, y: end.y - start.y },
          options.labelPlacement ?? "adaptive",
          options.labelAtMidpoint === true,
        );
      }
    }
    return group;
  }

  protected drawLabel(
    key: string,
    latexSource: string,
    point: Vector2<number>,
    role: PlotColorRole,
    direction: Vector2<number> = point,
    placement: LabelPlacementMode = "adaptive",
    atMidpoint = false,
  ): SVGForeignObjectElement | null {
    const transform = this.transformValue;
    if (transform === null || !isFinitePoint(point)) {
      return null;
    }
    const svgPoint = transform.modelToSvg(point);
    if (!Number.isFinite(svgPoint.x) || !Number.isFinite(svgPoint.y)) {
      return null;
    }

    const labelSize = estimateMathLabelSize(
      latexSource,
      placement,
      transform.viewport.width,
    );
    const screenDirection = { x: direction.x, y: -direction.y };
    const directionMagnitude = Math.hypot(
      screenDirection.x,
      screenDirection.y,
    );
    const unitDirection = directionMagnitude <= 1e-12
      ? { x: Math.SQRT1_2, y: -Math.SQRT1_2 }
      : {
          x: screenDirection.x / directionMagnitude,
          y: screenDirection.y / directionMagnitude,
        };
    let preferredCenter: Vector2<number>;
    if (atMidpoint) {
      let normal = { x: -unitDirection.y, y: unitDirection.x };
      const origin = transform.modelToSvg({ x: 0, y: 0 });
      const awayFromOrigin = {
        x: svgPoint.x - origin.x,
        y: svgPoint.y - origin.y,
      };
      if (normal.x * awayFromOrigin.x + normal.y * awayFromOrigin.y < 0) {
        normal = { x: -normal.x, y: -normal.y };
      }
      const clearance = labelSize.height / 2 + 5;
      preferredCenter = {
        x: svgPoint.x + normal.x * clearance,
        y: svgPoint.y + normal.y * clearance,
      };
    } else {
      const clearance =
        Math.abs(unitDirection.x) * labelSize.width / 2 +
        Math.abs(unitDirection.y) * labelSize.height / 2 +
        (placement === "near-endpoint" ? 7 : 5);
      preferredCenter = {
        x: svgPoint.x + unitDirection.x * clearance,
        y: svgPoint.y + unitDirection.y * clearance,
      };
    }
    const placedCenter = chooseNearbyLabelCenter(
      preferredCenter,
      labelSize,
      transform.viewport,
      this.occupiedLabelBoxes,
      placement === "near-endpoint" ? 18 : 26,
    );
    this.occupiedLabelBoxes.push({
      centerX: placedCenter.x,
      centerY: placedCenter.y,
      width: labelSize.width,
      height: labelSize.height,
    });

    const labelHost = svgElement("foreignObject");
    labelHost.dataset.label = key;
    labelHost.dataset.labelPlacement = placement;
    labelHost.dataset.tex = latexSource;
    labelHost.classList.add("plot-label-host");
    labelHost.setAttribute("aria-hidden", "true");
    setNumberAttribute(labelHost, "x", placedCenter.x - labelSize.width / 2);
    setNumberAttribute(labelHost, "y", placedCenter.y - labelSize.height / 2);
    setNumberAttribute(labelHost, "width", labelSize.width);
    setNumberAttribute(labelHost, "height", labelSize.height);

    const label = document.createElement("div");
    label.classList.add("plot-label", "plot-math-label");
    if (role === "green") {
      label.classList.add("label-e1");
    } else if (role === "red") {
      label.classList.add("label-e2");
    } else if (role === "blue") {
      label.classList.add("label-w1");
    } else if (role === "purple") {
      label.classList.add("label-w2");
    }
    label.style.alignItems = "center";
    label.style.color = ROLE_LABEL_COLOR[role];
    label.style.display = "flex";
    label.style.fontSize = "19px";
    label.style.fontWeight = "700";
    label.style.height = "100%";
    label.style.justifyContent = "center";
    label.style.lineHeight = "1";
    label.style.pointerEvents = "none";
    label.style.textAlign = "center";
    label.style.textShadow =
      "0 0 4px var(--plot-label-halo, var(--plot-surface, #ffffff)), 0 0 8px var(--plot-label-halo, var(--plot-surface, #ffffff))";
    label.style.whiteSpace = "nowrap";
    label.style.width = "100%";
    const labelChip = document.createElement("span");
    labelChip.classList.add("plot-label-chip");
    labelChip.innerHTML = katex.renderToString(latexSource, {
      displayMode: false,
      output: "htmlAndMathml",
      strict: false,
      throwOnError: false,
      trust: false,
    });
    label.append(labelChip);
    labelHost.append(label);
    this.layers.labels.append(labelHost);
    return labelHost;
  }

  private markerId(role: PlotColorRole): string {
    return `${this.instanceId}-arrow-${role}`;
  }

  private drawGridAndAxes(transform: CoordinateTransform): void {
    const background = svgElement("rect");
    setNumberAttribute(background, "x", transform.viewport.left);
    setNumberAttribute(background, "y", transform.viewport.top);
    setNumberAttribute(background, "width", transform.viewport.width);
    setNumberAttribute(background, "height", transform.viewport.height);
    background.setAttribute("fill", "var(--plot-surface, transparent)");
    background.setAttribute("stroke", "var(--plot-border, #ccd2dc)");
    background.setAttribute("stroke-width", "1");
    background.setAttribute("vector-effect", "non-scaling-stroke");
    this.layers.grid.append(background);

    const xTicks = denseGridTicks(transform.bounds.xMin, transform.bounds.xMax);
    const yTicks = denseGridTicks(transform.bounds.yMin, transform.bounds.yMax);
    const majorGridColor = "var(--plot-grid, #dfe3ea)";
    const minorGridColor = "var(--grid-minor-stroke, rgba(128, 153, 175, 0.12))";
    const axisColor = "var(--plot-axis, #657083)";

    for (const tick of xTicks) {
      const svgX = transform.modelToSvg({ x: tick.value, y: 0 }).x;
      if (tick.value !== 0) {
        const gridLine = svgElement("line");
        gridLine.dataset.grid = tick.kind;
        gridLine.dataset.gridAxis = "x";
        setNumberAttribute(gridLine, "x1", svgX);
        setNumberAttribute(gridLine, "x2", svgX);
        setNumberAttribute(gridLine, "y1", transform.viewport.top);
        setNumberAttribute(gridLine, "y2", transform.viewport.bottom);
        gridLine.setAttribute(
          "stroke",
          tick.kind === "major" ? majorGridColor : minorGridColor,
        );
        gridLine.setAttribute(
          "stroke-width",
          tick.kind === "major" ? "1.1" : "0.7",
        );
        gridLine.setAttribute("vector-effect", "non-scaling-stroke");
        this.layers.grid.append(gridLine);
      }
    }

    for (const tick of yTicks) {
      const svgY = transform.modelToSvg({ x: 0, y: tick.value }).y;
      if (tick.value !== 0) {
        const gridLine = svgElement("line");
        gridLine.dataset.grid = tick.kind;
        gridLine.dataset.gridAxis = "y";
        setNumberAttribute(gridLine, "x1", transform.viewport.left);
        setNumberAttribute(gridLine, "x2", transform.viewport.right);
        setNumberAttribute(gridLine, "y1", svgY);
        setNumberAttribute(gridLine, "y2", svgY);
        gridLine.setAttribute(
          "stroke",
          tick.kind === "major" ? majorGridColor : minorGridColor,
        );
        gridLine.setAttribute(
          "stroke-width",
          tick.kind === "major" ? "1.1" : "0.7",
        );
        gridLine.setAttribute("vector-effect", "non-scaling-stroke");
        this.layers.grid.append(gridLine);
      }
    }

    if (transform.bounds.yMin <= 0 && transform.bounds.yMax >= 0) {
      const xAxisStart = transform.modelToSvg({ x: transform.bounds.xMin, y: 0 });
      const xAxisEnd = transform.modelToSvg({ x: transform.bounds.xMax, y: 0 });
      const xAxis = svgElement("line");
      setNumberAttribute(xAxis, "x1", xAxisStart.x);
      setNumberAttribute(xAxis, "y1", xAxisStart.y);
      setNumberAttribute(xAxis, "x2", xAxisEnd.x);
      setNumberAttribute(xAxis, "y2", xAxisEnd.y);
      xAxis.setAttribute("stroke", axisColor);
      xAxis.setAttribute("stroke-width", "1.4");
      xAxis.setAttribute("vector-effect", "non-scaling-stroke");
      xAxis.dataset.axis = "x";
      this.layers.axes.append(xAxis);
    }
    if (transform.bounds.xMin <= 0 && transform.bounds.xMax >= 0) {
      const yAxisStart = transform.modelToSvg({ x: 0, y: transform.bounds.yMin });
      const yAxisEnd = transform.modelToSvg({ x: 0, y: transform.bounds.yMax });
      const yAxis = svgElement("line");
      setNumberAttribute(yAxis, "x1", yAxisStart.x);
      setNumberAttribute(yAxis, "y1", yAxisStart.y);
      setNumberAttribute(yAxis, "x2", yAxisEnd.x);
      setNumberAttribute(yAxis, "y2", yAxisEnd.y);
      yAxis.setAttribute("stroke", axisColor);
      yAxis.setAttribute("stroke-width", "1.4");
      yAxis.setAttribute("vector-effect", "non-scaling-stroke");
      yAxis.dataset.axis = "y";
      this.layers.axes.append(yAxis);
    }
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeCallback = null;
  }
}
