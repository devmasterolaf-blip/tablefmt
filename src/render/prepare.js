/**
 * Shared preparation step for all renderers: merge options, build the grid
 * and turn cell values into display text.
 * @module render/prepare
 */

import { OptionError } from '../errors.js';
import { describe } from '../validate.js';
import { Table, checkTableOptions, normalizeCell, TABLE_OPTION_KEYS } from '../table.js';
import { buildGrid } from '../grid.js';
import { normalizeColumn } from '../columns.js';

/** @typedef {import('../grid.js').Placed} Placed */
/** @typedef {import('../columns.js').Column} Column */

/**
 * @typedef {object} Prepared
 * @property {Record<string, any>} options table options overlaid with render options
 * @property {Column[]} columns one definition per grid column
 * @property {import('../grid.js').Grid} grid
 * @property {(cell: Placed) => string | Table} content display text of a
 *   cell, or the nested table it holds
 */

/** Render options shared by every renderer: the table options minus `columns`. */
export const RENDER_OPTION_KEYS = TABLE_OPTION_KEYS.filter((key) => key !== 'columns');

/**
 * Convert a value to display text.
 * @param {unknown} value
 * @param {string} [nullText] text for null and undefined
 * @returns {string}
 */
export function formatValue(value, nullText = '') {
  if (value === null || value === undefined) return nullText;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? String(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * @param {unknown} table
 * @param {unknown} renderOptions
 * @param {readonly string[]} [extraKeys] renderer-specific option names
 * @returns {Prepared}
 */
export function prepare(table, renderOptions, extraKeys = []) {
  if (!(table instanceof Table)) {
    throw new OptionError('table', `expected a Table, got ${describe(table)}`);
  }
  const options = { ...table.options, ...checkTableOptions(renderOptions, [...RENDER_OPTION_KEYS, ...extraKeys]) };
  let header = table.headerRows;
  if (header.length === 0 && options.header !== false && table.columns?.some((column) => column.title !== undefined)) {
    header = [
      {
        cells: table.columns.map((column) => normalizeCell(column.title ?? '', 'header')),
        sgr: '',
        group: 0,
        title: false,
      },
    ];
  }
  const grid = buildGrid({ header, body: table.bodyRows, footer: table.footerRows }, table.columns?.length);
  const columns = table.columns ?? Array.from({ length: grid.columnCount }, (_, index) => normalizeColumn({}, index));
  const nullText = options.nullText ?? '';
  return {
    options,
    columns,
    grid,
    content(cell) {
      let value = cell.spec.value;
      if (value instanceof Table) return value;
      const column = columns[cell.col];
      if (column.format && cell.section === 'body' && !cell.filler && !grid.rows[cell.row].source.title) {
        value = column.format(value, { row: grid.rows[cell.row].index, column });
        if (value instanceof Table) return value;
      }
      return formatValue(value, nullText);
    },
  };
}
