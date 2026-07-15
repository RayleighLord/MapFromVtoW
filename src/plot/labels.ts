import type { Rational } from "../types";

export function formatRationalForPlot(value: Rational): string {
  if (value.denominator === 0n) {
    return "undefined";
  }
  const denominatorIsNegative = value.denominator < 0n;
  const numerator = denominatorIsNegative ? -value.numerator : value.numerator;
  const denominator = denominatorIsNegative ? -value.denominator : value.denominator;
  return denominator === 1n ? String(numerator) : `${numerator}/${denominator}`;
}

export function formatRationalForLatex(value: Rational): string {
  if (value.denominator === 0n) {
    return "\\text{undefined}";
  }
  const denominatorIsNegative = value.denominator < 0n;
  const numerator = denominatorIsNegative ? -value.numerator : value.numerator;
  const denominator = denominatorIsNegative ? -value.denominator : value.denominator;
  if (denominator === 1n) {
    return String(numerator);
  }

  const sign = numerator < 0n ? "-" : "";
  const magnitude = numerator < 0n ? -numerator : numerator;
  return `${sign}\\frac{${magnitude}}{${denominator}}`;
}

export function formatComponentForLatex(
  coefficient: Rational,
  vectorLatex: string,
): string {
  return `${formatRationalForLatex(coefficient)}${vectorLatex}`;
}
