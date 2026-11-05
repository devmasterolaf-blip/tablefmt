/**
 * Plain-text renderer: draws a table with borders for a terminal.
 * @module render/text
 */

import { LayoutError, OptionError } from '../errors.js';
import { describe } from '../validate.js';
import { resolveBorder, junction, UP, RIGHT, DOWN, LEFT } from '../borders.js';
import { parseLines, cellsWidth, serialize, spaces, DEFAULT_TAB_WIDTH } from '../cells.js';
import { wrapCells, truncateCells, padCells } from '../text.js';
import { alignDecimal } from '../decimal.js';
import { mergeSgr } from '../ansi.js';
import { styleToSgr, styleCells, unstyleCells, detectColor } from '../style.js';
import { allocateWidths, distribute } from '../layout.js';
import { Table } from '../table.js';
import { prepare } from './prepare.js';

/** @typedef {import('../cells.js').Cell} Cell */
/** @typedef {import('../grid.js').Placed} Placed */
/** @typedef {import('../columns.js').Column} Column */
/** @typedef {import('../borders.js').BorderStyle} BorderStyle */

/**
 * @typedef {object} TextRenderOptions
 * @property {boolean} [color] force styling on or off instead of detecting it
 * @property {import('../style.js').ColorEnvironment} [environment] environment
 *   used to detect colour support; defaults to the current process
 */

/**
 * @typedef {object} Box a placed cell with everything needed to draw it
 * @property {Placed} placed
 * @property {Column} column the column the cell starts in
 * @property {Table | null} nested
 * @property {Cell[][]} raw content lines before wrapping
 * @property {boolean} decimal whether the lines were padded to line up on
 *   the decimal point and must keep their spacing
 * @property {Cell[][]} lines content lines wrapped and padded to `width`
 * @property {number} width inner width in columns
 * @property {'left' | 'right' | 'center'} align
 * @property {'top' | 'middle' | 'bottom'} valign
 * @property {string} sgr canonical SGR state applied to the whole cell
 */

const DEFAULT_ZEBRA = { dim: true };
const DEFAULT_HEADER_STYLE = { bold: true };

/**
 * Width taken by borders and padding around `count` columns.
 * @param {number} count
 * @param {BorderStyle} border
 * @param {number} padding
 * @returns {number}
 */
export function tableOverhead(count, border, padding) {
  if (count === 0) return 0;
  const bar = cellsWidth(parseLines(border.vertical)[0]);
  const inner = (count - 1) * bar + 2 * padding * count;
  return border.edges ? inner + 2 * bar : inner - 2 * padding;
}

/**
 * Derive the allocation metric of a column from its definition and the
 * natural width of its content.
 * @param {Column} column
 * @param {number} natural widest content line
 * @returns {import('../layout.js').ColumnMetric}
 */
export function columnMetric(column, natural) {
  if (column.width !== undefined) {
    return { preferred: column.width, floor: column.width, ceiling: column.width, flex: 0 };
  }
  const floor = column.minWidth ?? 1;
  const ceiling = column.maxWidth ?? Infinity;
  const preferred = Math.min(Math.max(natural, floor), ceiling);
  // Shrinking a decimal column would break the alignment, so it only
  // shrinks when the caller set an explicit maximum.
  const rigid = column.flex === 0 || (column.align === 'decimal' && column.maxWidth === undefined);
  return { preferred, floor: rigid ? preferred : floor, ceiling, flex: column.flex };
}

/**
 * Draw a rule for a table without spans.
 * @param {BorderStyle} border
 * @param {readonly number[]} widths content width of each column
 * @param {number} padding
 * @param {'top' | 'middle' | 'bottom'} position
 * @returns {string}
 */
export function simpleRule(border, widths, padding, position) {
  const vertical = (position === 'top' ? 0 : UP) | (position === 'bottom' ? 0 : DOWN);
  let out = '';
  for (let c = 0; c <= widths.length; c++) {
    const interior = c > 0 && c < widths.length;
    if (interior || border.edges) {
      out += junction(border, vertical | (c > 0 ? LEFT : 0) | (c < widths.length ? RIGHT : 0));
    }
    if (c < widths.length) out += border.horizontal.repeat(widths[c] + 2 * padding);
  }
  return out;
}

/**
 * Render a table as text.
 * @param {Table} table
 * @param {import('../table.js').TableOptions & TextRenderOptions} [options]
 *   overrides for the table's own options
 * @returns {string} the lines joined with `\n`, without a trailing newline
 * @throws {LayoutError} when the table cannot fit in `maxWidth`
 */
