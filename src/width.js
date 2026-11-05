/**
 * Display width of Unicode text in a terminal, measured in columns.
 *
 * Text is split into grapheme clusters with `Intl.Segmenter`; each cluster is
 * then measured as a unit, so a base letter with combining marks, a flag, or
 * an emoji joined with ZWJ counts once. This module knows nothing about ANSI
 * escape sequences; see `cells.js` for escape-aware measuring.
 * @module width
 */

/**
 * Inclusive code point ranges that occupy two columns: East Asian Wide and
 * Fullwidth characters. Emoji are handled separately through the
 * `Emoji_Presentation` property. Sorted, non-overlapping, flattened as
 * [start, end, start, end, ...].
 */
const WIDE_RANGES = [
  0x1100, 0x115f, // Hangul Jamo initial consonants
  0x2329, 0x232a, // angle brackets
  0x2e80, 0x303e, // CJK radicals, Kangxi, CJK symbols and punctuation
  0x3041, 0x33ff, // Hiragana, Katakana, Bopomofo, Hangul compatibility, CJK compatibility
  0x3400, 0x4dbf, // CJK extension A
  0x4e00, 0x9fff, // CJK unified ideographs
  0xa000, 0xa4cf, // Yi
  0xa960, 0xa97f, // Hangul Jamo extended-A
  0xac00, 0xd7a3, // Hangul syllables
  0xf900, 0xfaff, // CJK compatibility ideographs
  0xfe10, 0xfe19, // vertical forms
  0xfe30, 0xfe6f, // CJK compatibility forms, small form variants
  0xff01, 0xff60, // fullwidth ASCII variants
  0xffe0, 0xffe6, // fullwidth signs
  0x16fe0, 0x16fe4, // ideographic symbols
  0x17000, 0x18cff, // Tangut, Khitan
  0x1b000, 0x1b2ff, // Kana supplement and extensions
  0x1f200, 0x1f251, // enclosed ideographic supplement
  0x20000, 0x2fffd, // CJK extension B and later, plane 2
  0x30000, 0x3fffd, // plane 3
];

/** Format characters that are drawn even though their category is Cf. */
const VISIBLE_FORMAT = new Set([
  0x00ad, 0x0600, 0x0601, 0x0602, 0x0603, 0x0604, 0x0605, 0x06dd, 0x070f, 0x0890, 0x0891,
  0x08e2, 0x110bd, 0x110cd,
]);

const ZERO_WIDTH = /^[\p{Mn}\p{Me}\p{Cf}\u{1160}-\u{11ff}\u{2028}\u{2029}]$/u;
const EMOJI_PRESENTATION = /^\p{Emoji_Presentation}$/u;
const PICTOGRAPHIC_START = /^\p{Extended_Pictographic}/u;
const PRINTABLE_ASCII = /^[\x20-\x7e]*$/;

const VS15 = '\u{fe0e}';
const VS16 = '\u{fe0f}';
const KEYCAP = '\u{20e3}';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * Whether a code point is East Asian Wide or Fullwidth.
 * @param {number} codePoint
 * @returns {boolean}
 */
export function isWide(codePoint) {
  if (codePoint < WIDE_RANGES[0]) return false;
  let low = 0;
  let high = WIDE_RANGES.length / 2 - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (codePoint < WIDE_RANGES[mid * 2]) high = mid - 1;
    else if (codePoint > WIDE_RANGES[mid * 2 + 1]) low = mid + 1;
    else return true;
  }
  return false;
}

/**
 * Width of a single code point taken on its own: 0 for control, combining and
 * invisible format characters, 2 for wide characters and emoji that default
 * to emoji presentation, otherwise 1.
 * @param {number} codePoint
 * @returns {0 | 1 | 2}
 */
export function codePointWidth(codePoint) {
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint < 0xa0)) return 0;
  if (codePoint < 0x300) return 1;
  if (VISIBLE_FORMAT.has(codePoint)) return 1;
  const char = String.fromCodePoint(codePoint);
  if (ZERO_WIDTH.test(char)) return 0;
  if (isWide(codePoint) || EMOJI_PRESENTATION.test(char)) return 2;
  return 1;
}

/**
 * Split text into grapheme clusters (user-perceived characters).
 * @param {string} text
 * @returns {string[]}
 */
export function graphemes(text) {
  if (PRINTABLE_ASCII.test(text)) return text.split('');
  const result = [];
  for (const { segment } of segmenter.segment(text)) result.push(segment);
  return result;
}

/**
 * Width of one grapheme cluster. The cluster is as wide as its widest code
 * point, with two adjustments for emoji: a variation selector 16 (or a keycap
 * mark) forces the two-column emoji form, and a variation selector 15 asks
 * for the narrow text form.
 * @param {string} cluster a single grapheme cluster
 * @returns {0 | 1 | 2}
 */
export function graphemeWidth(cluster) {
  if (cluster.length === 1) return codePointWidth(cluster.charCodeAt(0));
  if (cluster.includes(VS16) && (PICTOGRAPHIC_START.test(cluster) || cluster.includes(KEYCAP))) {
    return 2;
  }
  const first = /** @type {number} */ (cluster.codePointAt(0));
  if (cluster.includes(VS15) && !isWide(first)) {
    return codePointWidth(first) === 0 ? 0 : 1;
  }
  let width = 0;
  for (const char of cluster) {
    const w = codePointWidth(/** @type {number} */ (char.codePointAt(0)));
    if (w > width) width = w;
    if (width === 2) break;
  }
  return /** @type {0 | 1 | 2} */ (width);
}

/**
 * Display width of plain text that contains no escape sequences. Tabs and
 * other control characters count as zero columns here; callers that need tab
 * stops expand them first.
 * @param {string} text
 * @returns {number}
 */
export function plainWidth(text) {
  if (PRINTABLE_ASCII.test(text)) return text.length;
  let width = 0;
  for (const { segment } of segmenter.segment(text)) width += graphemeWidth(segment);
  return width;
}
