/**
 * Streaming mode: render rows one at a time with column widths that are
 * fixed before the first row is seen.
 * @module stream
 */

import { TablefmtError, LayoutError, OptionError } from './errors.js';
import { describe } from './validate.js';
import { Table, checkTableOptions, TABLE_OPTION_KEYS } from './table.js';
import { resolveBorder } from './borders.js';
import { stringWidth } from './cells.js';
import { allocateWidths } from './layout.js';
import { detectColor } from './style.js';
import { renderLines, columnMetric, tableOverhead, simpleRule } from './render/text.js';

/**
 * @typedef {object} StreamOptions
 * @property {{write: (chunk: string) => unknown, isTTY?: boolean}} [output]
 *   where the lines go (default `process.stdout`)
 * @property {boolean} [color] force styling on or off instead of detecting it
 * @property {import('./style.js').ColorEnvironment} [environment]
 *   environment used to detect colour support
 */

/**
 * A table that is written row by row.
 *
 * Because no row is known in advance, every column gets its fixed `width`,
 * or else the width of its title (at least `minWidth`); when the table has
 * a `maxWidth`, the flexible columns share whatever is left of it. Cells
 * wrap or truncate inside their column as usual. Spanning cells are not
 * supported, and decimal columns are right-aligned.
 */
export class TableStream {
  /** @type {Table} */
  #table;
  /** @type {Record<string, any>} */
  #renderOptions;
  /** @type {{write: (chunk: string) => unknown}} */
  #output;
  /** @type {import('./borders.js').BorderStyle} */
  #border;
  #padding;
  #separators;
  #zebra;
  #started = false;
  #ended = false;
  #headerShown = false;

  /**
   * @param {import('./table.js').TableOptions & StreamOptions} options
   *   table options; `columns` is required
   */
  constructor(options) {
    const { output, color, environment, ...tableOptions } = checkTableOptions(options, [
      ...TABLE_OPTION_KEYS,
      'output',
      'color',
      'environment',
    ]);
    if (!Array.isArray(tableOptions.columns) || tableOptions.columns.length === 0) {
      throw new OptionError('columns', 'a table stream needs its columns up front');
    }
    if (output !== undefined && typeof output?.write !== 'function') {
      throw new OptionError('output', `expected an object with a write method, got ${describe(output)}`);
    }
    if (color !== undefined && typeof color !== 'boolean') {
      throw new OptionError('color', `expected a boolean, got ${describe(color)}`);
    }
    this.#output = output ?? process.stdout;
    this.#table = new Table(tableOptions);
    const opts = this.#table.options;
    this.#border = resolveBorder(opts.border ?? 'light');
    this.#padding = opts.padding ?? 1;
    this.#separators = Boolean(opts.rowSeparators) && this.#border.rules === 'all';
    this.#zebra = Boolean(opts.zebra);
    this.#renderOptions = {
      color:
        color ??
        detectColor(environment ?? { env: process.env, isTTY: Boolean(/** @type {any} */ (this.#output).isTTY) }),
    };

    const columns = /** @type {import('./columns.js').Column[]} */ (this.#table.columns);
    const showHeader = opts.header !== false;
    const metrics = columns.map((column) =>
      columnMetric(column, showHeader ? stringWidth(column.title, { tabWidth: opts.tabWidth }) : 1),
    );
    const overhead = tableOverhead(columns.length, this.#border, this.#padding);
    const available = opts.maxWidth === undefined ? undefined : opts.maxWidth - overhead;
    if (available !== undefined && available < columns.length) {
      throw new LayoutError(`${columns.length} columns do not fit in a maxWidth of ${opts.maxWidth}`);
    }
    /** @type {number[]} the width of every column, fixed for the whole stream */
    this.widths = allocateWidths(metrics, available, { expand: available !== undefined });
    /** Number of rows written so far. */
    this.rowCount = 0;
  }

  /**
   * @param {string[]} lines
   */
  #emit(lines) {
    if (lines.length > 0) this.#output.write(`${lines.join('\n')}\n`);
  }

  /**
   * @param {'top' | 'middle' | 'bottom'} position
   * @returns {string[]}
   */
  #rule(position) {
    if (this.#border.rules === 'none') return [];
    if (position !== 'middle' && !this.#border.caps) return [];
    return [simpleRule(this.#border, this.widths, this.#padding, position)];
  }

  /** Write the top rule and the header, once. */
  #start() {
    if (this.#started) return;
    this.#started = true;
    const header = renderLines(this.#table, this.#renderOptions, { widths: this.widths, bare: true });
    this.#headerShown = header.length > 0;
    this.#emit([...this.#rule('top'), ...header]);
  }

  /**
   * Render one row and write it out.
   * @param {readonly unknown[] | Record<string, unknown>} cells the row,
   *   as for `Table.row`
   * @param {{style?: import('./style.js').Style}} [options]
   * @returns {this}
   */
  write(cells, options) {
    if (this.#ended) throw new TablefmtError('Cannot write to a table stream after end()', 'ERR_STREAM_ENDED');
    const table = this.#table;
    // The table object only ever holds the row being written.
    table.row(cells, options);
    const [row] = table.bodyRows.splice(0);
    if (row.cells.some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1)) {
      throw new LayoutError('Spanning cells are not supported in a table stream');
    }
    this.#start();
    table.bodyRows.push(row);
    const lines = renderLines(
      table,
      { ...this.#renderOptions, header: false },
      { widths: this.widths, bare: true, striped: this.#zebra && this.rowCount % 2 === 1 },
    );
    table.bodyRows.length = 0;
    const needRule = this.rowCount === 0 ? this.#headerShown : this.#separators;
    this.#emit([...(needRule ? this.#rule('middle') : []), ...lines]);
    this.rowCount++;
    return this;
  }

  /**
   * Write the closing rule. The stream cannot be written to afterwards;
   * calling `end` again does nothing.
   */
  end() {
    if (this.#ended) return;
    this.#start();
    this.#ended = true;
    this.#emit(this.#rule('bottom'));
  }
}

/**
 * Create a {@link TableStream}.
 * @param {import('./table.js').TableOptions & StreamOptions} options
 * @returns {TableStream}
 */
export function createStream(options) {
  return new TableStream(options);
}
