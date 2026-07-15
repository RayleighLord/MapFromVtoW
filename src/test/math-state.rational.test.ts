import { describe, expect, it } from "vitest";

import {
  addRational,
  compareRational,
  divideRational,
  equalRational,
  formatRational,
  MAX_FINITE_MAGNITUDE,
  multiplyRational,
  parseRational,
  rational,
  RationalParseError,
  rationalToNumber,
  subtractRational,
  tryParseRational,
} from "../math/rational";

describe("exact rational arithmetic", () => {
  it.each([
    ["0", 0n, 1n],
    ["-42", -42n, 1n],
    ["+007", 7n, 1n],
    ["1.25", 5n, 4n],
    ["-.5", -1n, 2n],
    ["12.", 12n, 1n],
    ["-6 / -8", 3n, 4n],
    [" +15/25 ", 3n, 5n],
  ])("parses and normalizes %s", (text, numerator, denominator) => {
    expect(parseRational(text)).toEqual({ numerator, denominator });
  });

  it.each([
    "",
    "   ",
    "1e3",
    "Infinity",
    "NaN",
    "1/0",
    "1.5/3",
    "--1",
    ".",
    "1/2/3",
  ])("rejects values outside the exact input grammar: %s", (text) => {
    expect(() => parseRational(text)).toThrow(RationalParseError);
    expect(tryParseRational(text).ok).toBe(false);
  });

  it("normalizes signs, common factors, and zero", () => {
    expect(rational(6n, -8n)).toEqual({ numerator: -3n, denominator: 4n });
    expect(rational(0n, -99n)).toEqual({ numerator: 0n, denominator: 1n });
    expect(() => rational(1n, 0n)).toThrow(RangeError);
  });

  it("performs all field operations without floating-point loss", () => {
    const third = rational(1n, 3n);
    const sixth = rational(1n, 6n);

    expect(addRational(third, sixth)).toEqual(rational(1n, 2n));
    expect(subtractRational(third, sixth)).toEqual(rational(1n, 6n));
    expect(multiplyRational(third, rational(9n, 2n))).toEqual(
      rational(3n, 2n),
    );
    expect(divideRational(third, sixth)).toEqual(rational(2n));
    expect(() => divideRational(third, rational(0n))).toThrow(RangeError);
    expect(equalRational(rational(2n, 4n), rational(1n, 2n))).toBe(true);
    expect(compareRational(rational(-1n, 2n), rational(1n, 3n))).toBe(-1);
    expect(formatRational(rational(-6n, 8n))).toBe("-3/4");
  });

  it("converts huge exact values to finite plotting values", () => {
    const balancedHuge = rational(10n ** 1000n, 10n ** 999n);
    const unboundedHuge = rational(10n ** 1000n);

    expect(rationalToNumber(balancedHuge)).toBeCloseTo(10);
    expect(rationalToNumber(unboundedHuge)).toBe(MAX_FINITE_MAGNITUDE);
    expect(Number.isFinite(rationalToNumber(unboundedHuge))).toBe(true);
  });
});

