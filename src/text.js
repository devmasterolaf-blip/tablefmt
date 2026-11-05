/**
 * Text layout on top of styled cells: wrapping, truncation and padding.
 *
 * All functions are ANSI-aware. Styles and hyperlinks that are open where a
 * line is cut are closed at the end of that line and reopened on the next
 * one, so each returned line can be printed on its own.
 * @module text
 */

import { parseLines, cellsWidth, serialize, spaces } from './cells.js';
import { checkInteger, checkEnum, checkOptions } from './validate.js';

/** @typedef {import('./cells.js').Cell} Cell */
/** @typedef {'word' | 'hard'} WrapMode */
/** @typedef {'start' | 'middle' | 'end'} TruncatePosition */
/** @typedef {'left' | 'right' | 'center'} Alignment */

export const WRAP_MODES = /** @type {const} */ (['word', 'hard']);
export const TRUNCATE_POSITIONS = /** @type {const} */ (['start', 'middle', 'end']);
export const ALIGNMENTS = /** @type {const} */ (['left', 'right', 'center']);

/** Default truncation marker. */
export const ELLIPSIS = '…';
const ELLIPSIS_CELLS = parseLines(ELLIPSIS)[0];

/**
 * @param {Cell} cell
 * @returns {boolean}
 */
function isBreakingSpace(cell) {
  return cell.text === ' ' || cell.text === '\u{3000}';
}

/**
 * Break a run of cells into chunks no wider than `width`, cutting between
 * grapheme clusters. A single cluster wider than `width` (a wide character in
 * a one-column space) is placed on a line of its own and overflows.
 * @param {readonly Cell[]} cells
 * @param {number} width
 * @returns {Cell[][]} at least one line
 */
function hardBreak(cells, width) {
  /** @type {Cell[][]} */
  const lines = [];
  /** @type {Cell[]} */
  let line = [];
  let used = 0;
  for (const cell of cells) {
    if (used + cell.width > width && line.length > 0) {
      lines.push(line);
      line = [];
      used = 0;
    }
    line.push(cell);
    used += cell.width;
  }
  lines.push(line);
  return lines;
}

/**
 * Wrap one logical line of cells.
 *
 * In `word` mode lines break at spaces; the spaces at a break are dropped,
 * other runs of spaces are kept, and a word longer than the width is cut
 * between grapheme clusters. In `hard` mode the text is cut every `width`
 * columns and spaces are kept as they are.
 * @param {readonly Cell[]} cells
 * @param {number} width
 * @param {WrapMode} [mode]
 * @returns {Cell[][]} at least one (possibly empty) line
 */
export function wrapCells(cells, width, mode = 'word') {
  if (mode === 'hard') return hardBreak(cells, width);
  /** @type {Cell[][]} */
  const lines = [];
  /** @type {Cell[]} */
  let line = [];
  let used = 0;
  /** @type {Cell[]} */
  let gap = [];
  let i = 0;
  while (i < cells.length) {
    const start = i;
    const space = isBreakingSpace(cells[i]);
    while (i < cells.length && isBreakingSpace(cells[i]) === space) i++;
    const run = cells.slice(start, i);
    if (space) {
      gap = run;
      continue;
    }
    const runWidth = cellsWidth(run);
    // Spaces before a word are kept inside a line and as the indent of the
    // very first line, and dropped where the text wraps.
    const keepGap = line.length > 0 || lines.length === 0;
    const gapWidth = keepGap ? cellsWidth(gap) : 0;
    if (used + gapWidth + runWidth <= width) {
      if (keepGap) line.push(...gap);
      line.push(...run);
      used += gapWidth + runWidth;
    } else {
      if (line.length > 0) lines.push(line);
      const chunks = hardBreak(run, width);
      line = /** @type {Cell[]} */ (chunks.pop());
      lines.push(...chunks);
      used = cellsWidth(line);
    }
    gap = [];
  }
  lines.push(line);
  return lines;
}

/**
 * Wrap text to a maximum width.
 * @param {string} text may contain line breaks, which are kept
 * @param {number} width maximum line width in columns, at least 1
 * @param {{mode?: WrapMode, tabWidth?: number}} [options]
 * @returns {string[]} the wrapped lines
 */
export function wrap(text, width, options) {
  const { mode = 'word', tabWidth } = checkOptions('options', options, ['mode', 'tabWidth']);
  checkInteger('width', width, { min: 1 });
  checkEnum('mode', mode, WRAP_MODES);
  const lines = [];
  for (const line of parseLines(String(text), { tabWidth })) {
    for (const wrapped of wrapCells(line, width, mode)) lines.push(serialize(wrapped));
  }
  return lines;
}

