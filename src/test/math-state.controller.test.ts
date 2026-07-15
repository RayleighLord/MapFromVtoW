import { describe, expect, it, vi } from "vitest";

import type { BasisV, BasisW } from "../types";
import { matrix2 } from "../math/matrix";
import { rational } from "../math/rational";
import { integerVector2, vector2 } from "../math/vector";
import {
  AppController,
  createDefaultAppState,
  parseBasisVFields,
  parseLinearMapFields,
  snapVectorToInteger,
} from "../ui/controller";

const r = rational;

describe("AppController", () => {
  it("starts with the default shear map, vector, and tightly shared bounds", () => {
    const controller = new AppController();
    const view = controller.getViewModel();

    expect(view.state).toEqual(createDefaultAppState());
    expect(view.state.focus).toBe("image-v");
    expect(view.state.basisV).toEqual({
      first: integerVector2(1n, 0n),
      second: integerVector2(0n, 1n),
    });
    expect(view.state.selectedVector).toEqual(integerVector2(2n, 1n));
    expect(view.state.map).toEqual(
      matrix2([r(1n), r(2n)], [r(0n), r(1n)]),
    );
    expect(view.vector?.sourceCoordinates).toEqual(integerVector2(2n, 1n));
    expect(view.vector?.image).toEqual(integerVector2(4n, 1n));
    expect(view.analysis.representation).toEqual(
      matrix2([r(1n, 2n), r(3n, 2n)], [r(-1n, 2n), r(-1n, 2n)]),
    );
    expect(view.state.bounds).toEqual({
      xMin: -5,
      xMax: 5,
      yMin: -5,
      yMax: 5,
    });
  });

  it("publishes complete transitions and retains state on invalid input", () => {
    const controller = new AppController();
    const listener = vi.fn();
    controller.subscribe(listener, false);
    const before = controller.getState();

    expect(() =>
      controller.updateMapFromFields({
        a: "2",
        b: "1/3",
        c: "not-a-number",
        d: "4",
      }),
    ).toThrow();
    expect(controller.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();

    const view = controller.updateMapFromFields({
      a: "2",
      b: "1/3",
      c: "-.5",
      d: "4",
    });
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenLastCalledWith(view);
    expect(view.state.map).toEqual(
      matrix2([r(2n), r(1n, 3n)], [r(-1n, 2n), r(4n)]),
    );
  });

  it("also rejects malformed Rational objects atomically", () => {
    const controller = new AppController();
    const before = controller.getState();
    const invalid = { numerator: 1n, denominator: 0n };
    const invalidMap = [
      [r(1n), r(0n)],
      [r(0n), invalid],
    ] as const;

    expect(() => controller.updateMap(invalidMap)).toThrow(RangeError);
    expect(controller.getState()).toBe(before);
  });

  it("changes coordinates but not ambient images when B_W changes", () => {
    const controller = new AppController();
    const before = controller.getViewModel();
    const basis: BasisW = {
      first: integerVector2(2n, 0n),
      second: integerVector2(0n, 3n),
    };
    const after = controller.updateBasis(basis);

    expect(after.analysis.imageE1).toEqual(before.analysis.imageE1);
    expect(after.analysis.imageE2).toEqual(before.analysis.imageE2);
    expect(after.vector?.image).toEqual(before.vector?.image);
    expect(after.analysis.imageE1Coordinates).not.toEqual(
      before.analysis.imageE1Coordinates,
    );
  });

  it("updates B_V while keeping v ambient and applying F to its chosen vectors", () => {
    const controller = new AppController();
    const before = controller.getViewModel();
    const basisV: BasisV = {
      first: integerVector2(1n, 1n),
      second: integerVector2(-1n, 2n),
    };
    const after = controller.updateBasisV(basisV);

    expect(after.state.map).toEqual(before.state.map);
    expect(after.vector?.source).toEqual(before.vector?.source);
    expect(after.vector?.image).toEqual(before.vector?.image);
    expect(after.analysis.imageE1).toEqual(integerVector2(3n, 1n));
    expect(after.analysis.imageE2).toEqual(integerVector2(3n, 2n));
    expect(after.vector?.sourceCoordinates).toEqual(
      vector2(r(5n, 3n), r(-1n, 3n)),
    );
    expect(after.analysis.representation).not.toEqual(
      before.analysis.representation,
    );
  });

  it("parses and applies B_V transactionally", () => {
    const controller = new AppController();
    const listener = vi.fn();
    controller.subscribe(listener, false);
    const before = controller.getState();

    expect(() =>
      controller.updateBasisVFromFields({
        e1x: "1/2",
        e1y: "bad",
        e2x: "-1",
        e2y: "2",
      }),
    ).toThrow();
    expect(controller.getState()).toBe(before);
    expect(listener).not.toHaveBeenCalled();

    const applied = controller.updateBasisVFromFields({
      e1x: "1/2",
      e1y: ".25",
      e2x: "-1",
      e2y: "2",
    });
    expect(applied.state.basisV).toEqual({
      first: vector2(r(1n, 2n), r(1n, 4n)),
      second: integerVector2(-1n, 2n),
    });
    expect(listener).toHaveBeenCalledOnce();
  });

  it("accepts singular B_V but removes source coordinates and representation", () => {
    const controller = new AppController();
    const singular = controller.updateBasisV({
      first: integerVector2(1n, 2n),
      second: integerVector2(2n, 4n),
    });

    expect(singular.analysis.inverseSourceBasis).toBeNull();
    expect(singular.analysis.representation).toBeNull();
    expect(singular.vector?.source).toEqual(integerVector2(2n, 1n));
    expect(singular.vector?.sourceCoordinates).toBeNull();
    expect(singular.vector?.image).toEqual(integerVector2(4n, 1n));
    expect(singular.vector?.imageCoordinates).not.toBeNull();
    expect(singular.analysis.imageE1).toEqual(integerVector2(5n, 2n));
    expect(singular.analysis.imageE2).toEqual(integerVector2(10n, 4n));
    expect(singular.notices[0]?.text).toContain("Not a basis in V");

    // Output decomposition focus depends only on B_W and remains usable.
    expect(controller.setFocus("image-e2").state.focus).toBe("image-e2");
  });

  it("changes v without changing the representation matrix", () => {
    const controller = new AppController();
    const representation = controller.getViewModel().analysis.representation;
    const after = controller.setSelectedVector(
      vector2(r(3n, 2n), r(-7n, 5n)),
    );

    expect(after.analysis.representation).toEqual(representation);
    expect(after.state.focus).toBe("image-v");
  });

  it("falls back from image-v focus when v is cleared", () => {
    const controller = new AppController();
    const cleared = controller.clearSelectedVector();

    expect(cleared.state.selectedVector).toBeNull();
    expect(cleared.state.focus).toBe("image-e1");
    expect(controller.setFocus("image-v").state.focus).toBe("image-e1");
  });

  it("applies a singular candidate basis and disables focus changes", () => {
    const controller = new AppController();
    controller.setFocus("image-e2");
    const singular = controller.updateBasis({
      first: integerVector2(1n, 2n),
      second: integerVector2(2n, 4n),
    });

    expect(singular.analysis.representation).toBeNull();
    expect(singular.vector?.imageCoordinates).toBeNull();
    expect(singular.notices[0]?.text).toContain("Not a basis");
    expect(controller.setFocus("image-e1").state.focus).toBe("image-e2");

    const recovered = controller.updateBasis({
      first: integerVector2(1n, 0n),
      second: integerVector2(0n, 1n),
    });
    expect(recovered.analysis.representation).not.toBeNull();
    expect(recovered.state.focus).toBe("image-e2");
  });

  it("automatically recomputes tight symmetric bounds after vector changes", () => {
    const controller = new AppController();
    const expanded = controller.setSelectedVector(integerVector2(20n, -3n));

    expect(expanded.state.bounds.xMax).toBeGreaterThan(20);
    expect(expanded.state.bounds).toEqual({
      xMin: -expanded.state.bounds.xMax,
      xMax: expanded.state.bounds.xMax,
      yMin: -expanded.state.bounds.xMax,
      yMax: expanded.state.bounds.xMax,
    });

    const tightened = controller.setSelectedVector(integerVector2(1n, 1n));
    expect(tightened.state.bounds).toEqual({
      xMin: -4,
      xMax: 4,
      yMin: -4,
      yMax: 4,
    });
    expect(controller.fitView().state.bounds).toEqual({
      xMin: -4,
      xMax: 4,
      yMin: -4,
      yMax: 4,
    });
  });

  it("includes a large focused decomposition elbow in linked fitting", () => {
    const controller = new AppController();
    controller.clearSelectedVector();
    controller.updateMap(matrix2([r(0n), r(0n)], [r(1n), r(0n)]));
    const nearlyParallel: BasisW = {
      first: integerVector2(1n, 0n),
      second: vector2(r(1n), r(1n, 100n)),
    };
    const view = controller.updateBasis(nearlyParallel);

    // (0,1) = -100 w1 + 100 w2, so the first component elbow is (-100,0).
    expect(view.analysis.imageE1Coordinates).toEqual(
      vector2(r(-100n), r(100n)),
    );
    expect(view.state.bounds.xMax).toBeGreaterThan(100);
    expect(view.state.bounds.xMax).toBe(view.state.bounds.yMax);
  });

  it("includes chosen B_V endpoints and its source-decomposition elbow", () => {
    const controller = new AppController();
    controller.setSelectedVector(integerVector2(0n, 1n));
    const nearlyParallel: BasisV = {
      first: integerVector2(1n, 0n),
      second: vector2(r(1n), r(1n, 100n)),
    };
    const view = controller.updateBasisV(nearlyParallel);

    // (0,1) = -100 e1 + 100 e2, so the first component elbow is (-100,0).
    expect(view.vector?.sourceCoordinates).toEqual(
      vector2(r(-100n), r(100n)),
    );
    expect(view.state.bounds.xMax).toBeGreaterThan(100);
    expect(view.state.bounds.xMax).toBe(view.state.bounds.yMax);
  });

  it("snaps finite plot clicks to exact integer coordinates", () => {
    expect(snapVectorToInteger(2.49, -3.51)).toEqual(integerVector2(2n, -4n));
    expect(() => snapVectorToInteger(Number.NaN, 2)).toThrow(RangeError);
  });

  it("parses all map fields in matrix row order", () => {
    expect(
      parseLinearMapFields({ a: "1", b: "2", c: "3", d: "4" }),
    ).toEqual(matrix2([r(1n), r(2n)], [r(3n), r(4n)]));
  });

  it("parses B_V fields in column-vector order", () => {
    expect(
      parseBasisVFields({ e1x: "1", e1y: "2", e2x: "3", e2y: "4" }),
    ).toEqual({
      first: integerVector2(1n, 2n),
      second: integerVector2(3n, 4n),
    });
  });
});
