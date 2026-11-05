import { test } from 'node:test';
import assert from 'node:assert/strict';
import { styleToSgr, detectColor, createStyler, styleCells, unstyleCells } from '../src/style.js';
import { parseLines, serialize } from '../src/cells.js';
import { OptionError } from '../src/errors.js';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;

test('styleToSgr converts named colours and modifiers', () => {
  assert.equal(styleToSgr({ fg: 'red' }), '31');
  assert.equal(styleToSgr({ bg: 'blue' }), '44');
  assert.equal(styleToSgr({ fg: 'bright-green', bold: true }), '1;92');
  assert.equal(styleToSgr({ fg: 'gray' }), '90');
  assert.equal(styleToSgr({ bg: 'bright-white' }), '107');
  assert.equal(
    styleToSgr({ bold: true, dim: true, italic: true, underline: true, inverse: true, strikethrough: true }),
    '1;2;3;4;7;9',
  );
});

test('styleToSgr converts palette indexes and hex colours', () => {
  assert.equal(styleToSgr({ fg: 208 }), '38;5;208');
  assert.equal(styleToSgr({ bg: 0 }), '48;5;0');
  assert.equal(styleToSgr({ fg: '#ff8800' }), '38;2;255;136;0');
  assert.equal(styleToSgr({ bg: '#0f0' }), '48;2;0;255;0');
});

test('styleToSgr accepts the string shorthand', () => {
  assert.equal(styleToSgr('bold red'), '1;31');
  assert.equal(styleToSgr('underline #ff8800 bg:blue'), '4;38;2;255;136;0;44');
  assert.equal(styleToSgr('  dim  '), '2');
});

test('styleToSgr treats empty and false values as no style', () => {
  assert.equal(styleToSgr(undefined), '');
  assert.equal(styleToSgr(null), '');
  assert.equal(styleToSgr(''), '');
  assert.equal(styleToSgr({}), '');
  assert.equal(styleToSgr({ bold: false, fg: undefined }), '');
});

test('styleToSgr rejects bad input with a helpful message', () => {
  assert.throws(() => styleToSgr({ fg: 'redd' }), /unknown colour "redd" \(did you mean "red"\?\)/);
  assert.throws(() => styleToSgr({ fg: 256 }), /palette index must be an integer from 0 to 255/);
  assert.throws(() => styleToSgr({ fg: '#12' }), /unknown colour "#12"/);
  assert.throws(() => styleToSgr({ blod: true }), /unknown style property \(did you mean "bold"\?\)/);
  assert.throws(() => styleToSgr({ bold: 'yes' }), /expected a boolean/);
  assert.throws(() => styleToSgr(42), OptionError);
  assert.throws(() => styleToSgr({ fg: {} }), /expected a colour name/);
});

test('detectColor follows NO_COLOR, FORCE_COLOR, TERM and the TTY flag', () => {
  assert.equal(detectColor(), false);
  assert.equal(detectColor({ isTTY: true }), true);
  assert.equal(detectColor({ isTTY: true, env: { NO_COLOR: '1' } }), false);
  assert.equal(detectColor({ isTTY: true, env: { NO_COLOR: '' } }), true, 'empty NO_COLOR is ignored');
  assert.equal(detectColor({ isTTY: false, env: { FORCE_COLOR: '1' } }), true);
  assert.equal(detectColor({ isTTY: true, env: { FORCE_COLOR: '0' } }), false);
  assert.equal(detectColor({ env: { FORCE_COLOR: '1', NO_COLOR: '1' } }), false, 'NO_COLOR wins');
  assert.equal(detectColor({ isTTY: true, env: { TERM: 'dumb' } }), false);
  assert.equal(detectColor({ isTTY: true, env: { TERM: 'xterm-256color' } }), true);
});

test('an enabled styler wraps text in escape sequences', () => {
  const styler = createStyler({ color: true });
  assert.equal(styler.enabled, true);
  assert.equal(styler.style('hi', 'bold red'), `${ESC}[1;31mhi${RESET}`);
  assert.equal(styler.style('hi', {}), 'hi');
  assert.equal(styler.link('docs', 'https://example.com'), `${ESC}]8;;https://example.com${ESC}\\docs${ESC}]8;;${ESC}\\`);
});

test('an outer style does not override colours already in the text', () => {
  const styler = createStyler({ color: true });
  const inner = styler.style('b', { fg: 'green' });
  assert.equal(styler.style(`a${inner}c`, { fg: 'red', bold: true }), `${ESC}[1;31ma${ESC}[32mb${ESC}[31mc${RESET}`);
});

test('a styler styles each line of multi-line text on its own', () => {
  const styler = createStyler({ color: true });
  assert.equal(styler.style('a\nb', { fg: 'red' }), `${ESC}[31ma${RESET}\n${ESC}[31mb${RESET}`);
});

test('a disabled styler returns plain text and strips existing styling', () => {
  const styler = createStyler({ env: { NO_COLOR: '1' }, isTTY: true });
  assert.equal(styler.enabled, false);
  assert.equal(styler.style('hi', 'bold red'), 'hi');
  assert.equal(styler.link('docs', 'https://example.com'), 'docs');
  assert.equal(styler.style(`${ESC}[32mgreen${RESET}`, { bold: true }), 'green');
  assert.equal(styler.strip(`${ESC}[32mgreen${RESET}`), 'green');
});

test('strip keeps styling when colour is enabled', () => {
  const styler = createStyler({ color: true });
  assert.equal(styler.strip(`${ESC}[32mgreen${RESET}`), `${ESC}[32mgreen${RESET}`);
});

test('the color option overrides environment detection', () => {
  assert.equal(createStyler({ color: true, env: { NO_COLOR: '1' } }).enabled, true);
  assert.equal(createStyler({ color: false, isTTY: true }).enabled, false);
  assert.equal(createStyler().enabled, false);
});

test('link rejects unusable URLs', () => {
  const styler = createStyler({ color: true });
  assert.throws(() => styler.link('x', ''), OptionError);
  assert.throws(() => styler.link('x', 'https://a\x07b'), OptionError);
});

test('styleCells and unstyleCells work on parsed cells', () => {
  const [cells] = parseLines(`a${ESC}[4mb${RESET}`);
  assert.equal(serialize(styleCells(cells, '31')), `${ESC}[31ma${ESC}[4mb${RESET}`);
  assert.equal(serialize(styleCells(cells, '')), `a${ESC}[4mb${RESET}`);
  assert.equal(serialize(unstyleCells(cells)), 'ab');
});
