/**
 * A small style API: turn style descriptions into SGR parameters, apply them
 * to text, and decide from the environment whether colour should be used.
 * @module style
 */

import { applySgr, mergeSgr } from './ansi.js';
import { parseLines, serialize } from './cells.js';
import { OptionError } from './errors.js';
import { describe, suggest } from './validate.js';

/**
 * @typedef {object} StyleObject
 * @property {string | number} [fg] foreground: a colour name, `#rgb`/`#rrggbb`, or a 0-255 palette index
 * @property {string | number} [bg] background, same forms as `fg`
 * @property {boolean} [bold]
 * @property {boolean} [dim]
 * @property {boolean} [italic]
 * @property {boolean} [underline]
 * @property {boolean} [inverse]
 * @property {boolean} [strikethrough]
 */

/**
 * A style is either an object or a space-separated shorthand such as
 * `"bold red bg:blue"` or `"underline #ff8800"`.
 * @typedef {StyleObject | string} Style
 */

/**
 * @typedef {object} ColorEnvironment
 * @property {Record<string, string | undefined>} [env] environment variables
 * @property {boolean} [isTTY] whether output goes to a terminal
 */

const COLOR_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];
const MODIFIERS = new Map([
  ['bold', '1'], ['dim', '2'], ['italic', '3'], ['underline', '4'], ['inverse', '7'],
  ['strikethrough', '9'],
]);
const STYLE_KEYS = ['fg', 'bg', ...MODIFIERS.keys()];
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * SGR parameters for one colour.
 * @param {string | number} color
 * @param {'fg' | 'bg'} target
 * @returns {string}
 */
function colorParams(color, target) {
  const offset = target === 'fg' ? 0 : 10;
  if (typeof color === 'number') {
    if (!Number.isInteger(color) || color < 0 || color > 255) {
      throw new OptionError(`style.${target}`, `palette index must be an integer from 0 to 255, got ${color}`);
    }
    return `${38 + offset};5;${color}`;
  }
  if (typeof color !== 'string') {
    throw new OptionError(`style.${target}`, `expected a colour name, hex string or palette index, got ${describe(color)}`);
  }
  if (HEX.test(color)) {
    let hex = color.slice(1);
    if (hex.length === 3) hex = hex.replace(/./g, '$&$&');
    const value = Number.parseInt(hex, 16);
    return `${38 + offset};2;${value >> 16};${(value >> 8) & 255};${value & 255}`;
  }
  const name = color.toLowerCase();
  if (name === 'gray' || name === 'grey') return String(90 + offset);
  const bright = name.startsWith('bright-');
  const index = COLOR_NAMES.indexOf(bright ? name.slice(7) : name);
  if (index === -1) {
    const known = [...COLOR_NAMES, 'gray', ...COLOR_NAMES.map((n) => `bright-${n}`)];
    const hint = suggest(name, known);
    throw new OptionError(
      `style.${target}`,
      `unknown colour ${describe(color)}${hint ? ` (did you mean "${hint}"?)` : ''}`,
    );
  }
  return String((bright ? 90 : 30) + index + offset);
}

/**
 * Parse the string shorthand into a style object.
 * @param {string} shorthand
 * @returns {StyleObject}
 */
function parseShorthand(shorthand) {
  /** @type {Record<string, any>} */
  const style = {};
  for (const word of shorthand.split(/\s+/).filter(Boolean)) {
    if (MODIFIERS.has(word)) style[word] = true;
    else if (word.startsWith('bg:')) style.bg = word.slice(3);
    else style.fg = word;
  }
  return style;
}

/**
 * Convert a style description to a canonical SGR state string.
 * @param {Style | null | undefined} style
 * @returns {string} SGR parameters, or '' for "no styling"
 */
