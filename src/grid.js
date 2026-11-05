/**
 * Placement of cells on a rectangular grid, resolving row and column spans.
 * @module grid
 */

import { LayoutError } from './errors.js';

/** @typedef {import('./table.js').CellSpec} CellSpec */
/** @typedef {import('./table.js').Row} Row */
/** @typedef {'header' | 'body' | 'footer'} Section */

/**
 * @typedef {object} Placed a cell with its position on the grid
 * @property {CellSpec} spec
 * @property {number} row index of the first grid row covered
 * @property {number} col index of the first column covered
 * @property {number} rowSpan
 * @property {number} colSpan
 * @property {Section} section
 * @property {boolean} filler true for the empty cell put in an unfilled slot
 */

/**
 * @typedef {object} GridRow
 * @property {Section} section
 * @property {Row} source
 * @property {number} index position of the row inside its section
 */

/**
 * @typedef {object} Grid
 * @property {number} columnCount
 * @property {GridRow[]} rows
 * @property {Placed[][]} slots `slots[row][col]` is the cell covering that slot
 * @property {Placed[]} cells every placed cell once, in reading order
 */

/** @type {CellSpec} */
const EMPTY = Object.freeze({ value: '', colSpan: 1, rowSpan: 1, align: undefined, valign: undefined, sgr: '' });

const TITLE_CROSSED = 'a group title cannot be crossed by a cell that spans down from an earlier row';

/**
 * Lay out the rows of the three sections on one grid.
 *
 * Cells fill the free slots of their row from the left, skipping slots that
 * are covered by a cell spanning down from an earlier row, as in HTML tables.
 * Slots left over at the end of a row are filled with empty cells. A span
 * may not leave its section.
 * @param {{header: Row[], body: Row[], footer: Row[]}} sections
 * @param {number} [columnCount] fixed number of columns; inferred from the
 *   widest row when omitted
 * @returns {Grid}
 */
export function buildGrid(sections, columnCount) {
  /** @type {GridRow[]} */
  const rows = [];
  /** @type {Placed[]} */
  const cells = [];
  let widest = 0;
  for (const section of /** @type {Section[]} */ (['header', 'body', 'footer'])) {
    widest = Math.max(widest, placeSection(sections[section], section, rows.length, columnCount, cells));
    sections[section].forEach((source, index) => rows.push({ section, source, index }));
  }
  const count = columnCount ?? widest;
  /** @type {Placed[][]} */
  const slots = rows.map(() => new Array(count));
  for (const cell of cells) {
    // Whole-row cells (group titles) take whatever the final width is.
    if (cell.colSpan === Infinity) cell.colSpan = count;
    for (let r = cell.row; r < cell.row + cell.rowSpan; r++) {
      for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
        if (slots[r][c]) {
          throw new LayoutError(`${rows[r].section} row ${rows[r].index + 1}: ${TITLE_CROSSED}`);
        }
        slots[r][c] = cell;
      }
    }
  }
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < count; c++) {
      if (slots[r][c]) continue;
      const filler = { spec: EMPTY, row: r, col: c, rowSpan: 1, colSpan: 1, section: rows[r].section, filler: true };
      slots[r][c] = filler;
      cells.push(filler);
    }
  }
  cells.sort((a, b) => a.row - b.row || a.col - b.col);
  return { columnCount: count, rows, slots, cells };
}

/**
 * Place the cells of one section and return the number of columns it uses.
 * @param {Row[]} rows
 * @param {Section} section
 * @param {number} offset grid row index of the section's first row
 * @param {number | undefined} limit
 * @param {Placed[]} out
 * @returns {number}
 */
function placeSection(rows, section, offset, limit, out) {
  /** @type {boolean[][]} */
  const occupied = rows.map(() => []);
  let widest = 0;
  rows.forEach((row, r) => {
    const label = `${section} row ${r + 1}`;
    let c = 0;
    row.cells.forEach((spec, index) => {
      while (occupied[r][c]) c++;
      const colSpan = spec.colSpan === Infinity ? 1 : spec.colSpan;
      if (spec.colSpan === Infinity && c > 0) throw new LayoutError(`${label}: ${TITLE_CROSSED}`);
      if (r + spec.rowSpan > rows.length) {
        throw new LayoutError(
          `${label}: cell ${index + 1} has rowSpan ${spec.rowSpan} but only ${rows.length - r} ` +
            `${rows.length - r === 1 ? 'row remains' : 'rows remain'} in the ${section}`,
        );
      }
      if (limit !== undefined && c + colSpan > limit) {
        throw new LayoutError(
          `${label}: cell ${index + 1} would end at column ${c + colSpan} but the table has ${limit} ` +
            `column${limit === 1 ? '' : 's'}`,
        );
      }
      for (let rr = r; rr < r + spec.rowSpan; rr++) {
        for (let cc = c; cc < c + colSpan; cc++) {
          if (occupied[rr][cc]) {
            throw new LayoutError(`${label}: cell ${index + 1} overlaps a cell that spans down from an earlier row`);
          }
          occupied[rr][cc] = true;
        }
      }
      out.push({ spec, row: offset + r, col: c, rowSpan: spec.rowSpan, colSpan: spec.colSpan, section, filler: false });
      c += colSpan;
    });
    widest = Math.max(widest, occupied[r].length);
  });
  return widest;
}
