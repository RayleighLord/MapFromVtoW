import type { Matrix2, Rational, Vector2 } from "../types";
import {
  addRational,
  divideRational,
  isZeroRational,
  multiplyRational,
  negateRational,
  normalizeRational,
  ONE,
  subtractRational,
  ZERO,
} from "./rational";
import { vector2 } from "./vector";

export function matrix2(
  row1: readonly [Rational, Rational],
  row2: readonly [Rational, Rational],
): Matrix2<Rational> {
  const first: readonly [Rational, Rational] = Object.freeze([
    normalizeRational(row1[0]),
    normalizeRational(row1[1]),
  ]);
  const second: readonly [Rational, Rational] = Object.freeze([
    normalizeRational(row2[0]),
    normalizeRational(row2[1]),
  ]);
  return Object.freeze([first, second]);
}

export function normalizeMatrix2(value: Matrix2<Rational>): Matrix2<Rational> {
  return matrix2(value[0], value[1]);
}

export const IDENTITY_MATRIX_2 = matrix2([ONE, ZERO], [ZERO, ONE]);

export function determinantMatrix2(matrix: Matrix2<Rational>): Rational {
  return subtractRational(
    multiplyRational(matrix[0][0], matrix[1][1]),
    multiplyRational(matrix[0][1], matrix[1][0]),
  );
}

export function inverseMatrix2(
  matrix: Matrix2<Rational>,
): Matrix2<Rational> | null {
  const determinant = determinantMatrix2(matrix);
  if (isZeroRational(determinant)) {
    return null;
  }

  return matrix2(
    [
      divideRational(matrix[1][1], determinant),
      divideRational(negateRational(matrix[0][1]), determinant),
    ],
    [
      divideRational(negateRational(matrix[1][0]), determinant),
      divideRational(matrix[0][0], determinant),
    ],
  );
}

export function multiplyMatrix2(
  left: Matrix2<Rational>,
  right: Matrix2<Rational>,
): Matrix2<Rational> {
  return matrix2(
    [
      addRational(
        multiplyRational(left[0][0], right[0][0]),
        multiplyRational(left[0][1], right[1][0]),
      ),
      addRational(
        multiplyRational(left[0][0], right[0][1]),
        multiplyRational(left[0][1], right[1][1]),
      ),
    ],
    [
      addRational(
        multiplyRational(left[1][0], right[0][0]),
        multiplyRational(left[1][1], right[1][0]),
      ),
      addRational(
        multiplyRational(left[1][0], right[0][1]),
        multiplyRational(left[1][1], right[1][1]),
      ),
    ],
  );
}

export function multiplyMatrixVector2(
  matrix: Matrix2<Rational>,
  value: Vector2<Rational>,
): Vector2<Rational> {
  return vector2(
    addRational(
      multiplyRational(matrix[0][0], value.x),
      multiplyRational(matrix[0][1], value.y),
    ),
    addRational(
      multiplyRational(matrix[1][0], value.x),
      multiplyRational(matrix[1][1], value.y),
    ),
  );
}

export function matrixColumn2(
  matrix: Matrix2<Rational>,
  column: 0 | 1,
): Vector2<Rational> {
  return vector2(matrix[0][column], matrix[1][column]);
}