/**
 * Take cells from the front of `cells` while they fit in `budget` columns.
 * @param {readonly Cell[]} cells
 * @param {number} budget
 * @returns {Cell[]}
 */
function takeStart(cells, budget) {
  const taken = [];
  let used = 0;
  for (const cell of cells) {
    if (used + cell.width > budget) break;
    taken.push(cell);
    used += cell.width;
  }
  return taken;
}

/**
 * Take cells from the back of `cells` while they fit in `budget` columns.
 * @param {readonly Cell[]} cells
 * @param {number} budget
 * @returns {Cell[]}
 */
function takeEnd(cells, budget) {
  let used = 0;
  let index = cells.length;
  while (index > 0 && used + cells[index - 1].width <= budget) {
    index--;
    used += cells[index].width;
  }
  return cells.slice(index);
}

/**
 * Shorten a line of cells to at most `width` columns, marking the cut with
 * an ellipsis. The ellipsis takes the colour of the text it replaces but is
 * never part of a hyperlink.
 * @param {readonly Cell[]} cells
 * @param {number} width
 * @param {TruncatePosition} [position]
 * @param {readonly Cell[]} [ellipsis]
 * @returns {Cell[]}
 */
export function truncateCells(cells, width, position = 'end', ellipsis = ELLIPSIS_CELLS) {
  if (cellsWidth(cells) <= width) return cells.slice();
  if (width <= 0) return [];
  const marker = takeStart(ellipsis, width);
  const room = width - cellsWidth(marker);
  /** @param {Cell} neighbour */
  const styled = (neighbour) => marker.map((cell) => ({ ...cell, sgr: neighbour.sgr, link: '' }));
  if (position === 'end') {
    const head = takeStart(cells, room);
    return [...head, ...styled(cells[head.length])];
  }
  if (position === 'start') {
    const tail = takeEnd(cells, room);
    return [...styled(cells[cells.length - tail.length - 1]), ...tail];
  }
  const head = takeStart(cells, Math.ceil(room / 2));
  const tail = takeEnd(cells.slice(head.length), room - cellsWidth(head));
  return [...head, ...styled(cells[head.length]), ...tail];
}

/**
 * Shorten text to at most `width` columns. Text that already fits is
 * returned with its styling normalised but otherwise unchanged; each line of
 * multi-line text is truncated separately.
 * @param {string} text
 * @param {number} width maximum width in columns, 0 or more
 * @param {{position?: TruncatePosition, ellipsis?: string, tabWidth?: number}} [options]
 * @returns {string}
 */
export function truncate(text, width, options) {
  const { position = 'end', ellipsis = ELLIPSIS, tabWidth } = checkOptions('options', options, [
    'position',
    'ellipsis',
    'tabWidth',
  ]);
  checkInteger('width', width, { min: 0 });
  checkEnum('position', position, TRUNCATE_POSITIONS);
  const marker = ellipsis === ELLIPSIS ? ELLIPSIS_CELLS : parseLines(String(ellipsis))[0];
  return parseLines(String(text), { tabWidth })
    .map((line) => serialize(truncateCells(line, width, position, marker)))
    .join('\n');
}

/**
 * Pad a line of cells with spaces to exactly `width` columns. Lines that are
 * already wider are returned unchanged. When centring leaves an odd number
 * of spare columns, the extra space goes on the right.
 * @param {readonly Cell[]} cells
 * @param {number} width
 * @param {Alignment} [align]
 * @returns {Cell[]}
 */
export function padCells(cells, width, align = 'left') {
  const spare = width - cellsWidth(cells);
  if (spare <= 0) return cells.slice();
  if (align === 'right') return [...spaces(spare), ...cells];
  if (align === 'center') {
    const left = Math.floor(spare / 2);
    return [...spaces(left), ...cells, ...spaces(spare - left)];
  }
  return [...cells, ...spaces(spare)];
}

/**
 * Pad single-line text with spaces to `width` columns.
 * @param {string} text
 * @param {number} width
 * @param {Alignment} [align]
 * @returns {string}
 */
export function pad(text, width, align = 'left') {
  checkInteger('width', width, { min: 0 });
  checkEnum('align', align, ALIGNMENTS);
  const lines = parseLines(String(text));
  return lines.map((line) => serialize(padCells(line, width, align))).join('\n');
}
