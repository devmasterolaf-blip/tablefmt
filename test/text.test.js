import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, truncate, pad } from '../src/text.js';
import { stringWidth } from '../src/cells.js';
import { stripAnsi } from '../src/ansi.js';
import { OptionError } from '../src/errors.js';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;
const OPEN = `${ESC}]8;;https://example.com${ESC}\\`;
const CLOSE = `${ESC}]8;;${ESC}\\`;

test('wrap breaks at spaces and drops the space at the break', () => {
  assert.deepEqual(wrap('the quick brown fox', 10), ['the quick', 'brown fox']);
  assert.deepEqual(wrap('the quick brown fox', 9), ['the quick', 'brown fox']);
  assert.deepEqual(wrap('the quick brown fox', 8), ['the', 'quick', 'brown', 'fox']);
});

test('wrap returns short text unchanged', () => {
  assert.deepEqual(wrap('hello', 10), ['hello']);
  assert.deepEqual(wrap('', 10), ['']);
});

test('wrap keeps existing line breaks and empty lines', () => {
  assert.deepEqual(wrap('one two\n\nthree', 5), ['one', 'two', '', 'three']);
});

test('wrap keeps inner runs of spaces and the first-line indent', () => {
  assert.deepEqual(wrap('a  b', 10), ['a  b']);
  assert.deepEqual(wrap('  indented text here', 12), ['  indented', 'text here']);
  assert.deepEqual(wrap('trailing   ', 20), ['trailing']);
  assert.deepEqual(wrap('   ', 5), ['']);
});

test('wrap cuts words that are longer than the width', () => {
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.deepEqual(wrap('ab abcdefghij cd', 4), ['ab', 'abcd', 'efgh', 'ij', 'cd']);
  assert.deepEqual(wrap('ab abcdefgh cd', 5), ['ab', 'abcde', 'fgh', 'cd']);
});

test('wrap never splits a wide character or a grapheme cluster', () => {
  assert.deepEqual(wrap('中文字符', 3), ['中', '文', '字', '符']);
  assert.deepEqual(wrap('中文字符', 4), ['中文', '字符']);
  assert.deepEqual(wrap('e\u{0301}e\u{0301}e\u{0301}', 2), ['e\u{0301}e\u{0301}', 'e\u{0301}']);
  assert.deepEqual(wrap('👨\u{200d}👩\u{200d}👧👨\u{200d}👩\u{200d}👧', 2), ['👨\u{200d}👩\u{200d}👧', '👨\u{200d}👩\u{200d}👧']);
});

test('every wrapped line fits the width', () => {
  const text = 'Lorem ipsum dolor sit amet, 中文字符 consectetur adipiscing 👍 elit sed do';
  for (const width of [2, 3, 5, 8, 13, 21]) {
    for (const line of wrap(text, width)) assert.ok(stringWidth(line) <= width, `${width}: ${line}`);
  }
});

test('hard mode cuts every width columns and keeps spaces', () => {
  assert.deepEqual(wrap('ab cd ef', 3, { mode: 'hard' }), ['ab ', 'cd ', 'ef']);
  assert.deepEqual(wrap('abcdefg', 3, { mode: 'hard' }), ['abc', 'def', 'g']);
  assert.deepEqual(wrap('a中b', 2, { mode: 'hard' }), ['a', '中', 'b']);
});

test('a wide character in a one-column width gets a line of its own', () => {
  assert.deepEqual(wrap('a中b', 1, { mode: 'hard' }), ['a', '中', 'b']);
});

test('wrap reopens SGR styles on each line and closes them at the end', () => {
  const lines = wrap(`${ESC}[1;31mred text here${RESET} plain`, 8);
  assert.deepEqual(lines, [
    `${ESC}[1;31mred text${RESET}`,
    `${ESC}[1;31mhere${RESET}`,
    'plain',
  ]);
});

test('wrap carries hyperlinks across lines', () => {
  const lines = wrap(`${OPEN}click here now${CLOSE}`, 10);
  assert.deepEqual(lines, [`${OPEN}click here${CLOSE}`, `${OPEN}now${CLOSE}`]);
});

