import type { Vector2 } from "../types";
import type { PlotViewport } from "./geometry";

export interface LabelBox {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
}

export interface LabelSize {
  width: number;
  height: number;
}

export type LabelPlacementMode = "adaptive" | "near-endpoint";

// Mirrors the 0.36rem horizontal and 0.2rem vertical padding on the
// content-sized label chip. Keeping it in the estimate makes both the SVG
// foreignObject and collision box account for the pill around the KaTeX.
const LABEL_CHIP_HORIZONTAL_PADDING = 12;
const LABEL_CHIP_VERTICAL_PADDING = 7;

export function estimateMathLabelSize(
  latexSource: string,
  placement: LabelPlacementMode,
  viewportWidth: number,
): LabelSize {
  const visibleCharacters = latexSource
    .replace(/\\(?:vec|frac|text)/g, "")
    .replace(/[{}]/g, "").length;
  const maximumWidth = Math.max(54, viewportWidth - 8);

  if (placement === "near-endpoint") {
    const contentWidth = Math.max(
      42,
      Math.min(72, 16 + visibleCharacters * 7),
    );
    return {
      width: Math.min(maximumWidth, contentWidth + LABEL_CHIP_HORIZONTAL_PADDING),
      height: 31 + LABEL_CHIP_VERTICAL_PADDING,
    };
  }

  const contentWidth = Math.max(
    56,
    Math.min(138, 20 + visibleCharacters * 8),
  );
  return {
    width: Math.min(maximumWidth, contentWidth + LABEL_CHIP_HORIZONTAL_PADDING),
    height:
      (latexSource.includes("\\frac") ? 41 : 35) +
      LABEL_CHIP_VERTICAL_PADDING,
  };
}

function clampCenter(
  center: Vector2<number>,
  size: LabelSize,
  viewport: PlotViewport,
): Vector2<number> {
  return {
    x: Math.min(
      viewport.right - size.width / 2 - 2,
      Math.max(viewport.left + size.width / 2 + 2, center.x),
    ),
    y: Math.min(
      viewport.bottom - size.height / 2 - 2,
      Math.max(viewport.top + size.height / 2 + 2, center.y),
    ),
  };
}

function overlapArea(
  candidate: Vector2<number>,
  size: LabelSize,
  occupied: LabelBox,
): number {
  const overlapWidth = Math.max(
    0,
    (occupied.width + size.width) / 2 + 3 -
      Math.abs(occupied.centerX - candidate.x),
  );
  const overlapHeight = Math.max(
    0,
    (occupied.height + size.height) / 2 + 2 -
      Math.abs(occupied.centerY - candidate.y),
  );
  return overlapWidth * overlapHeight;
}

/** Choose the least-displaced readable position within a small local radius. */
export function chooseNearbyLabelCenter(
  preferredCenter: Vector2<number>,
  size: LabelSize,
  viewport: PlotViewport,
  occupied: readonly LabelBox[],
  maximumOffset = 28,
): Vector2<number> {
  const radius = Math.max(0, maximumOffset);
  const diagonal = radius * Math.SQRT1_2;
  const offsets: readonly Vector2<number>[] = [
    { x: 0, y: 0 },
    { x: 0, y: -radius },
    { x: 0, y: radius },
    { x: radius, y: 0 },
    { x: -radius, y: 0 },
    { x: diagonal, y: -diagonal },
    { x: -diagonal, y: -diagonal },
    { x: diagonal, y: diagonal },
    { x: -diagonal, y: diagonal },
  ];
  const candidates = offsets.map((offset) =>
    clampCenter(
      {
        x: preferredCenter.x + offset.x,
        y: preferredCenter.y + offset.y,
      },
      size,
      viewport,
    ),
  );

  let best = candidates[0] ?? clampCenter(preferredCenter, size, viewport);
  let bestPenalty = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const overlapPenalty = occupied.reduce(
      (total, box) => total + overlapArea(candidate, size, box),
      0,
    );
    const displacementPenalty =
      Math.hypot(
        candidate.x - preferredCenter.x,
        candidate.y - preferredCenter.y,
      ) * 0.01;
    const penalty = overlapPenalty + displacementPenalty;
    if (penalty < bestPenalty) {
      best = candidate;
      bestPenalty = penalty;
    }
    if (overlapPenalty === 0) {
      break;
    }
  }
  return best;
}
