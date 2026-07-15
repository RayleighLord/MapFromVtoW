import { describe, expect, it } from "vitest";

import type { BasisV, BasisW } from "../types";
import { analyzeMap, analyzeVector } from "../math/analysis";
import {
  determinantMatrix2,
  inverseMatrix2,
  matrix2,
  multiplyMatrix2,
  multiplyMatrixVector2,
} from "../math/matrix";
import { rational } from "../math/rational";
import { equalVector2, integerVector2, vector2 } from "../math/vector";

const r = rational;

describe("2×2 exact linear algebra", () => {
  it("computes determinant, inverse, and identity product exactly", () => {
    const matrix = matrix2([r(1n), r(-1n)], [r(1n), r(1n)]);
    const inverse = inverseMatrix2(matrix);

    expect(determinantMatrix2(matrix)).toEqual(r(2n));
    expect(inverse).toEqual(
      matrix2([r(1n, 2n), r(1n, 2n)], [r(-1n, 2n), r(1n, 2n)]),
    );
    expect(inverse).not.toBeNull();
    expect(multiplyMatrix2(inverse!, matrix)).toEqual(
      matrix2([r(1n), r(0n)], [r(0n), r(1n)]),
    );
  });

  it("returns null rather than a pseudoinverse for a singular matrix", () => {
    const singular = matrix2([r(1n), r(2n)], [r(2n), r(4n)]);
    expect(determinantMatrix2(singular)).toEqual(r(0n));
    expect(inverseMatrix2(singular)).toBeNull();
  });
});