test('wrap measures width without the escape sequences', () => {
  const lines = wrap(`${ESC}[32mgreen${RESET} and ${ESC}[34mblue${RESET}`, 9);
  assert.deepEqual(lines.map(stripAnsi), ['green and', 'blue']);
});

test('wrap validates its arguments', () => {
  assert.throws(() => wrap('a', 0), OptionError);
  assert.throws(() => wrap('a', 2.5), OptionError);
  assert.throws(() => wrap('a', 5, { mode: 'soft' }), /expected one of word, hard/);
  assert.throws(() => wrap('a', 5, { mod: 'word' }), /unknown option \(did you mean "mode"\?\)/);
});

test('truncate at the end adds an ellipsis', () => {
  assert.equal(truncate('hello world', 8), 'hello w…');
  assert.equal(truncate('hello', 5), 'hello');
  assert.equal(truncate('hello', 10), 'hello');
  assert.equal(truncate('hello', 1), '…');
  assert.equal(truncate('hello', 0), '');
});

test('truncate at the start and in the middle', () => {
  assert.equal(truncate('hello world', 8, { position: 'start' }), '…o world');
  assert.equal(truncate('hello world', 8, { position: 'middle' }), 'hell…rld');
  assert.equal(truncate('hello world', 7, { position: 'middle' }), 'hel…rld');
  assert.equal(truncate('abcdef', 2, { position: 'middle' }), 'a…');
});

test('truncate accepts a custom ellipsis', () => {
  assert.equal(truncate('hello world', 8, { ellipsis: '...' }), 'hello...');
  assert.equal(truncate('hello world', 8, { ellipsis: '' }), 'hello wo');
  assert.equal(truncate('hello world', 2, { ellipsis: '...' }), '..', 'the marker itself is cut');
});

test('truncate does not split wide characters', () => {
  assert.equal(truncate('中文字符', 5), '中文…');
  assert.equal(truncate('中文字符', 4), '中…');
  assert.equal(truncate('中文字符', 5, { position: 'start' }), '…字符');
  assert.equal(truncate('中文字符集', 6, { position: 'middle' }), '中…字符集'.length === 0 ? '' : '中…集');
  assert.ok(stringWidth(truncate('中文字符', 4)) <= 4);
});

test('truncate gives the middle cut the columns a wide character could not use', () => {
  assert.equal(truncate('中文abcdef', 6, { position: 'middle' }), '中…def');
});

test('truncate keeps styles balanced and colours the ellipsis', () => {
  assert.equal(truncate(`${ESC}[31mhello world${RESET}`, 6), `${ESC}[31mhello…${RESET}`);
  assert.equal(truncate(`${ESC}[31mhello${RESET} world`, 8), `${ESC}[31mhello${RESET} w…`);
});

test('truncate closes a cut hyperlink and leaves the ellipsis outside it', () => {
  assert.equal(truncate(`${OPEN}hello world${CLOSE}`, 6), `${OPEN}hello${CLOSE}…`);
});

test('truncate handles each line of multi-line text', () => {
  assert.equal(truncate('abcdef\nab\nabcdefgh', 4), 'abc…\nab\nabc…');
});

test('truncate validates its arguments', () => {
  assert.throws(() => truncate('a', -1), OptionError);
  assert.throws(() => truncate('a', 3, { position: 'centre' }), /expected one of start, middle, end/);
});

test('pad aligns text within a width', () => {
  assert.equal(pad('ab', 6), 'ab    ');
  assert.equal(pad('ab', 6, 'right'), '    ab');
  assert.equal(pad('ab', 6, 'center'), '  ab  ');
  assert.equal(pad('ab', 5, 'center'), ' ab  ', 'odd spare column goes right');
  assert.equal(pad('abcdef', 3), 'abcdef', 'never truncates');
});

test('pad counts display width and leaves padding unstyled', () => {
  assert.equal(pad('中文', 6, 'right'), '  中文');
  assert.equal(pad(`${ESC}[31mab${RESET}`, 4), `${ESC}[31mab${RESET}  `);
  assert.throws(() => pad('a', 3, 'middle'), OptionError);
});
