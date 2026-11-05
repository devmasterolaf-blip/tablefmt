/**
 * Turning parsed input into a uniform set of records: plain objects plus
 * the list of keys in the order they were first seen.
 * @module input/records
 */

import { ParseError } from '../errors.js';
import { checkEnum, checkOptions, describe } from '../validate.js';
import { parseCsv } from './csv.js';
import { parseNdjson } from './ndjson.js';

/**
 * @typedef {object} RecordSet
 * @property {string[]} keys field names in first-seen order
 * @property {Record<string, unknown>[]} records
 */

/**
 * @typedef {object} ReadOptions
 * @property {string} [delimiter] CSV field separator (default `,`)
 * @property {boolean} [headerRow] whether the first CSV record (or the
 *   first array of array-shaped JSON) holds the field names (default true
 *   for CSV, false for JSON and NDJSON arrays)
 */

export const INPUT_FORMATS = /** @type {const} */ (['csv', 'json', 'ndjson']);

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Collect objects into a record set.
 * @param {readonly unknown[]} objects
 * @returns {RecordSet}
 * @throws {ParseError} when an element is not an object
 */
export function objectsToRecordSet(objects) {
  /** @type {string[]} */
  const keys = [];
  const seen = new Set();
  const records = objects.map((object, index) => {
    if (!isPlainObject(object)) {
      throw new ParseError(`Expected every record to be an object, but record ${index + 1} is ${describe(object)}`);
    }
    for (const key of Object.keys(object)) {
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
    return object;
  });
  return { keys, records };
}

/**
 * Turn rows of values into a record set. Field names come from the first
 * row when `headerRow` is set, otherwise they are `column1`, `column2`, …
 * Blank names get a positional name and repeated names a numeric suffix,
 * so no field is lost.
 * @param {readonly (readonly unknown[])[]} rows
 * @param {boolean} [headerRow]
 * @returns {RecordSet}
 * @throws {ParseError} when a row is not an array
 */
export function arraysToRecordSet(rows, headerRow = true) {
  rows.forEach((row, index) => {
    if (!Array.isArray(row)) {
      throw new ParseError(`Expected every row to be an array, but row ${index + 1} is ${describe(row)}`);
    }
  });
  const data = headerRow ? rows.slice(1) : rows;
  const titles = headerRow && rows.length > 0 ? rows[0] : [];
  const width = Math.max(titles.length, ...data.map((row) => row.length), 0);
  /** @type {string[]} */
  const keys = [];
  const taken = new Set();
  for (let c = 0; c < width; c++) {
    const title = titles[c] === undefined || titles[c] === null ? '' : String(titles[c]).trim();
    const base = title === '' ? `column${c + 1}` : title;
    let key = base;
    for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
    taken.add(key);
    keys.push(key);
  }
  const records = data.map((row) => {
    /** @type {Record<string, unknown>} */
    const record = {};
    row.forEach((value, c) => {
      record[keys[c]] = value;
    });
    return record;
  });
  return { keys, records };
}

/**
 * Turn a parsed JSON document into a record set. Accepted shapes: an array
 * of objects, an array of arrays, or a single object (one record).
 * @param {unknown} value
 * @param {boolean} [headerRow] for arrays of arrays
 * @returns {RecordSet}
 */
export function valueToRecordSet(value, headerRow = false) {
  if (isPlainObject(value)) return objectsToRecordSet([value]);
  if (!Array.isArray(value)) {
    throw new ParseError(`Expected an array of records or a single object, got ${describe(value)}`);
  }
  return value.length > 0 && value.every(Array.isArray)
    ? arraysToRecordSet(value, headerRow)
    : objectsToRecordSet(value);
}

/**
 * Guess the format of input text: JSON when it parses as one JSON
 * document, NDJSON when it starts like JSON but does not, otherwise CSV.
 * @param {string} text
 * @returns {'csv' | 'json' | 'ndjson'}
 */
export function detectFormat(text) {
  const start = text.replace(/^\u{feff}/u, '').trimStart()[0];
  if (start !== '{' && start !== '[') return 'csv';
  try {
    JSON.parse(text);
    return 'json';
  } catch {
    return start === '{' || /^\s*\[.*\]\s*$/m.test(text) ? 'ndjson' : 'json';
  }
}

/**
 * Parse input text in the given format into a record set.
 * @param {string} text
 * @param {'csv' | 'json' | 'ndjson'} format
 * @param {ReadOptions} [options]
 * @returns {RecordSet}
 * @throws {ParseError}
 */
export function readRecords(text, format, options) {
  const opts = checkOptions('options', options, ['delimiter', 'headerRow']);
  checkEnum('format', format, INPUT_FORMATS);
  if (format === 'csv') {
    return arraysToRecordSet(parseCsv(text, { delimiter: opts.delimiter }), opts.headerRow !== false);
  }
  if (format === 'ndjson') return valueToRecordSet(parseNdjson(text), opts.headerRow === true);
  let value;
  try {
    value = JSON.parse(text.replace(/^\u{feff}/u, ''));
  } catch (error) {
    throw new ParseError(`Invalid JSON: ${/** @type {Error} */ (error).message}`, { format: 'json' });
  }
  return valueToRecordSet(value, opts.headerRow === true);
}
