/**
 * Newline-delimited JSON parser.
 * @module input/ndjson
 */

import { ParseError } from '../errors.js';

/**
 * Parse newline-delimited JSON: one JSON value per line. Blank lines are
 * skipped.
 * @param {string} text
 * @returns {unknown[]}
 * @throws {ParseError} naming the line that is not valid JSON
 */
export function parseNdjson(text) {
  if (typeof text !== 'string') throw new ParseError('NDJSON input must be a string', { format: 'ndjson' });
  /** @type {unknown[]} */
  const values = [];
  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((line, index) => {
    const source = index === 0 ? line.replace(/^\u{feff}/u, '') : line;
    if (source.trim() === '') return;
    try {
      values.push(JSON.parse(source));
    } catch (error) {
      throw new ParseError(`Invalid JSON: ${/** @type {Error} */ (error).message}`, {
        line: index + 1,
        format: 'ndjson',
      });
    }
  });
  return values;
}