describe("map and basis analysis", () => {
  const defaultBasis: BasisW = {
    first: integerVector2(1n, 1n),
    second: integerVector2(-1n, 1n),
  };

  it("produces the planned default representation for the identity map", () => {
    const identity = matrix2([r(1n), r(0n)], [r(0n), r(1n)]);
    const analysis = analyzeMap(identity, defaultBasis);

    expect(analysis.representation).toEqual(
      matrix2([r(1n, 2n), r(1n, 2n)], [r(-1n, 2n), r(1n, 2n)]),
    );
    expect(analysis.imageE1).toEqual(integerVector2(1n, 0n));
    expect(analysis.imageE2).toEqual(integerVector2(0n, 1n));
    expect(analysis.imageE1Coordinates).toEqual(
      vector2(r(1n, 2n), r(-1n, 2n)),
    );
  });

  it("computes P_W⁻¹ F P_V and images the chosen source-basis vectors", () => {
    const map = matrix2([r(2n), r(1n)], [r(3n), r(-1n)]);
    const basisV: BasisV = {
      first: integerVector2(1n, 1n),
      second: integerVector2(-1n, 2n),
    };
    const analysis = analyzeMap(map, basisV, defaultBasis);

    expect(analysis.sourceBasisMatrix).toEqual(
      matrix2([r(1n), r(-1n)], [r(1n), r(2n)]),
    );
    expect(analysis.sourceDeterminant).toEqual(r(3n));
    expect(analysis.imageE1).toEqual(integerVector2(3n, 2n));
    expect(analysis.imageE2).toEqual(integerVector2(0n, -5n));
    expect(analysis.representation).toEqual(
      matrix2(
        [r(5n, 2n), r(-5n, 2n)],
        [r(-1n, 2n), r(-5n, 2n)],
      ),
    );
  });

  it("gives an ambient vector exact B_V and B_W coordinates", () => {
    const map = matrix2([r(2n), r(1n)], [r(3n), r(-1n)]);
    const basisV: BasisV = {
      first: integerVector2(1n, 1n),
      second: integerVector2(-1n, 2n),
    };
    const vector = analyzeVector(
      map,
      basisV,
      defaultBasis,
      integerVector2(2n, 1n),
    );

    expect(vector.source).toEqual(integerVector2(2n, 1n));
    expect(vector.sourceCoordinates).toEqual(
      vector2(r(5n, 3n), r(-1n, 3n)),
    );
    expect(vector.image).toEqual(integerVector2(5n, 5n));
    expect(vector.imageCoordinates).toEqual(integerVector2(5n, 0n));
  });

  it("preserves P_W M c = F P_V c for a custom B_V", () => {
    const map = matrix2(
      [r(1n, 3n), r(-5n, 4n)],
      [r(7n, 6n), r(2n, 5n)],
    );
    const basisV: BasisV = {
      first: vector2(r(2n), r(1n, 3n)),
      second: vector2(r(-1n, 2n), r(5n, 4n)),
    };
    const basisW: BasisW = {
      first: vector2(r(2n, 3n), r(1n, 2n)),
      second: vector2(r(-3n, 5n), r(4n, 7n)),
    };
    const coordinates = vector2(r(-9n, 8n), r(11n, 3n));
    const analysis = analyzeMap(map, basisV, basisW);

    expect(analysis.representation).not.toBeNull();
    const outputViaRepresentation = multiplyMatrixVector2(
      analysis.basisMatrix,
      multiplyMatrixVector2(analysis.representation!, coordinates),
    );
    const ambientSource = multiplyMatrixVector2(
      analysis.sourceBasisMatrix,
      coordinates,
    );
    const outputViaAmbientMap = multiplyMatrixVector2(map, ambientSource);
    expect(equalVector2(outputViaRepresentation, outputViaAmbientMap)).toBe(
      true,
    );
  });

  it("supports fractional coefficients and preserves P_W(Mv) = Av", () => {
    const map = matrix2(
      [r(1n, 3n), r(-5n, 4n)],
      [r(7n, 6n), r(2n, 5n)],
    );
    const basis: BasisW = {
      first: vector2(r(2n, 3n), r(1n, 2n)),
      second: vector2(r(-3n, 5n), r(4n, 7n)),
    };
    const source = vector2(r(-9n, 8n), r(11n, 3n));
    const analysis = analyzeMap(map, basis);
    const vector = analyzeVector(map, basis, source);

    expect(analysis.representation).not.toBeNull();
    expect(vector.imageCoordinates).not.toBeNull();
    const coordinatesViaRepresentation = multiplyMatrixVector2(
      analysis.representation!,
      source,
    );
    expect(vector.imageCoordinates).toEqual(coordinatesViaRepresentation);
    const reconstructed = multiplyMatrixVector2(
      analysis.basisMatrix,
      coordinatesViaRepresentation,
    );
    expect(equalVector2(reconstructed, vector.image)).toBe(true);
  });

  it("keeps zero and rank-deficient maps valid", () => {
    const zero = matrix2([r(0n), r(0n)], [r(0n), r(0n)]);
    const rankOne = matrix2([r(1n), r(2n)], [r(2n), r(4n)]);

    expect(analyzeMap(zero, defaultBasis).representation).toEqual(zero);
    expect(analyzeMap(rankOne, defaultBasis).representation).not.toBeNull();
  });

  it("marks a dependent candidate B_W without hiding ambient images", () => {
    const map = matrix2([r(3n), r(4n)], [r(5n), r(6n)]);
    const singularBasis: BasisW = {
      first: integerVector2(1n, 2n),
      second: integerVector2(2n, 4n),
    };
    const analysis = analyzeMap(map, singularBasis);
    const vector = analyzeVector(map, singularBasis, integerVector2(2n, -1n));

    expect(analysis.inverseBasis).toBeNull();
    expect(analysis.representation).toBeNull();
    expect(analysis.imageE1).toEqual(integerVector2(3n, 5n));
    expect(analysis.imageE2).toEqual(integerVector2(4n, 6n));
    expect(vector.image).toEqual(integerVector2(2n, 4n));
    expect(vector.imageCoordinates).toBeNull();
  });

  it("marks a dependent B_V while retaining ambient images and B_W coordinates", () => {
    const map = matrix2([r(2n), r(1n)], [r(3n), r(-1n)]);
    const singularBasisV: BasisV = {
      first: integerVector2(1n, 2n),
      second: integerVector2(2n, 4n),
    };
    const analysis = analyzeMap(map, singularBasisV, defaultBasis);
    const vector = analyzeVector(
      map,
      singularBasisV,
      defaultBasis,
      integerVector2(2n, 1n),
    );

    expect(analysis.inverseSourceBasis).toBeNull();
    expect(analysis.representation).toBeNull();
    expect(analysis.imageE1).toEqual(integerVector2(4n, 1n));
    expect(analysis.imageE2).toEqual(integerVector2(8n, 2n));
    expect(analysis.imageE1Coordinates).toEqual(
      vector2(r(5n, 2n), r(-3n, 2n)),
    );
    expect(vector.sourceCoordinates).toBeNull();
    expect(vector.image).toEqual(integerVector2(5n, 5n));
    expect(vector.imageCoordinates).toEqual(integerVector2(5n, 0n));
  });
});
