/**
 * HTML renderer.
 * @module render/html
 */

import { OptionError } from '../errors.js';
import { describe } from '../validate.js';
import { stripAnsi } from '../ansi.js';
import { Table } from '../table.js';
import { prepare } from './prepare.js';

/**
 * @typedef {object} HtmlRenderOptions
 * @property {string} [caption] text for a `<caption>` element
 * @property {string} [className] value of the table's `class` attribute
 * @property {string} [indent] indentation unit (default two spaces); an
 *   empty string still puts every row on its own line
 */

/** @type {Record<string, string>} */
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/**
 * Escape text for use in HTML content or a quoted attribute value.
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
  return text.replace(/[&<>"']/g, (char) => ENTITIES[char]);
}

/**
 * Render a table as an HTML `<table>` element.
 *
 * Header rows go in `<thead>`, each row group in its own `<tbody>` and
 * footer rows in `<tfoot>`. Spans become `colspan` and `rowspan`
 * attributes, alignment other than left becomes an inline `text-align`
 * style, and line breaks in cells become `<br>`. All cell text is escaped;
 * ANSI escape sequences are removed. Nested tables are rendered as nested
 * `<table>` elements.
 * @param {Table} table
 * @param {import('../table.js').TableOptions & HtmlRenderOptions} [options]
 * @returns {string}
 */
export function renderHtml(table, options) {
  const prepared = prepare(table, options, ['caption', 'className', 'indent']);
  const { grid, columns, options: opts } = prepared;
  for (const name of ['caption', 'className', 'indent']) {
    if (opts[name] !== undefined && typeof opts[name] !== 'string') {
      throw new OptionError(name, `expected a string, got ${describe(opts[name])}`);
    }
  }
  const indent = opts.indent ?? '  ';
  const nestedOptions = { indent, nullText: opts.nullText };

  /**
   * @param {import('../grid.js').Placed} placed
   * @returns {string}
   */
  const cellHtml = (placed) => {
    const row = grid.rows[placed.row];
    const column = columns[placed.col];
    const tag = placed.section === 'header' || row.source.title ? 'th' : 'td';
    let align = placed.spec.align;
    if (!align && !row.source.title) {
      align = placed.section === 'header' ? column.headerAlign : column.align === 'decimal' ? 'right' : column.align;
    }
    let attributes = '';
    if (placed.colSpan > 1) attributes += ` colspan="${placed.colSpan}"`;
    if (placed.rowSpan > 1) attributes += ` rowspan="${placed.rowSpan}"`;
    if (align && align !== 'left') attributes += ` style="text-align: ${align}"`;
    const content = prepared.content(placed);
    const inner =
      content instanceof Table
        ? renderHtml(content, nestedOptions).replace(/\n\s*/g, '')
        : escapeHtml(stripAnsi(content)).replace(/\r\n|\r|\n/g, '<br>');
    return `<${tag}${attributes}>${inner}</${tag}>`;
  };

  const lines = [opts.className === undefined ? '<table>' : `<table class="${escapeHtml(opts.className)}">`];
  if (opts.caption !== undefined) lines.push(`${indent}<caption>${escapeHtml(opts.caption)}</caption>`);

  /** @type {string | null} */
  let open = null;
  let group = -1;
  grid.rows.forEach((row, r) => {
    const element = row.section === 'header' ? 'thead' : row.section === 'footer' ? 'tfoot' : 'tbody';
    if (element !== open || (element === 'tbody' && row.source.group !== group)) {
      if (open) lines.push(`${indent}</${open}>`);
      lines.push(`${indent}<${element}>`);
      open = element;
      group = row.source.group;
    }
    const cells = grid.cells.filter((placed) => placed.row === r).map(cellHtml);
    lines.push(`${indent}${indent}<tr>${cells.join('')}</tr>`);
  });
  if (open) lines.push(`${indent}</${open}>`);
  lines.push('</table>');
  return lines.join('\n');
}
