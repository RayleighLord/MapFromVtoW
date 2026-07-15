import type { Rational, Vector2 } from "../types";
import {
  addRational,
  equalRational,
  multiplyRational,
  normalizeRational,
  rational,
} from "./rational";

export function vector2(x: Rational, y: Rational): Vector2<Rational> {
  return Object.freeze({
    x: normalizeRational(x),
    y: normalizeRational(y),
  });
}

export function integerVector2(x: bigint, y: bigint): Vector2<Rational> {
  return vector2(rational(x), rational(y));
}

export function normalizeVector2(
  value: Vector2<Rational>,
): Vector2<Rational> {
  return vector2(value.x, value.y);
}

export function addVector2(
  left: Vector2<Rational>,
  right: Vector2<Rational>,
): Vector2<Rational> {
  return vector2(
    addRational(left.x, right.x),
    addRational(left.y, right.y),
  );
}

export function scaleVector2(
  scalar: Rational,
  value: Vector2<Rational>,
): Vector2<Rational> {
  return vector2(
    multiplyRational(scalar, value.x),
    multiplyRational(scalar, value.y),
  );
}

export function equalVector2(
  left: Vector2<Rational>,
  right: Vector2<Rational>,
): boolean {
  return equalRational(left.x, right.x) && equalRational(left.y, right.y);
}

