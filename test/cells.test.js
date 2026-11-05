import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLines, cellsWidth, serialize, spaces, stringWidth, expandTabs } from '../src/cells.js';
import { OptionError } from '../src/errors.js';

const ESC = '\x1b';
const red = (text) => `${ESC}[31m${text}${ESC}[0m`;
const link = (text, url) => `${ESC}]8;;${url}${ESC}\\${text}${ESC}]8;;${ESC}\\`;

test('parseLines yields one cell per grapheme with its width', () => {
  const [line] = parseLines('a中e\u{0301}');
  assert.deepEqual(
    line.map((cell) => [cell.text, cell.width]),
    [['a', 1], ['中', 2], ['e\u{0301}', 1]],
  );
  assert.equal(cellsWidth(line), 4);
});

test('parseLines always returns at least one line', () => {
  assert.deepEqual(parseLines(''), [[]]);
  assert.equal(parseLines('a\n').length, 2);
});

test('parseLines splits on every line break style', () => {
  const lines = parseLines('a\nb\r\nc\rd');
  assert.deepEqual(lines.map((line) => line.map((cell) => cell.text).join('')), ['a', 'b', 'c', 'd']);
});

test('SGR state is attached to cells and carried across line breaks', () => {
  const lines = parseLines(`${ESC}[1;31mab\ncd${ESC}[0me`);
  assert.deepEqual(lines[0].map((cell) => cell.sgr), ['1;31', '1;31']);
  assert.deepEqual(lines[1].map((cell) => cell.sgr), ['1;31', '1;31', '']);
});

test('hyperlinks are attached to cells', () => {
  const [line] = parseLines(`x${link('go', 'https://example.com')}y`);
  assert.deepEqual(line.map((cell) => cell.link), ['', ';https://example.com', ';https://example.com', '']);
});

test('other escape sequences and stray control characters are dropped', () => {
  const [line] = parseLines(`a${ESC}[2Kb\u{0007}c${ESC}[10;1H`);
  assert.equal(line.map((cell) => cell.text).join(''), 'abc');
});

test('tabs expand to the next tab stop', () => {
  assert.equal(cellsWidth(parseLines('\tx')[0]), 9);
  assert.equal(cellsWidth(parseLines('abc\tx')[0]), 9);
  assert.equal(cellsWidth(parseLines('abcdefgh\tx')[0]), 17);
  assert.equal(cellsWidth(parseLines('a\tb', { tabWidth: 4 })[0]), 5);
  assert.equal(cellsWidth(parseLines('中\tb', { tabWidth: 4 })[0]), 5, 'stops count display columns');
  assert.equal(cellsWidth(parseLines('a\tb', { tabWidth: 0 })[0]), 2, 'zero removes tabs');
});

test('tab stops restart on each line', () => {
  const lines = parseLines('abc\n\tx', { tabWidth: 4 });
  assert.equal(cellsWidth(lines[1]), 5);
});

test('parseLines validates tabWidth', () => {
  assert.throws(() => parseLines('a', { tabWidth: -1 }), OptionError);
  assert.throws(() => parseLines('a', { tabWidth: 2.5 }), OptionError);
});

test('serialize closes styles and links at the end of the line', () => {
  const [line] = parseLines(`${ESC}[31mab`);
  assert.equal(serialize(line), `${ESC}[31mab${ESC}[0m`);
  const [linked] = parseLines(`${ESC}]8;;https://example.com${ESC}\\ab`);
  assert.equal(serialize(linked), `${ESC}]8;;https://example.com${ESC}\\ab${ESC}]8;;${ESC}\\`);
});

test('serialize emits a sequence only where the style changes', () => {
  const [line] = parseLines(`${red('ab')}cd${ESC}[1m${ESC}[32mef`);
  assert.equal(serialize(line), `${ESC}[31mab${ESC}[0mcd${ESC}[1;32mef${ESC}[0m`);
});

test('serialize round-trips plain text', () => {
  assert.equal(serialize(parseLines('héllo 中文')[0]), 'héllo 中文');
  assert.equal(serialize([]), '');
});

test('spaces makes unstyled padding cells', () => {
  assert.equal(serialize(spaces(3)), '   ');
  assert.equal(cellsWidth(spaces(0)), 0);
});

test('stringWidth ignores escape sequences', () => {
  assert.equal(stringWidth(red('hello')), 5);
  assert.equal(stringWidth(link('中文', 'https://example.com')), 4);
  assert.equal(stringWidth(`${ESC}[38;2;1;2;3m${ESC}[0m`), 0);
});

test('stringWidth returns the widest line of multi-line text', () => {
  assert.equal(stringWidth('ab\nabcd\nabc'), 4);
  assert.equal(stringWidth('a\tb'), 9);
  assert.equal(stringWidth('a\tb', { tabWidth: 2 }), 3);
});

test('expandTabs keeps styles and leaves tab-free text alone', () => {
  assert.equal(expandTabs('abc'), 'abc');
  assert.equal(expandTabs('a\tb', 4), 'a   b');
  assert.equal(expandTabs(`${ESC}[31ma\tb${ESC}[0m`, 4), `${ESC}[31ma   b${ESC}[0m`);
});
