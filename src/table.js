/**
 * The table model: columns, header, body and footer rows, row groups and
 * cells with spans. A `Table` only stores data; the renderers turn it into
 * text, Markdown, CSV or HTML.
 * @module table
 */

import { OptionError } from './errors.js';
import { checkEnum, checkInteger, checkOptions, describe } from './validate.js';
import { normalizeColumns, CELL_ALIGNMENTS, VERTICAL_ALIGNMENTS } from './columns.js';
import { resolveBorder } from './borders.js';
import { styleToSgr } from './style.js';

/** @typedef {import('./columns.js').Column} Column */
/** @typedef {import('./style.js').Style} Style */

/**
 * @typedef {object} CellOptions
 * @property {any} content the value to show; may be a nested `Table`
 * @property {number} [colSpan] number of columns covered (default 1)
 * @property {number} [rowSpan] number of rows covered (default 1)
 * @property {'left' | 'right' | 'center'} [align] overrides the column alignment
 * @property {'top' | 'middle' | 'bottom'} [valign] overrides the column vertical alignment
 * @property {Style} [style] style for this cell
 */

/**
 * @typedef {object} CellSpec a normalised cell
 * @property {any} value
 * @property {number} colSpan
 * @property {number} rowSpan
 * @property {'left' | 'right' | 'center' | undefined} align
 * @property {'top' | 'middle' | 'bottom' | undefined} valign
 * @property {string} sgr
 */

/**
 * @typedef {object} Row a normalised row
 * @property {CellSpec[]} cells
 * @property {string} sgr canonical SGR state for the whole row
 * @property {number} group index of the body group the row belongs to
 * @property {boolean} title whether this is a group title row
 */

/**
 * @typedef {object} TableOptions
 * @property {(import('./columns.js').ColumnOptions | string)[]} [columns]
 * @property {string | import('./borders.js').BorderStyle} [border] border style (default `light`)
 * @property {number} [padding] spaces on each side of a cell's content (default 1)
 * @property {number} [maxWidth] widest the rendered table may be, in columns
 * @property {boolean} [expand] grow flexible columns to fill `maxWidth`
 * @property {boolean} [rowSeparators] draw a rule between all rows
 * @property {boolean | Style} [zebra] style every second body row; `true` dims it
 * @property {boolean} [header] set to false to suppress the header made from column titles
 * @property {Style} [headerStyle] style for header rows (default bold)
 * @property {Style} [footerStyle] style for footer rows
 * @property {string} [nullText] text shown for null and undefined values (default '')
 * @property {number} [tabWidth] tab stop distance inside cells (default 8)
 */

export const TABLE_OPTION_KEYS = [
  'columns', 'border', 'padding', 'maxWidth', 'expand', 'rowSeparators', 'zebra', 'header',
  'headerStyle', 'footerStyle', 'nullText', 'tabWidth',
];

const CELL_KEYS = ['content', 'colSpan', 'rowSpan', 'align', 'valign', 'style'];
const BOOLEAN_OPTIONS = ['expand', 'rowSeparators', 'header'];

/**
 * Validate table or render options. Returns a copy containing only the keys
 * that were given.
 * @param {unknown} options
 * @param {readonly string[]} [known]
 * @returns {Record<string, any>}
 */