export function renderText(table, options) {
  return renderLines(table, options).join('\n');
}

/**
 * Render a table to an array of lines. The third argument is used by the
 * streaming renderer to draw rows with widths that were fixed up front.
 * @param {Table} table
 * @param {import('../table.js').TableOptions & TextRenderOptions} [options]
 * @param {{widths?: number[], bare?: boolean}} [internal] `widths` skips
 *   measuring; `bare` leaves out the top and bottom rules
 * @returns {string[]}
 */
export function renderLines(table, options, internal = {}) {
  const prepared = prepare(table, options, ['color', 'environment']);
  const { grid, columns, options: opts } = prepared;
  const rowCount = grid.rows.length;
  const count = grid.columnCount;
  if (rowCount === 0 || count === 0) return [];

  const border = resolveBorder(opts.border ?? 'light');
  const padding = opts.padding ?? 1;
  const tabWidth = opts.tabWidth ?? DEFAULT_TAB_WIDTH;
  if (opts.color !== undefined && typeof opts.color !== 'boolean') {
    throw new OptionError('color', `expected a boolean, got ${describe(opts.color)}`);
  }
  if (opts.expand && opts.maxWidth === undefined) {
    throw new OptionError('expand', 'expanding needs a maxWidth to fill');
  }
  const color =
    opts.color ?? detectColor(opts.environment ?? { env: process.env, isTTY: Boolean(process.stdout?.isTTY) });
  const gap = 2 * padding + cellsWidth(parseLines(border.vertical)[0]);

  // --- 1. Resolve content, alignment and style for every cell. -----------
  const zebraSgr = opts.zebra === true ? styleToSgr(DEFAULT_ZEBRA) : opts.zebra ? styleToSgr(opts.zebra) : '';
  const headerSgr = styleToSgr(opts.headerStyle ?? DEFAULT_HEADER_STYLE);
  const footerSgr = styleToSgr(opts.footerStyle);
  const striped = stripedRows(grid, zebraSgr !== '');

  /** @type {Map<Placed, string>} */
  const texts = new Map();
  /** @type {Box[]} */
  const boxes = [];
  /** @type {Map<Placed, Box>} */
  const boxOf = new Map();
  for (const placed of grid.cells) {
    const content = prepared.content(placed);
    const column = columns[placed.col];
    const row = grid.rows[placed.row];
    let align = placed.spec.align;
    if (!align) {
      if (row.source.title) align = 'left';
      else if (placed.section === 'header') align = column.headerAlign;
      else align = column.align === 'decimal' ? 'right' : column.align;
    }
    let sgr = '';
    if (color) {
      if (placed.section === 'header') sgr = headerSgr;
      else if (placed.section === 'footer') sgr = footerSgr;
      else sgr = mergeSgr(striped[placed.row] ? zebraSgr : '', row.source.title ? '' : column.sgr);
      sgr = mergeSgr(mergeSgr(sgr, row.source.sgr), placed.spec.sgr);
    }
    /** @type {Box} */
    const box = {
      placed,
      column,
      nested: content instanceof Table ? content : null,
      raw: [],
      decimal: false,
      lines: [],
      width: 0,
      align,
      valign: placed.spec.valign ?? column.valign,
      sgr,
    };
    if (!box.nested) texts.set(placed, /** @type {string} */ (content));
    boxes.push(box);
    boxOf.set(placed, box);
  }

  // Decimal columns: line up the numbers of all single-column body and
  // footer cells before anything is measured.
  columns.forEach((column, c) => {
    if (column.align !== 'decimal') return;
    const members = boxes.filter(
      (box) =>
        box.placed.col === c && box.placed.colSpan === 1 && box.placed.section !== 'header' &&
        !box.nested && !box.placed.spec.align && !box.placed.filler,
    );
    const split = members.map((box) => /** @type {string} */ (texts.get(box.placed)).split('\n'));
    const aligned = alignDecimal(split.flat());
    let next = 0;
    members.forEach((box, i) => {
      box.decimal = true;
      texts.set(box.placed, aligned.slice(next, next + split[i].length).join('\n'));
      next += split[i].length;
    });
  });

  for (const box of boxes) {
    const text = box.nested ? renderText(box.nested, { color }) : /** @type {string} */ (texts.get(box.placed));
    box.raw = parseLines(text, { tabWidth });
    if (!color) box.raw = box.raw.map(unstyleCells);
  }

  // --- 2. Column widths. --------------------------------------------------
  let widths = internal.widths;
  if (!widths) {
    const natural = new Array(count).fill(0);
    for (const box of boxes) {
      if (box.placed.colSpan !== 1) continue;
      natural[box.placed.col] = Math.max(natural[box.placed.col], widest(box.raw));
    }
    const metrics = columns.map((column, c) => columnMetric(column, natural[c]));
    for (const box of boxes) {
      const { col, colSpan } = box.placed;
      if (colSpan === 1) continue;
      const span = metrics.slice(col, col + colSpan);
      const have = span.reduce((sum, metric) => sum + metric.preferred, 0) + (colSpan - 1) * gap;
      const missing = widest(box.raw) - have;
      if (missing <= 0) continue;
      // Widen the spanned columns that are allowed to grow.
      const room = span.map((metric) => (metric.flex > 0 && metric.preferred < metric.ceiling ? 1 : 0));
      distribute(missing, room).forEach((extra, i) => {
        span[i].preferred = Math.min(span[i].preferred + extra, span[i].ceiling);
      });
    }
    const overhead = tableOverhead(count, border, padding);
    const available = opts.maxWidth === undefined ? undefined : opts.maxWidth - overhead;
    const floors = metrics.reduce((sum, metric) => sum + metric.floor, 0);
    if (available !== undefined && floors > available) {
      throw new LayoutError(
        `Table needs at least ${floors + overhead} columns of width but maxWidth is ${opts.maxWidth}`,
      );
    }
    widths = allocateWidths(metrics, available, { expand: opts.expand });
  } else if (widths.length !== count) {
    throw new LayoutError(`Expected ${count} column widths, got ${widths.length}`);
  }

  // --- 3. Wrap every cell to its final width. -----------------------------
  for (const box of boxes) {
    const { col, colSpan } = box.placed;
    let width = (colSpan - 1) * gap;
    for (let c = col; c < col + colSpan; c++) width += widths[c];
    box.width = width;
    let lines;
    if (box.nested) {
      lines = box.raw;
      if (widest(lines) > width) {
        lines = parseLines(renderText(box.nested, { color, maxWidth: width }));
      }
    } else if (box.decimal || (box.column.wrap === 'none' && !grid.rows[box.placed.row].source.title)) {
      // Wrapping would drop the padding that lines the numbers up.
      const marker = parseLines(box.column.ellipsis)[0];
      lines = box.raw.map((line) => truncateCells(line, width, box.column.truncate, marker));
    } else {
      const mode = box.column.wrap === 'hard' ? 'hard' : 'word';
      lines = box.raw.flatMap((line) => wrapCells(line, width, mode));
    }
    box.lines = lines.map((line) => padCells(line, width, box.align));
  }

  // --- 4. Rules and row heights. ------------------------------------------
  const { slots, rows } = grid;
  /** @type {boolean[]} whether a rule is drawn above row `b` (b === rowCount: below the last row) */
  const ruleAt = [];
  for (let b = 0; b <= rowCount; b++) {
    if (border.rules === 'none') ruleAt.push(false);
    else if (b === 0 || b === rowCount) ruleAt.push(border.caps && !internal.bare);
    else if (rows[b - 1].section !== rows[b].section) ruleAt.push(border.rules === 'all' || rows[b - 1].section === 'header');
    else if (border.rules === 'header') ruleAt.push(false);
    else ruleAt.push(Boolean(opts.rowSeparators) || rows[b - 1].source.group !== rows[b].source.group);
  }
  const heights = new Array(rowCount).fill(1);
  for (const box of boxes) {
    if (box.placed.rowSpan === 1) heights[box.placed.row] = Math.max(heights[box.placed.row], box.lines.length);
  }
  for (const box of boxes) {
    const { row, rowSpan } = box.placed;
    if (rowSpan === 1) continue;
    let have = 0;
    for (let r = row; r < row + rowSpan; r++) have += heights[r] + (r > row && ruleAt[r] ? 1 : 0);
    // A tall spanning cell stretches the last row it covers.
    if (box.lines.length > have) heights[row + rowSpan - 1] += box.lines.length - have;
  }
  /** @type {number[]} output line number of the first line of each row */
  const rowTop = [];
  let lineNumber = 0;
  for (let r = 0; r < rowCount; r++) {
    if (ruleAt[r]) lineNumber++;
    rowTop.push(lineNumber);
    lineNumber += heights[r];
  }

  // --- 5. Draw. -----------------------------------------------------------
  const bar = parseLines(border.vertical)[0];

  /**
   * One output line of a cell, including its padding.
   * @param {Box} box
   * @param {number} line absolute output line number
   * @param {boolean} first whether the cell touches the left edge
   * @param {boolean} last whether the cell touches the right edge
   * @returns {Cell[]}
   */
  const boxLine = (box, line, first, last) => {
    const { row, rowSpan } = box.placed;
    const lastRow = row + rowSpan - 1;
    const blockHeight = rowTop[lastRow] + heights[lastRow] - rowTop[row];
    const spare = blockHeight - box.lines.length;
    const offset = box.valign === 'top' ? 0 : box.valign === 'bottom' ? spare : Math.floor(spare / 2);
    const content = box.lines[line - rowTop[row] - offset] ?? spaces(box.width);
    const cells = [
      ...spaces(first && !border.edges ? 0 : padding),
      ...content,
      ...spaces(last && !border.edges ? 0 : padding),
    ];
    return box.sgr === '' ? cells : styleCells(cells, box.sgr);
  };

  /**
   * @param {Cell[]} cells
   * @returns {string}
   */
  const finish = (cells) => {
    if (!border.edges) {
      let end = cells.length;
      while (end > 0 && cells[end - 1].text === ' ' && cells[end - 1].sgr === '' && cells[end - 1].link === '') end--;
      cells.length = end;
    }
    return serialize(cells);
  };

  /** @type {string[]} */
  const out = [];
  for (let b = 0; b <= rowCount; b++) {
    if (ruleAt[b]) {
      /** @type {Cell[]} */
      const cells = [];
      let c = 0;
      while (c <= count) {
        const through = (/** @type {number} */ col) =>
          b > 0 && b < rowCount && col >= 0 && col < count && slots[b - 1][col] === slots[b][col];
        const divided = (/** @type {number} */ r) =>
          r >= 0 && r < rowCount && (c === 0 || c === count || slots[r][c - 1] !== slots[r][c]);
        const mask =
          (divided(b - 1) ? UP : 0) |
          (divided(b) ? DOWN : 0) |
          (c > 0 && !through(c - 1) ? LEFT : 0) |
          (c < count && !through(c) ? RIGHT : 0);
        if (border.edges || (c > 0 && c < count)) cells.push(...parseLines(junction(border, mask))[0]);
        if (c === count) break;
        if (through(c)) {
          // A cell spanning rows continues through this rule.
          const box = /** @type {Box} */ (boxOf.get(slots[b][c]));
          cells.push(...boxLine(box, out.length, c === 0, c + box.placed.colSpan === count));
          c += box.placed.colSpan;
        } else {
          const pad = (c === 0 || c === count - 1) && !border.edges ? padding : 2 * padding;
          cells.push(...parseLines(border.horizontal.repeat(widths[c] + pad))[0]);
          c++;
        }
      }
      out.push(finish(cells));
    }
    if (b === rowCount) break;
    for (let k = 0; k < heights[b]; k++) {
      /** @type {Cell[]} */
      const cells = border.edges ? [...bar] : [];
      let c = 0;
      while (c < count) {
        const box = /** @type {Box} */ (boxOf.get(slots[b][c]));
        const end = c + box.placed.colSpan;
        cells.push(...boxLine(box, out.length, c === 0, end === count));
        if (end < count || border.edges) cells.push(...bar);
        c = end;
      }
      out.push(finish(cells));
    }
  }
  return out;
}

/**
 * Widest line in a list of cell lines.
 * @param {readonly Cell[][]} lines
 * @returns {number}
 */
function widest(lines) {
  let width = 0;
  for (const line of lines) width = Math.max(width, cellsWidth(line));
  return width;
}

/**
 * Decide which body rows get the zebra style: every second data row,
 * counted afresh in each group and skipping group titles.
 * @param {import('../grid.js').Grid} grid
 * @param {boolean} enabled
 * @returns {boolean[]} one flag per grid row
 */
function stripedRows(grid, enabled) {
  const flags = new Array(grid.rows.length).fill(false);
  if (!enabled) return flags;
  let counter = 0;
  let group = -1;
  grid.rows.forEach((row, r) => {
    if (row.section !== 'body') return;
    if (row.source.group !== group) {
      group = row.source.group;
      counter = 0;
    }
    if (row.source.title) return;
    flags[r] = counter % 2 === 1;
    counter++;
  });
  return flags;
}
