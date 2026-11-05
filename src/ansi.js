/**
 * ANSI escape sequence handling: tokenizing, stripping, and tracking of the
 * graphic rendition (SGR) state and OSC 8 hyperlinks.
 *
 * SGR state is represented as a canonical parameter string such as `"1;31"`
 * (bold, red foreground); the empty string means "no attributes". Keeping the
 * state as a string makes it cheap to compare and to attach to every cell of
 * text.
 * @module ansi
 */

/**
 * @typedef {{type: 'text', value: string}
 *   | {type: 'sgr', value: string, params: string}
 *   | {type: 'link', value: string, params: string, url: string}
 *   | {type: 'escape', value: string}} Token
 */

// CSI sequence | OSC sequence (BEL or ST terminated) | charset selection | other two-byte escape
const ESCAPE_SOURCE =
  '\\x1b\\[[0-?]*[ -/]*[@-~]|\\x1b\\][^\\x07\\x1b]*(?:\\x07|\\x1b\\\\)|\\x1b[()][0-9A-Za-z]|\\x1b[@-Z\\\\^_`a-z0-9=>]';
const ESCAPE = new RegExp(ESCAPE_SOURCE, 'g');
const SGR = /^\x1b\[([0-9;:]*)m$/;
const OSC8 = /^\x1b\]8;([^;]*);([^\x07\x1b]*)(?:\x07|\x1b\\)$/;

/** Sequence that resets every SGR attribute. */
export const SGR_RESET = '\x1b[0m';
/** Sequence that closes an OSC 8 hyperlink. */
export const LINK_CLOSE = '\x1b]8;;\x1b\\';

/**
 * Whether the text contains at least one escape character.
 * @param {string} text
 * @returns {boolean}
 */
export function hasAnsi(text) {
  return text.includes('\x1b');
}

/**
 * Remove every recognised escape sequence from the text.
 * @param {string} text
 * @returns {string}
 */
export function stripAnsi(text) {
  return hasAnsi(text) ? text.replace(ESCAPE, '') : text;
}

/**
 * Split text into runs of plain text and escape sequences.
 * @param {string} text
 * @returns {Token[]}
 */
