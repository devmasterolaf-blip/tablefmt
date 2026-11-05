/**
 * Small option-validation helpers shared by the public entry points.
 * @module validate
 */

import { OptionError } from './errors.js';

/**
 * Describe a value for use in an error message.
 * @param {unknown} value
 * @returns {string}
 */
export function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return typeof value === 'object' ? 'an object' : typeof value;
}

/**
 * Check that `value` is an integer within optional bounds.
 * @param {string} name
 * @param {unknown} value
 * @param {{min?: number, max?: number}} [bounds]
 * @returns {number}
 */
export function checkInteger(name, value, { min = -Infinity, max = Infinity } = {}) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new OptionError(name, `expected an integer, got ${describe(value)}`);
  }
  if (value < min || value > max) {
    const range = max === Infinity ? `>= ${min}` : `between ${min} and ${max}`;
    throw new OptionError(name, `expected an integer ${range}, got ${value}`);
  }
  return value;
}

/**
 * Check that `value` is one of the allowed strings.
 * @template {string} T
 * @param {string} name
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @returns {T}
 */
export function checkEnum(name, value, allowed) {
  if (typeof value !== 'string' || !allowed.includes(/** @type {T} */ (value))) {
    const hint = typeof value === 'string' ? suggest(value, allowed) : undefined;
    throw new OptionError(
      name,
      `expected one of ${allowed.join(', ')}, got ${describe(value)}` +
        (hint ? ` (did you mean "${hint}"?)` : ''),
    );
  }
  return /** @type {T} */ (value);
}

/**
 * Check that `value` is a plain options object and has no unknown keys.
 * @param {string} name
 * @param {unknown} value
 * @param {readonly string[]} known
 * @returns {Record<string, any>}
 */
export function checkOptions(name, value, known) {
  if (value === undefined) return {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new OptionError(name, `expected an options object, got ${describe(value)}`);
  }
  for (const key of Object.keys(value)) {
    if (!known.includes(key)) {
      const hint = suggest(key, known);
      throw new OptionError(
        name === 'options' ? key : `${name}.${key}`,
        `unknown option${hint ? ` (did you mean "${hint}"?)` : ''}`,
      );
    }
  }
  return /** @type {Record<string, any>} */ (value);
}

/**
 * Find the closest candidate to `input` by edit distance, if it is close
 * enough to be a plausible typo.
 * @param {string} input
 * @param {readonly string[]} candidates
 * @returns {string | undefined}
 */
export function suggest(input, candidates) {
  let best;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = editDistance(input.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  // A transposition costs two edits, so allow two for anything but very short names.
  const limit = input.length <= 3 ? 1 : 2;
  return bestDistance <= limit ? best : undefined;
}

/**
 * Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function editDistance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[b.length];
}
