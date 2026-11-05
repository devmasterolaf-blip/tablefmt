/**
 * Styled cells: the common intermediate form for all text layout.
 *
 * A string is parsed into lines of cells, one cell per grapheme cluster, each
 * carrying its display width and the SGR state and hyperlink that are active
 * at that point. Wrapping, truncation and padding then work on plain arrays,
 * and `serialize` writes a line back out with exactly the escape sequences it
 * needs, so every output line is self-contained: styles are reopened at the
 * start of a line and closed at its end.
 * @module cells
 */

import { tokenize, applySgr, sgrTransition, linkSequence, SGR_RESET, LINK_CLOSE } from './ansi.js';
import { graphemes, graphemeWidth, plainWidth } from './width.js';
import { checkInteger } from './validate.js';

/**
 * @typedef {object} Cell
 * @property {string} text one grapheme cluster
 * @property {number} width display width in columns (0, 1 or 2)
 * @property {string} sgr canonical SGR state active for this cell
 * @property {string} link OSC 8 `params;url` body, or '' when not in a link
 */

/** Default distance between tab stops. */
export const DEFAULT_TAB_WIDTH = 8;

const LINE_BREAK = /\r\n|\r|\n/;
const NEEDS_PARSING = /[\x00-\x1f\x7f-\x9f]/;

/**
 * Parse text into lines of styled cells.
 *
 * SGR and OSC 8 sequences update the running state and produce no cells;
 * every other escape sequence and stray control character is dropped. Tabs
 * expand to spaces up to the next tab stop, counted from the start of the
 * line. Line breaks (`\n`, `\r\n`, `\r`) start a new line and do not reset
 * the style state.
 * @param {string} text
 * @param {{tabWidth?: number}} [options]
 * @returns {Cell[][]} at least one line
 */
export function parseLines(text, { tabWidth = DEFAULT_TAB_WIDTH } = {}) {
  checkInteger('tabWidth', tabWidth, { min: 0 });
  /** @type {Cell[][]} */
  const lines = [[]];
  let line = lines[0];
  let column = 0;
  let sgr = '';
  let link = '';
  for (const token of tokenize(text)) {
    if (token.type === 'sgr') {
      sgr = applySgr(sgr, token.params);
    } else if (token.type === 'link') {
      link = token.url === '' ? '' : `${token.params};${token.url}`;
    } else if (token.type === 'text') {
      const parts = token.value.split(LINE_BREAK);
      for (let p = 0; p < parts.length; p++) {
        if (p > 0) {
          line = [];
          lines.push(line);
          column = 0;
        }
        for (const cluster of graphemes(parts[p])) {
          if (cluster === '\t') {
            const spaces = tabWidth === 0 ? 0 : tabWidth - (column % tabWidth);
            for (let s = 0; s < spaces; s++) line.push({ text: ' ', width: 1, sgr, link });
            column += spaces;
            continue;
          }
          const first = cluster.charCodeAt(0);
          if (first < 0x20 || (first >= 0x7f && first < 0xa0)) continue;
          const width = graphemeWidth(cluster);
          line.push({ text: cluster, width, sgr, link });
          column += width;
        }
      }
    }
  }
  return lines;
}

/**
 * Total display width of a line of cells.
 * @param {readonly Cell[]} cells
 * @returns {number}
 */
export function cellsWidth(cells) {
  let width = 0;
  for (const cell of cells) width += cell.width;
  return width;
}

/**
 * Write a line of cells back to a string, emitting escape sequences only
 * where the style or hyperlink changes and closing both at the end.
 * @param {readonly Cell[]} cells
 * @returns {string}
 */
export function serialize(cells) {
  let out = '';
  let sgr = '';
  let link = '';
  for (const cell of cells) {
    if (cell.link !== link) {
      link = cell.link;
      out += linkSequence(link);
    }
    if (cell.sgr !== sgr) {
      out += sgrTransition(sgr, cell.sgr);
      sgr = cell.sgr;
    }
    out += cell.text;
  }
  if (sgr !== '') out += SGR_RESET;
  if (link !== '') out += LINK_CLOSE;
  return out;
}

/**
 * Make `count` unstyled space cells.
 * @param {number} count
 * @returns {Cell[]}
 */
export function spaces(count) {
  const cells = [];
  for (let i = 0; i < count; i++) cells.push({ text: ' ', width: 1, sgr: '', link: '' });
  return cells;
}

/**
 * Display width of a string: the width of its widest line, ignoring escape
 * sequences and expanding tabs.
 * @param {string} text
 * @param {{tabWidth?: number}} [options]
 * @returns {number}
 */
export function stringWidth(text, options) {
  if (!NEEDS_PARSING.test(text)) return plainWidth(text);
  let widest = 0;
  for (const line of parseLines(text, options)) {
    const width = cellsWidth(line);
    if (width > widest) widest = width;
  }
  return widest;
}

/**
 * Replace tabs by spaces up to the next tab stop, keeping SGR styles and
 * hyperlinks. Text without tabs is returned unchanged.
 * @param {string} text
 * @param {number} [tabWidth]
 * @returns {string}
 */
export function expandTabs(text, tabWidth = DEFAULT_TAB_WIDTH) {
  if (!text.includes('\t')) return text;
  return parseLines(text, { tabWidth }).map(serialize).join('\n');
}