export function tokenize(text) {
  /** @type {Token[]} */
  const tokens = [];
  if (!hasAnsi(text)) {
    if (text !== '') tokens.push({ type: 'text', value: text });
    return tokens;
  }
  let last = 0;
  for (const match of text.matchAll(ESCAPE)) {
    const index = /** @type {number} */ (match.index);
    if (index > last) tokens.push({ type: 'text', value: text.slice(last, index) });
    tokens.push(classify(match[0]));
    last = index + match[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

/**
 * @param {string} sequence
 * @returns {Token}
 */
function classify(sequence) {
  const sgr = SGR.exec(sequence);
  if (sgr) return { type: 'sgr', value: sequence, params: sgr[1] };
  const link = OSC8.exec(sequence);
  if (link) return { type: 'link', value: sequence, params: link[1], url: link[2] };
  return { type: 'escape', value: sequence };
}

/**
 * Attribute slots in the order they are written out. Each slot holds at most
 * one active parameter (for colours, the whole `38;5;n` or `38;2;r;g;b` run).
 */
const SLOTS = [
  'bold', 'dim', 'italic', 'underline', 'blink', 'inverse', 'hidden', 'strike', 'overline',
  'fg', 'bg', 'ul',
];

/** Codes that set a slot. */
const SETTERS = new Map([
  [1, 'bold'], [2, 'dim'], [3, 'italic'], [4, 'underline'], [21, 'underline'], [5, 'blink'],
  [6, 'blink'], [7, 'inverse'], [8, 'hidden'], [9, 'strike'], [53, 'overline'],
]);

/** Codes that clear one or more slots. */
const RESETTERS = new Map([
  [22, ['bold', 'dim']], [23, ['italic']], [24, ['underline']], [25, ['blink']],
  [27, ['inverse']], [28, ['hidden']], [29, ['strike']], [55, ['overline']],
  [39, ['fg']], [49, ['bg']], [59, ['ul']],
]);

const EXTENDED = new Map([[38, 'fg'], [48, 'bg'], [58, 'ul']]);

/** @type {Map<string, Map<string, string>>} */
const slotCache = new Map();
/** @type {Map<string, string>} */
const applyCache = new Map();
const CACHE_LIMIT = 4096;

/**
 * Parse a canonical state string into its slots.
 * @param {string} state
 * @returns {Map<string, string>}
 */
function slotsOf(state) {
  let slots = slotCache.get(state);
  if (!slots) {
    slots = new Map();
    applyParams(slots, state);
    if (slotCache.size >= CACHE_LIMIT) slotCache.clear();
    slotCache.set(state, slots);
  }
  return slots;
}

/**
 * Apply SGR parameters to a mutable slot map.
 * @param {Map<string, string>} slots
 * @param {string} params
 */
function applyParams(slots, params) {
  const parts = params === '' ? ['0'] : params.split(';');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const code = part === '' ? 0 : Number.parseInt(part, 10);
    if (code === 0) {
      slots.clear();
    } else if (EXTENDED.has(code)) {
      let value = part;
      if (!part.includes(':')) {
        // 38;5;n takes two more parameters, 38;2;r;g;b takes four more.
        const extra = parts[i + 1] === '5' ? 2 : parts[i + 1] === '2' ? 4 : 0;
        value = parts.slice(i, i + 1 + extra).join(';');
        i += extra;
      }
      slots.set(/** @type {string} */ (EXTENDED.get(code)), value);
    } else if (SETTERS.has(code)) {
      slots.set(/** @type {string} */ (SETTERS.get(code)), part);
    } else if (RESETTERS.has(code)) {
      for (const slot of /** @type {string[]} */ (RESETTERS.get(code))) slots.delete(slot);
    } else if ((code >= 30 && code <= 37) || (code >= 90 && code <= 97)) {
      slots.set('fg', part);
    } else if ((code >= 40 && code <= 47) || (code >= 100 && code <= 107)) {
      slots.set('bg', part);
    }
    // Anything else (fonts, ideogram attributes) is not tracked.
  }
}

/**
 * @param {Map<string, string>} slots
 * @returns {string}
 */
function canonical(slots) {
  const values = [];
  for (const slot of SLOTS) {
    const value = slots.get(slot);
    if (value !== undefined) values.push(value);
  }
  return values.join(';');
}

/**
 * Compute the SGR state that results from applying `params` (the text
 * between `ESC[` and `m`) on top of `state`.
 * @param {string} state canonical state
 * @param {string} params raw SGR parameters; the empty string is a reset
 * @returns {string} canonical state
 */
export function applySgr(state, params) {
  const key = `${state}\n${params}`;
  let result = applyCache.get(key);
  if (result === undefined) {
    const slots = new Map(slotsOf(state));
    applyParams(slots, params);
    result = canonical(slots);
    if (applyCache.size >= CACHE_LIMIT) applyCache.clear();
    applyCache.set(key, result);
  }
  return result;
}

/**
 * Overlay `inner` attributes on `outer` ones: slots set by `inner` win, the
 * rest come from `outer`.
 * @param {string} outer canonical state
 * @param {string} inner canonical state
 * @returns {string}
 */
export function mergeSgr(outer, inner) {
  if (inner === '') return outer;
  if (outer === '') return inner;
  return applySgr(outer, inner);
}

/**
 * Shortest escape sequence that moves the terminal from one SGR state to
 * another. Returns the empty string when the states are equal.
 * @param {string} from canonical state
 * @param {string} to canonical state
 * @returns {string}
 */
export function sgrTransition(from, to) {
  if (from === to) return '';
  if (to === '') return SGR_RESET;
  if (from === '') return `\x1b[${to}m`;
  const before = slotsOf(from);
  const after = slotsOf(to);
  const changed = [];
  for (const slot of SLOTS) {
    const value = after.get(slot);
    if (value === undefined) {
      // A slot was switched off: reset and restate everything that remains.
      if (before.has(slot)) return `\x1b[0;${to}m`;
    } else if (before.get(slot) !== value) {
      changed.push(value);
    }
  }
  return `\x1b[${changed.join(';')}m`;
}

/**
 * Escape sequence that switches the active hyperlink. `link` is the
 * `params;url` body of an OSC 8 sequence, or the empty string for "no link".
 * @param {string} link
 * @returns {string}
 */
export function linkSequence(link) {
  return link === '' ? LINK_CLOSE : `\x1b]8;${link}\x1b\\`;
}
