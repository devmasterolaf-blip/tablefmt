/**
 * Decimal-point alignment for columns of numbers.
 * @module decimal
 */

import { stripAnsi } from './ansi.js';
import { plainWidth } from './width.js';

// Optional sign, digits with thousands separators, optional fraction,
// optional exponent, optional percent sign.
const NUMERIC = /^([+-]?(?:\d[\d,]*)?)((?:\.\d+)?(?:e[+-]?\d+)?%?)$/i;

/**
 * Split a numeric string at its decimal point.
 * @param {string} text plain text, already trimmed
 * @returns {[string, string] | undefined} integer part and the rest, or
 *   undefined when the text is not a number
 */
export function splitDecimal(text) {
  const match = NUMERIC.exec(text);
  if (!match || !/\d/.test(text)) return undefined;
  return [match[1], match[2]];
}

/**
 * Pad a list of single-line strings so that the decimal points of the
 * numeric entries line up. Numeric entries all come out equally wide;
 * entries that are not numbers are returned unchanged. Escape sequences
 * around a number are kept.
 * @param {readonly string[]} values
 * @returns {string[]}
 */
export function alignDecimal(values) {
  const parts = values.map((value) => splitDecimal(stripAnsi(value).trim()));
  let integerWidth = 0;
  let fractionWidth = 0;
  for (const part of parts) {
    if (!part) continue;
    integerWidth = Math.max(integerWidth, plainWidth(part[0]));
    fractionWidth = Math.max(fractionWidth, plainWidth(part[1]));
  }
  return values.map((value, index) => {
    const part = parts[index];
    if (!part) return value;
    return (
      ' '.repeat(integerWidth - plainWidth(part[0])) +
      value.trim() +
      ' '.repeat(fractionWidth - plainWidth(part[1]))
    );
  });
}
