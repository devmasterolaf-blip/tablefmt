/**
 * Column definitions: validation and defaults.
 * @module columns
 */

import { OptionError } from './errors.js';
import { checkEnum, checkInteger, checkOptions, describe } from './validate.js';
import { styleToSgr } from './style.js';
import { ELLIPSIS, TRUNCATE_POSITIONS } from './text.js';

/**
 * @typedef {object} ColumnOptions
 * @property {string} [key] property name used for object rows and by the adapters
 * @property {string} [title] header text; defaults to the key
 * @property {number} [width] fixed content width in columns
 * @property {number} [minWidth] smallest content width the column may shrink to
 * @property {number} [maxWidth] largest content width the column may take
 * @property {number} [flex] weight for sharing spare or missing width; 0 pins
 *   the column at its preferred width (default 1)
 * @property {'left' | 'right' | 'center' | 'decimal'} [align] body alignment (default left)
 * @property {'left' | 'right' | 'center'} [headerAlign] header alignment;
 *   defaults to `align`, or right for decimal columns
 * @property {'top' | 'middle' | 'bottom'} [valign] vertical alignment in tall rows (default top)
 * @property {(value: any, context: {row: number, column: Column}) => any} [format]
 *   converts a body value to display text
 * @property {'word' | 'hard' | 'none'} [wrap] how content wider than the
 *   column is handled; `none` truncates each line (default word)
 * @property {'start' | 'middle' | 'end'} [truncate] where the ellipsis goes when `wrap` is `none`
 * @property {string} [ellipsis] truncation marker (default `…`)
 * @property {import('./style.js').Style} [style] style for the body cells of the column
 */

/**
 * @typedef {object} Column a normalised column definition
 * @property {string | undefined} key
 * @property {string | undefined} title
 * @property {number | undefined} width
 * @property {number | undefined} minWidth
 * @property {number | undefined} maxWidth
 * @property {number} flex
 * @property {'left' | 'right' | 'center' | 'decimal'} align
 * @property {'left' | 'right' | 'center'} headerAlign
 * @property {'top' | 'middle' | 'bottom'} valign
 * @property {((value: any, context: {row: number, column: Column}) => any) | undefined} format
 * @property {'word' | 'hard' | 'none'} wrap
 * @property {'start' | 'middle' | 'end'} truncate
 * @property {string} ellipsis
 * @property {string} sgr canonical SGR state compiled from `style`
 */

export const COLUMN_ALIGNMENTS = /** @type {const} */ (['left', 'right', 'center', 'decimal']);
export const CELL_ALIGNMENTS = /** @type {const} */ (['left', 'right', 'center']);
export const VERTICAL_ALIGNMENTS = /** @type {const} */ (['top', 'middle', 'bottom']);
export const COLUMN_WRAP_MODES = /** @type {const} */ (['word', 'hard', 'none']);

const COLUMN_KEYS = [
  'key', 'title', 'width', 'minWidth', 'maxWidth', 'flex', 'align', 'headerAlign', 'valign',
  'format', 'wrap', 'truncate', 'ellipsis', 'style',
];

/**
 * Validate one column definition and fill in defaults.
 * @param {ColumnOptions | string} input a definition, or just a key
 * @param {number} index position, used in error messages
 * @returns {Column}
 */
export function normalizeColumn(input, index) {
  const name = `columns[${index}]`;
  if (typeof input === 'string') input = { key: input };
  const options = checkOptions(name, input ?? {}, COLUMN_KEYS);
  for (const field of ['key', 'title', 'ellipsis']) {
    if (options[field] !== undefined && typeof options[field] !== 'string') {
      throw new OptionError(`${name}.${field}`, `expected a string, got ${describe(options[field])}`);
    }
  }
  for (const field of ['width', 'minWidth', 'maxWidth']) {
    if (options[field] !== undefined) checkInteger(`${name}.${field}`, options[field], { min: 1 });
  }
  if (options.width !== undefined && (options.minWidth !== undefined || options.maxWidth !== undefined)) {
    throw new OptionError(`${name}.width`, 'a fixed width cannot be combined with minWidth or maxWidth');
  }
  if (options.minWidth !== undefined && options.maxWidth !== undefined && options.minWidth > options.maxWidth) {
    throw new OptionError(
      `${name}.minWidth`,
      `minWidth (${options.minWidth}) is greater than maxWidth (${options.maxWidth})`,
    );
  }
  const flex = options.flex ?? 1;
  if (typeof flex !== 'number' || !Number.isFinite(flex) || flex < 0) {
    throw new OptionError(`${name}.flex`, `expected a non-negative number, got ${describe(flex)}`);
  }
  if (options.format !== undefined && typeof options.format !== 'function') {
    throw new OptionError(`${name}.format`, `expected a function, got ${describe(options.format)}`);
  }
  const align = checkEnum(`${name}.align`, options.align ?? 'left', COLUMN_ALIGNMENTS);
  return {
    key: options.key,
    title: options.title ?? options.key,
    width: options.width,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
    flex,
    align,
    headerAlign: checkEnum(
      `${name}.headerAlign`,
      options.headerAlign ?? (align === 'decimal' ? 'right' : align),
      CELL_ALIGNMENTS,
    ),
    valign: checkEnum(`${name}.valign`, options.valign ?? 'top', VERTICAL_ALIGNMENTS),
    format: options.format,
    wrap: checkEnum(`${name}.wrap`, options.wrap ?? 'word', COLUMN_WRAP_MODES),
    truncate: checkEnum(`${name}.truncate`, options.truncate ?? 'end', TRUNCATE_POSITIONS),
    ellipsis: options.ellipsis ?? ELLIPSIS,
    sgr: styleToSgr(options.style),
  };
}

/**
 * Validate a list of column definitions.
 * @param {unknown} columns an array of definitions or keys
 * @returns {Column[]}
 */
export function normalizeColumns(columns) {
  if (!Array.isArray(columns)) {
    throw new OptionError('columns', `expected an array of column definitions, got ${describe(columns)}`);
  }
  const normalized = columns.map((column, index) => normalizeColumn(column, index));
  const seen = new Set();
  for (const [index, column] of normalized.entries()) {
    if (column.key === undefined) continue;
    if (seen.has(column.key)) {
      throw new OptionError(`columns[${index}].key`, `duplicate column key ${describe(column.key)}`);
    }
    seen.add(column.key);
  }
  return normalized;
}
