/**
 * Markdown renderer: GitHub-flavoured pipe tables.
 * @module render/markdown
 */

import { stripAnsi } from '../ansi.js';
import { plainWidth } from '../width.js';
import { Table } from '../table.js';
import { prepare, flatten } from './prepare.js';
import { renderHtml } from './html.js';

/**
 * @typedef {object} MarkdownRenderOptions
 * @property {boolean} [pretty] pad cells so the source lines up (default true)
 */

/**
 * Escape cell text for a pipe table: pipes are backslash-escaped and line
 * breaks become `<br>`, because a pipe table row must stay on one line.
 * @param {string} text
 * @returns {string}
 */
export function escapeMarkdownCell(text) {
  return stripAnsi(text)
    .replace(/\\(?=\|)|\|/g, (match) => `\\${match}`)
    .replace(/\r\n|\r|\n/g, '<br>')
    .replace(/\t/g, ' ');
}

/**
 * Render a table as a GitHub-flavoured Markdown pipe table.
 *
 * Markdown tables have exactly one header row and no spans, so: the first
 * header row becomes the header (an empty one is written when the table has
 * none), further header rows and footer rows become ordinary rows, spanning
 * cells keep their text in their first slot, and group titles become a row
 * with the title in bold. Nested tables are written as inline HTML.
 * @param {Table} table
 * @param {import('../table.js').TableOptions & MarkdownRenderOptions} [options]
 * @returns {string}
 */
export function renderMarkdown(table, options) {
  const prepared = prepare(table, options, ['pretty']);
  const { columns, grid } = prepared;
  if (grid.columnCount === 0) return '';
  const pretty = prepared.options.pretty !== false;
  const convert = (/** @type {string | Table} */ content) =>
    content instanceof Table
      ? renderHtml(content, { indent: '' }).replace(/\n/g, '')
      : escapeMarkdownCell(content);
  const rows = flatten(prepared, convert).map((row) =>
    row.cells.map((cell, c) => (row.title && c === 0 && cell !== '' ? `**${cell}**` : cell)),
  );
  if (grid.rows[0]?.section !== 'header') rows.unshift(columns.map(() => ''));

  const aligns = columns.map((column) => (column.align === 'decimal' ? 'right' : column.align));
  const widths = columns.map((_, c) =>
    pretty ? Math.max(3, ...rows.map((row) => plainWidth(row[c]))) : 3,
  );
  const line = (/** @type {string[]} */ cells) =>
    `| ${cells
      .map((cell, c) => {
        if (!pretty) return cell;
        const space = ' '.repeat(widths[c] - plainWidth(cell));
        if (aligns[c] === 'right') return space + cell;
        if (aligns[c] === 'center') {
          const left = space.length >> 1;
          return space.slice(0, left) + cell + space.slice(left);
        }
        return cell + space;
      })
      .join(' | ')} |`;
  const rule = widths.map((width, c) => {
    if (aligns[c] === 'right') return `${'-'.repeat(width - 1)}:`;
    if (aligns[c] === 'center') return `:${'-'.repeat(width - 2)}:`;
    return '-'.repeat(width);
  });
  return [line(rows[0]), `| ${rule.join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}