export function checkTableOptions(options, known = TABLE_OPTION_KEYS) {
  const checked = { ...checkOptions('options', options, known) };
  if (checked.border !== undefined) resolveBorder(checked.border);
  if (checked.padding !== undefined) checkInteger('padding', checked.padding, { min: 0 });
  if (checked.maxWidth !== undefined) checkInteger('maxWidth', checked.maxWidth, { min: 1 });
  if (checked.tabWidth !== undefined) checkInteger('tabWidth', checked.tabWidth, { min: 0 });
  for (const key of BOOLEAN_OPTIONS) {
    if (checked[key] !== undefined && typeof checked[key] !== 'boolean') {
      throw new OptionError(key, `expected a boolean, got ${describe(checked[key])}`);
    }
  }
  if (checked.nullText !== undefined && typeof checked.nullText !== 'string') {
    throw new OptionError('nullText', `expected a string, got ${describe(checked.nullText)}`);
  }
  if (typeof checked.zebra !== 'boolean') styleToSgr(checked.zebra);
  styleToSgr(checked.headerStyle);
  styleToSgr(checked.footerStyle);
  return checked;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Normalise one cell. A plain object with a `content` property is read as
 * cell options; anything else is the cell's value.
 * @param {unknown} input
 * @param {string} where description of the cell for error messages
 * @returns {CellSpec}
 */
export function normalizeCell(input, where) {
  if (!isPlainObject(input) || !Object.hasOwn(input, 'content')) {
    return { value: input, colSpan: 1, rowSpan: 1, align: undefined, valign: undefined, sgr: '' };
  }
  const options = checkOptions(where, input, CELL_KEYS);
  return {
    value: options.content,
    colSpan: options.colSpan === undefined ? 1 : checkInteger(`${where}.colSpan`, options.colSpan, { min: 1 }),
    rowSpan: options.rowSpan === undefined ? 1 : checkInteger(`${where}.rowSpan`, options.rowSpan, { min: 1 }),
    align: options.align === undefined ? undefined : checkEnum(`${where}.align`, options.align, CELL_ALIGNMENTS),
    valign:
      options.valign === undefined ? undefined : checkEnum(`${where}.valign`, options.valign, VERTICAL_ALIGNMENTS),
    sgr: styleToSgr(options.style),
  };
}

/** A table under construction. */
export class Table {
  /** @param {TableOptions} [options] */
  constructor(options) {
    const checked = checkTableOptions(options);
    /** @type {Column[] | undefined} */
    this.columns = checked.columns === undefined ? undefined : normalizeColumns(checked.columns);
    delete checked.columns;
    /** @type {Record<string, any>} validated options other than `columns` */
    this.options = checked;
    /** @type {Row[]} */
    this.headerRows = [];
    /** @type {Row[]} */
    this.bodyRows = [];
    /** @type {Row[]} */
    this.footerRows = [];
    this.groupCount = 0;
  }

  /**
   * Add a header row. Explicit header rows replace the header that is
   * otherwise made from the column titles.
   * @param {unknown[] | Record<string, unknown>} cells
   * @param {{style?: Style}} [options]
   * @returns {this}
   */
  header(cells, options) {
    this.headerRows.push(this.#makeRow(cells, options, `header row ${this.headerRows.length + 1}`));
    return this;
  }

  /**
   * Add a body row, either as an array of cells in column order or as an
   * object keyed by column key.
   * @param {unknown[] | Record<string, unknown>} cells
   * @param {{style?: Style}} [options]
   * @returns {this}
   */
  row(cells, options) {
    this.bodyRows.push(this.#makeRow(cells, options, `row ${this.bodyRows.length + 1}`));
    return this;
  }

  /**
   * Add several body rows.
   * @param {Iterable<unknown[] | Record<string, unknown>>} rows
   * @returns {this}
   */
  rows(rows) {
    if (rows === null || rows === undefined || typeof rows[Symbol.iterator] !== 'function' || typeof rows === 'string') {
      throw new OptionError('rows', `expected an iterable of rows, got ${describe(rows)}`);
    }
    for (const cells of rows) this.row(cells);
    return this;
  }

  /**
   * Start a new group of body rows. Groups are separated by a rule; when a
   * title is given it is shown in a row that spans the whole table.
   * @param {unknown} [title]
   * @param {{style?: Style, align?: 'left' | 'right' | 'center'}} [options]
   * @returns {this}
   */
  group(title, options) {
    const { style, align } = checkOptions('options', options, ['style', 'align']);
    if (this.bodyRows.length > 0) this.groupCount++;
    if (title !== undefined && title !== null) {
      const cell = normalizeCell({ content: title, align }, 'group title');
      // The span is resolved against the final column count when the grid is built.
      cell.colSpan = Infinity;
      this.bodyRows.push({ cells: [cell], sgr: styleToSgr(style), group: this.groupCount, title: true });
    }
    return this;
  }

  /**
   * Add a footer row.
   * @param {unknown[] | Record<string, unknown>} cells
   * @param {{style?: Style}} [options]
   * @returns {this}
   */
  footer(cells, options) {
    this.footerRows.push(this.#makeRow(cells, options, `footer row ${this.footerRows.length + 1}`));
    return this;
  }

  /**
   * @param {unknown} cells
   * @param {unknown} options
   * @param {string} where
   * @returns {Row}
   */
  #makeRow(cells, options, where) {
    const { style } = checkOptions('options', options, ['style']);
    let list;
    if (Array.isArray(cells)) {
      list = cells;
    } else if (isPlainObject(cells)) {
      const columns = this.columns;
      if (!columns || columns.some((column) => column.key === undefined)) {
        throw new OptionError(where, 'object rows need every column to have a key');
      }
      list = columns.map((column) => cells[/** @type {string} */ (column.key)]);
    } else {
      throw new OptionError(where, `expected an array or object, got ${describe(cells)}`);
    }
    return {
      cells: list.map((cell, index) => normalizeCell(cell, `${where}, cell ${index + 1}`)),
      sgr: styleToSgr(style),
      group: this.groupCount,
      title: false,
    };
  }
}
