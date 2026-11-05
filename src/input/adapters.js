/**
 * Building tables from data: arrays of objects, arrays of arrays, and
 * CSV, JSON or NDJSON text.
 * @module input/adapters
 */

import { OptionError } from '../errors.js';
import { describe } from '../validate.js';
import { Table, checkTableOptions, TABLE_OPTION_KEYS } from '../table.js';
import { splitDecimal } from '../decimal.js';
import { objectsToRecordSet, arraysToRecordSet, readRecords } from './records.js';

/** @typedef {import('./records.js').RecordSet} RecordSet */
/** @typedef {import('../columns.js').ColumnOptions} ColumnOptions */
/** @typedef {import('../table.js').TableOptions} TableOptions */

/**
 * @typedef {object} AdapterOptions
 * @property {(string | ColumnOptions)[]} [columns] the columns to show, in
 *   order, as keys or full column definitions; inferred from the data when
 *   omitted
 */

/**
 * Whether a value looks like a number: a number, a bigint, or a string
 * such as `12`, `-3.5`, `1,234.50`, `1e6` or `45%`.
 * @param {unknown} value
 * @returns {boolean}
 */
export function isNumeric(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'bigint') return true;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return /\d/.test(text) && splitDecimal(text) !== undefined;
}

/**
 * Infer column definitions from a record set: one column per key, titled
 * with the key. A column whose non-empty values all look numeric is
 * right-aligned.
 * @param {RecordSet} set
 * @returns {ColumnOptions[]}
 */
export function inferColumns(set) {
  return set.keys.map((key) => {
    let filled = 0;
    let numeric = 0;
    for (const record of set.records) {
      const value = record[key];
      if (value === undefined || value === null || value === '') continue;
      filled++;
      if (isNumeric(value)) numeric++;
    }
    return { key, title: key, align: filled > 0 && numeric === filled ? 'right' : 'left' };
  });
}

/**
 * Build a table from a record set.
 * @param {RecordSet} set
 * @param {TableOptions & AdapterOptions} [options]
 * @returns {Table}
 */
export function fromRecordSet(set, options) {
  const { columns: wanted, ...tableOptions } = checkTableOptions(options, TABLE_OPTION_KEYS);
  const inferred = inferColumns(set);
  let columns = inferred;
  if (wanted !== undefined) {
    if (!Array.isArray(wanted)) throw new OptionError('columns', `expected an array, got ${describe(wanted)}`);
    const byKey = new Map(inferred.map((column) => [column.key, column]));
    columns = wanted.map((entry, index) => {
      const given = typeof entry === 'string' ? { key: entry } : entry;
      if (given === null || typeof given !== 'object' || typeof given.key !== 'string') {
        throw new OptionError(`columns[${index}]`, 'expected a key or a column definition with a key');
      }
      return { ...byKey.get(given.key), ...given };
    });
  }
  const table = new Table({ ...tableOptions, columns });
  for (const record of set.records) {
    // Wrapped so that a data value that happens to have a `content`
    // property is not mistaken for cell options.
    table.row(columns.map((column) => ({ content: record[/** @type {string} */ (column.key)] })));
  }
  return table;
}

/**
 * Build a table from an array of objects. Columns are the union of the
 * objects' keys unless `columns` selects them.
 * @param {readonly Record<string, unknown>[]} objects
 * @param {TableOptions & AdapterOptions} [options]
 * @returns {Table}
 */
export function fromObjects(objects, options) {
  if (!Array.isArray(objects)) throw new OptionError('objects', `expected an array, got ${describe(objects)}`);
  return fromRecordSet(objectsToRecordSet(objects), options);
}

/**
 * Build a table from an array of arrays.
 * @param {readonly (readonly unknown[])[]} rows
 * @param {TableOptions & AdapterOptions & {headerRow?: boolean}} [options]
 *   `headerRow` (default true) takes the column titles from the first row
 * @returns {Table}
 */
export function fromArrays(rows, options) {
  if (!Array.isArray(rows)) throw new OptionError('rows', `expected an array, got ${describe(rows)}`);
  const { headerRow, ...rest } = checkTableOptions(options, [...TABLE_OPTION_KEYS, 'headerRow']);
  const table = fromRecordSet(arraysToRecordSet(rows, headerRow !== false), rest);
  // Positional names are not worth showing as a header.
  if (headerRow === false && rest.columns === undefined && rest.header === undefined) table.options.header = false;
  return table;
}

/**
 * Build a table from text in a given format.
 * @param {'csv' | 'json' | 'ndjson'} format
 * @param {string} text
 * @param {Record<string, any> | undefined} options
 * @returns {Table}
 */
function fromText(format, text, options) {
  const { delimiter, headerRow, ...rest } = checkTableOptions(options, [...TABLE_OPTION_KEYS, 'delimiter', 'headerRow']);
  const readOptions = format === 'csv' ? { delimiter, headerRow } : { headerRow };
  if (format !== 'csv' && delimiter !== undefined) {
    throw new OptionError('delimiter', 'only CSV input has a delimiter');
  }
  return fromRecordSet(readRecords(text, format, readOptions), rest);
}

/**
 * Build a table from CSV text. The first record holds the column titles
 * unless `headerRow` is false.
 * @param {string} text
 * @param {TableOptions & AdapterOptions & {delimiter?: string, headerRow?: boolean}} [options]
 * @returns {Table}
 */
export function fromCsv(text, options) {
  return fromText('csv', text, options);
}

/**
 * Build a table from a JSON document: an array of objects, an array of
 * arrays, or one object.
 * @param {string} text
 * @param {TableOptions & AdapterOptions & {headerRow?: boolean}} [options]
 * @returns {Table}
 */
export function fromJson(text, options) {
  return fromText('json', text, options);
}

/**
 * Build a table from newline-delimited JSON.
 * @param {string} text
 * @param {TableOptions & AdapterOptions & {headerRow?: boolean}} [options]
 * @returns {Table}
 */
export function fromNdjson(text, options) {
  return fromText('ndjson', text, options);
}
