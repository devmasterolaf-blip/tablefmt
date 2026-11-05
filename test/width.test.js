import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isWide, codePointWidth, graphemes, graphemeWidth, plainWidth } from '../src/width.js';

test('ASCII is one column per character', () => {
  assert.equal(plainWidth(''), 0);
  assert.equal(plainWidth('hello, world'), 12);
  assert.equal(plainWidth('~ !'), 3);
});

test('control characters take no columns', () => {
  assert.equal(codePointWidth(0x00), 0);
  assert.equal(codePointWidth(0x1b), 0);
  assert.equal(codePointWidth(0x7f), 0);
  assert.equal(codePointWidth(0x9b), 0);
  assert.equal(plainWidth('a\u0007b'), 2);
});

test('Latin-1 and other narrow scripts are one column', () => {
  assert.equal(plainWidth('café'), 4);
  assert.equal(plainWidth('Ελληνικά'), 8);
  assert.equal(plainWidth('привет'), 6);
  assert.equal(codePointWidth(0xad), 1, 'soft hyphen is drawn by terminals');
});

test('East Asian wide and fullwidth characters are two columns', () => {
  assert.equal(plainWidth('中文'), 4);
  assert.equal(plainWidth('日本語テキスト'), 14);
  assert.equal(plainWidth('한글'), 4);
  assert.equal(plainWidth('ＡＢＣ'), 6, 'fullwidth Latin');
  assert.equal(plainWidth('、。'), 4, 'CJK punctuation');
  assert.equal(plainWidth('𠀀'), 2, 'supplementary ideograph');
});

test('halfwidth forms stay narrow', () => {
  assert.equal(plainWidth('ｱｲｳ'), 3);
  assert.equal(plainWidth('￨'), 1);
});

test('isWide finds range edges by binary search', () => {
  assert.equal(isWide(0x10ff), false);
  assert.equal(isWide(0x1100), true);
  assert.equal(isWide(0x115f), true);
  assert.equal(isWide(0x1160), false);
  assert.equal(isWide(0x303e), true);
  assert.equal(isWide(0x303f), false);
  assert.equal(isWide(0x3fffd), true);
  assert.equal(isWide(0x3fffe), false);
  assert.equal(isWide(0x41), false);
});

test('combining marks attach to their base', () => {
  assert.equal(plainWidth('e\u{0301}'), 1);
  assert.equal(plainWidth('a\u{0308}\u{0304}'), 1, 'two stacked marks');
  assert.deepEqual(graphemes('e\u{0301}x'), ['e\u{0301}', 'x']);
  assert.equal(codePointWidth(0x0301), 0);
});

test('zero-width characters take no columns', () => {
  assert.equal(plainWidth('a\u{200b}b'), 2, 'zero width space');
  assert.equal(plainWidth('a\u{200d}b'), 2, 'zero width joiner');
  assert.equal(plainWidth('\u{feff}ab'), 2, 'byte order mark');
  assert.equal(plainWidth('a\u{2060}b'), 2, 'word joiner');
});

test('decomposed Hangul jamo form one wide cluster', () => {
  const decomposed = '\u{1112}\u{1161}\u{11ab}';
  assert.equal(graphemes(decomposed).length, 1);
  assert.equal(plainWidth(decomposed), 2);
  assert.equal(codePointWidth(0x1161), 0);
});

test('emoji with default emoji presentation are two columns', () => {
  assert.equal(plainWidth('👍'), 2);
  assert.equal(plainWidth('🚀🚀'), 4);
  assert.equal(plainWidth('⌚'), 2);
});

test('emoji modifiers and ZWJ sequences count once', () => {
  assert.equal(plainWidth('👍🏽'), 2, 'skin tone modifier');
  assert.equal(plainWidth('👨\u{200d}👩\u{200d}👧\u{200d}👦'), 2, 'family joined with ZWJ');
  assert.equal(plainWidth('🏳\u{fe0f}\u{200d}🌈'), 2, 'rainbow flag');
  assert.equal(graphemes('a👨\u{200d}👩\u{200d}👧b').length, 3);
});

test('regional indicator pairs form one flag', () => {
  assert.equal(plainWidth('🇯🇵'), 2);
  assert.equal(plainWidth('🇯🇵🇫🇷'), 4);
});

test('variation selectors switch between text and emoji width', () => {
  assert.equal(plainWidth('❤'), 1, 'heavy black heart defaults to text');
  assert.equal(plainWidth('❤\u{fe0f}'), 2, 'VS16 asks for emoji presentation');
  assert.equal(plainWidth('⌚\u{fe0e}'), 1, 'VS15 asks for text presentation');
  assert.equal(plainWidth('1\u{fe0f}\u{20e3}'), 2, 'keycap sequence');
  assert.equal(plainWidth('a\u{fe0f}'), 1, 'VS16 after a non-emoji changes nothing');
});

test('graphemeWidth of a lone zero-width cluster is zero', () => {
  assert.equal(graphemeWidth('\u{200b}'), 0);
  assert.equal(graphemeWidth('\u{0301}'), 0);
});

test('graphemes keeps printable ASCII on the fast path', () => {
  assert.deepEqual(graphemes('abc'), ['a', 'b', 'c']);
  assert.deepEqual(graphemes(''), []);
});

test('mixed text sums cluster widths', () => {
  assert.equal(plainWidth('a中b👍c\u{0301}'), 1 + 2 + 1 + 2 + 1);
});