export function styleToSgr(style) {
  if (style === undefined || style === null || style === '') return '';
  const spec = typeof style === 'string' ? parseShorthand(style) : style;
  if (typeof spec !== 'object' || Array.isArray(spec)) {
    throw new OptionError('style', `expected a style object or string, got ${describe(style)}`);
  }
  const params = [];
  for (const [key, value] of Object.entries(spec)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'fg' || key === 'bg') {
      params.push(colorParams(value, key));
    } else if (MODIFIERS.has(key)) {
      if (value !== true) throw new OptionError(`style.${key}`, `expected a boolean, got ${describe(value)}`);
      params.push(/** @type {string} */ (MODIFIERS.get(key)));
    } else {
      const hint = suggest(key, STYLE_KEYS);
      throw new OptionError(`style.${key}`, `unknown style property${hint ? ` (did you mean "${hint}"?)` : ''}`);
    }
  }
  return params.length === 0 ? '' : applySgr('', params.join(';'));
}

/**
 * Decide whether colour output should be used.
 *
 * `NO_COLOR` (any non-empty value) turns colour off and takes precedence.
 * `FORCE_COLOR` turns it on unless it is `0` or `false`. Otherwise colour is
 * used only when writing to a terminal that is not `TERM=dumb`.
 * @param {ColorEnvironment} [environment]
 * @returns {boolean}
 */
export function detectColor({ env = {}, isTTY = false } = {}) {
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0' && env.FORCE_COLOR !== 'false';
  if (env.TERM === 'dumb') return false;
  return Boolean(isTTY);
}

/**
 * Apply an SGR state to cells as an outer style: attributes the cells
 * already carry win over the ones being applied.
 * @param {readonly import('./cells.js').Cell[]} cells
 * @param {string} sgr canonical SGR state
 * @returns {import('./cells.js').Cell[]}
 */
export function styleCells(cells, sgr) {
  if (sgr === '') return cells.slice();
  return cells.map((cell) => ({ ...cell, sgr: mergeSgr(sgr, cell.sgr) }));
}

/**
 * Remove all styling and hyperlinks from cells.
 * @param {readonly import('./cells.js').Cell[]} cells
 * @returns {import('./cells.js').Cell[]}
 */
export function unstyleCells(cells) {
  return cells.map((cell) => (cell.sgr === '' && cell.link === '' ? cell : { ...cell, sgr: '', link: '' }));
}

/**
 * @typedef {object} Styler
 * @property {boolean} enabled whether escape sequences are produced
 * @property {(text: string, style: Style) => string} style apply a style to text
 * @property {(text: string, url: string) => string} link make text a terminal hyperlink
 * @property {(text: string) => string} strip remove styling when colour is disabled
 */

/**
 * Create a styler bound to an environment. When colour is disabled every
 * method returns plain text, so callers never need to branch.
 * @param {ColorEnvironment & {color?: boolean}} [options] `color` overrides detection
 * @returns {Styler}
 */
export function createStyler(options = {}) {
  const enabled = typeof options.color === 'boolean' ? options.color : detectColor(options);
  return {
    enabled,
    style(text, style) {
      const sgr = styleToSgr(style);
      const lines = parseLines(String(text));
      if (!enabled) return lines.map((line) => serialize(unstyleCells(line))).join('\n');
      return lines.map((line) => serialize(styleCells(line, sgr))).join('\n');
    },
    link(text, url) {
      if (typeof url !== 'string' || url === '' || /[\x00-\x1f\x7f]/.test(url)) {
        throw new OptionError('url', `expected a non-empty URL without control characters, got ${describe(url)}`);
      }
      const lines = parseLines(String(text));
      if (!enabled) return lines.map((line) => serialize(unstyleCells(line))).join('\n');
      return lines
        .map((line) => serialize(line.map((cell) => ({ ...cell, link: `;${url}` }))))
        .join('\n');
    },
    strip(text) {
      if (enabled) return text;
      return parseLines(String(text)).map((line) => serialize(unstyleCells(line))).join('\n');
    },
  };
}
