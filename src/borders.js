/**
 * Border styles and junction selection.
 *
 * A junction is the character drawn where border lines meet. Which one is
 * needed depends on the arms that leave the point (up, right, down, left),
 * encoded as a 4-bit mask. Deriving the character from the mask is what lets
 * spanned cells get correct corners and tees without special cases.
 * @module borders
 */

import { OptionError } from './errors.js';
import { checkEnum, describe } from './validate.js';

export const UP = 1;
export const RIGHT = 2;
export const DOWN = 4;
export const LEFT = 8;

/**
 * @typedef {object} BorderStyle
 * @property {string} name
 * @property {string} horizontal character for horizontal rules
 * @property {string} vertical character between columns ('' for none)
 * @property {string} junctions nine characters: the corners, tees and cross
 *   in reading order (top-left, top-tee, top-right, left-tee, cross,
 *   right-tee, bottom-left, bottom-tee, bottom-right)
 * @property {'all' | 'header' | 'none'} rules which horizontal rules exist
 * @property {boolean} edges whether the outer frame is drawn; when false the
 *   left and right edges are omitted
 * @property {boolean} caps whether the top and bottom rules are drawn
 */

/** Position of each multi-arm mask inside `BorderStyle.junctions`. */
const JUNCTION_INDEX = new Map([
  [RIGHT | DOWN, 0],
  [RIGHT | DOWN | LEFT, 1],
  [DOWN | LEFT, 2],
  [UP | RIGHT | DOWN, 3],
  [UP | RIGHT | DOWN | LEFT, 4],
  [UP | DOWN | LEFT, 5],
  [UP | RIGHT, 6],
  [UP | RIGHT | LEFT, 7],
  [UP | LEFT, 8],
]);

/**
 * @param {string} name
 * @param {string} horizontal
 * @param {string} vertical
 * @param {string} junctions
 * @param {Partial<BorderStyle>} [extra]
 * @returns {BorderStyle}
 */
function define(name, horizontal, vertical, junctions, extra = {}) {
  return Object.freeze({
    name,
    horizontal,
    vertical,
    junctions,
    rules: 'all',
    edges: true,
    caps: true,
    ...extra,
  });
}

/** The built-in border styles by name. */
export const BORDERS = Object.freeze({
  ascii: define('ascii', '-', '|', '+++++++++'),
  light: define('light', '─', '│', '┌┬┐├┼┤└┴┘'),
  heavy: define('heavy', '━', '┃', '┏┳┓┣╋┫┗┻┛'),
  double: define('double', '═', '║', '╔╦╗╠╬╣╚╩╝'),
  rounded: define('rounded', '─', '│', '╭┬╮├┼┤╰┴╯'),
  markdown: define('markdown', '-', '|', '|||||||||', { rules: 'header', caps: false }),
  none: define('none', '', '', '         ', { rules: 'none', edges: false, caps: false }),
});

/** Names of the built-in border styles. */
export const BORDER_NAMES = /** @type {(keyof typeof BORDERS)[]} */ (Object.keys(BORDERS));

/**
 * Look up a border style by name, or validate a custom style object.
 * @param {string | BorderStyle} border
 * @returns {BorderStyle}
 */
export function resolveBorder(border) {
  if (typeof border === 'string') {
    return BORDERS[checkEnum('border', border, BORDER_NAMES)];
  }
  if (border === null || typeof border !== 'object') {
    throw new OptionError('border', `expected a border name or style object, got ${describe(border)}`);
  }
  if (typeof border.horizontal !== 'string' || typeof border.vertical !== 'string') {
    throw new OptionError('border', 'a custom border needs string "horizontal" and "vertical" characters');
  }
  if (typeof border.junctions !== 'string' || [...border.junctions].length !== 9) {
    throw new OptionError('border.junctions', 'expected a string of exactly 9 junction characters');
  }
  return define(border.name ?? 'custom', border.horizontal, border.vertical, border.junctions, {
    rules: border.rules === undefined ? 'all' : checkEnum('border.rules', border.rules, ['all', 'header', 'none']),
    edges: border.edges ?? true,
    caps: border.caps ?? true,
  });
}

/**
 * Pick the character for a junction.
 * @param {BorderStyle} border
 * @param {number} mask combination of UP, RIGHT, DOWN and LEFT
 * @returns {string} the junction character; a plain line piece when the
 *   arms are collinear, and a space when there are none
 */
export function junction(border, mask) {
  const index = JUNCTION_INDEX.get(mask);
  if (index !== undefined) return [...border.junctions][index];
  if (mask === 0) return ' ';
  return mask & (LEFT | RIGHT) ? border.horizontal : border.vertical;
}
