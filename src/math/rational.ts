import type { Rational } from "../types";

const INTEGER_PATTERN = /^[+-]?\d+$/;
const DECIMAL_PATTERN = /^[+-]?(?:\d+\.\d*|\.\d+)$/;
const FRACTION_PATTERN = /^([+-]?\d+)\s*\/\s*([+-]?\d+)$/;

/** A conservative finite clamp used by the SVG-facing numeric conversion. */
export const MAX_FINITE_MAGNITUDE = 1e300;

export class RationalParseError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "RationalParseError";
  }
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = absolute(left);
  let b = absolute(right);

  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }

  return a;
}

/** Creates a reduced rational with a positive denominator. */
export function rational(numerator: bigint, denominator = 1n): Rational {
  if (denominator === 0n) {
    throw new RangeError("A rational denominator cannot be zero.");
  }

  if (numerator === 0n) {
    return Object.freeze({ numerator: 0n, denominator: 1n });
  }

  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);

  return Object.freeze({
    numerator: (sign * numerator) / divisor,
    denominator: (sign * denominator) / divisor,
  });
}

export const ZERO = rational(0n);
export const ONE = rational(1n);

export function normalizeRational(value: Rational): Rational {
  if (
    typeof value.numerator !== "bigint" ||
    typeof value.denominator !== "bigint"
  ) {
    throw new TypeError("Rational parts must be bigint values.");
  }

  return rational(value.numerator, value.denominator);
}

/**
 * Parses an exact signed integer, finite base-10 decimal, or integer fraction.
 * Scientific notation is deliberately not part of this grammar.
 */
export function parseRational(source: string): Rational {
  const text = source.trim();

  if (text.length === 0) {
    throw new RationalParseError("Enter a number.");
  }

  if (INTEGER_PATTERN.test(text)) {
    return rational(BigInt(text));
  }

  if (DECIMAL_PATTERN.test(text)) {
    const sign = text.startsWith("-") ? -1n : 1n;
    const unsigned = text.startsWith("-") || text.startsWith("+")
      ? text.slice(1)
      : text;
    const [integerPart = "", fractionalPart = ""] = unsigned.split(".");
    const integerDigits = integerPart.length === 0 ? "0" : integerPart;
    const combinedDigits = `${integerDigits}${fractionalPart}`;
    const denominator = 10n ** BigInt(fractionalPart.length);

    return rational(sign * BigInt(combinedDigits), denominator);
  }

  const fraction = FRACTION_PATTERN.exec(text);
  if (fraction !== null) {
    try {
      return rational(BigInt(fraction[1]!), BigInt(fraction[2]!));
    } catch (error) {
      if (error instanceof RangeError) {
        throw new RationalParseError("A fraction denominator cannot be zero.");
      }
      throw error;
    }
  }

  throw new RationalParseError(
    "Use an integer, a terminating decimal, or a fraction such as -3/4.",
  );
}

export type RationalParseResult =
  | { ok: true; value: Rational }
  | { ok: false; error: RationalParseError };

export function tryParseRational(source: string): RationalParseResult {
  try {
    return { ok: true, value: parseRational(source) };
  } catch (error) {
    if (error instanceof RationalParseError) {
      return { ok: false, error };
    }
    throw error;
  }
}

export function addRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtractRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiplyRational(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

export function divideRational(left: Rational, right: Rational): Rational {
  if (right.numerator === 0n) {
    throw new RangeError("Cannot divide by zero.");
  }

  return rational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

export function negateRational(value: Rational): Rational {
  return rational(-value.numerator, value.denominator);
}

export function absoluteRational(value: Rational): Rational {
  return rational(absolute(value.numerator), value.denominator);
}

export function equalRational(left: Rational, right: Rational): boolean {
  return (
    left.numerator * right.denominator ===
    right.numerator * left.denominator
  );
}

export function compareRational(left: Rational, right: Rational): -1 | 0 | 1 {
  const difference =
    left.numerator * right.denominator -
    right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function isZeroRational(value: Rational): boolean {
  return value.numerator === 0n;
}

export function formatRational(value: Rational): string {
  const normalized = normalizeRational(value);
  return normalized.denominator === 1n
    ? normalized.numerator.toString()
    : `${normalized.numerator}/${normalized.denominator}`;
}

/**
 * Converts exact arithmetic to a finite plotting number. Extremely large values
 * are clamped instead of leaking Infinity or NaN into SVG attributes.
 */
export function rationalToNumber(value: Rational): number {
  if (value.numerator === 0n) {
    return 0;
  }

  const direct = Number(value.numerator) / Number(value.denominator);
  if (Number.isFinite(direct)) {
    return Math.max(-MAX_FINITE_MAGNITUDE, Math.min(MAX_FINITE_MAGNITUDE, direct));
  }

  const sign = value.numerator < 0n ? -1 : 1;
  const numeratorText = absolute(value.numerator).toString();
  const denominatorText = absolute(value.denominator).toString();
  const precision = 16;
  const numeratorDigits = numeratorText.slice(0, precision);
  const denominatorDigits = denominatorText.slice(0, precision);
  const exponent =
    numeratorText.length - numeratorDigits.length -
    (denominatorText.length - denominatorDigits.length);
  const approximate =
    (Number(numeratorDigits) / Number(denominatorDigits)) * 10 ** exponent;

  if (!Number.isFinite(approximate)) {
    return sign * MAX_FINITE_MAGNITUDE;
  }

  return sign * Math.min(MAX_FINITE_MAGNITUDE, approximate);
}
