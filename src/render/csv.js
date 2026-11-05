/**
 * CSV renderer following RFC 4180.
 * @module render/csv
 */

import { OptionError } from '../errors.js';
import { checkEnum, describe } from '../validate.js';
import { stripAnsi } from '../ansi.js';
import { Table } from '../table.js';
import { prepare, flatten } from './prepare.js';

/**
 * @typedef {object} CsvRenderOptions
 * @property {string} [delimiter] field separator, one character (default `,`)
 * @property {string} [newline] record separator, `\r\n` (default) or `\n`
 * @property {'minimal' | 'all'} [quote] quote only the fields that need it
 *   (default) or every field
 */

export const CSV_QUOTE_MODES = /** @type {const} */ (['minimal', 'all']);

/**
 * Check a CSV delimiter: a single character that cannot be confused with
 * quoting or line structure.
 * @param {unknown} delimiter
 * @returns {string}
 */
export function checkDelimiter(delimiter) {
  if (typeof delimiter !== 'string' || [...delimiter].length !== 1) {
    throw new OptionError('delimiter', `expected a single character, got ${describe(delimiter)}`);
  }
  if (delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw new OptionError('delimiter', 'a quote or line break cannot be the delimiter');
  }
  return delimiter;
}

/**
 * Quote one CSV field when it contains the delimiter, a quote or a line
 * break; embedded quotes are doubled.
 * @param {string} field
 * @param {string} [delimiter]
 * @param {boolean} [always] quote even when it is not needed
 * @returns {string}
 */
export function quoteCsvField(field, delimiter = ',', always = false) {
  if (!always && !field.includes(delimiter) && !/["\r\n]/.test(field)) return field;
  return `"${field.replaceAll('"', '""')}"`;
}

/**
 * Render a table as CSV.
 *
 * Header rows are written first, then body rows, then footer rows. Group
 * title rows are left out because they are not records. Spanning cells
 * keep their text in their first slot. ANSI escape sequences are removed
 * and a nested table is written as CSV text inside one quoted field. The
 * result has no trailing line break.
 * @param {Table} table
 * @param {import('../table.js').TableOptions & CsvRenderOptions} [options]
 * @returns {string}
 */
export function renderCsv(table, options) {
  const prepared = prepare(table, options, ['delimiter', 'newline', 'quote']);
  const opts = prepared.options;
  const delimiter = checkDelimiter(opts.delimiter ?? ',');
  const newline = opts.newline ?? '\r\n';
  if (newline !== '\r\n' && newline !== '\n') {
    throw new OptionError('newline', `expected "\\r\\n" or "\\n", got ${describe(newline)}`);
  }
  const always = checkEnum('quote', opts.quote ?? 'minimal', CSV_QUOTE_MODES) === 'all';
  const convert = (/** @type {string | Table} */ content) =>
    content instanceof Table
      ? renderCsv(content, { delimiter, newline, quote: opts.quote, nullText: opts.nullText })
      : stripAnsi(content);
  return flatten(prepared, convert)
    .filter((row) => !row.title)
    .map((row) => row.cells.map((cell) => quoteCsvField(cell, delimiter, always)).join(delimiter))
    .join(newline);
}
