import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasAnsi,
  stripAnsi,
  tokenize,
  applySgr,
  mergeSgr,
  sgrTransition,
  linkSequence,
  SGR_RESET,
  LINK_CLOSE,
} from '../src/ansi.js';

const ESC = '\x1b';

test('stripAnsi removes SGR, cursor and OSC sequences', () => {
  assert.equal(stripAnsi(`${ESC}[1;31mred${ESC}[0m`), 'red');
  assert.equal(stripAnsi(`a${ESC}[2Kb${ESC}[10;20Hc`), 'abc');
  assert.equal(stripAnsi(`${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`), 'link');
  assert.equal(stripAnsi(`${ESC}]0;title\x07text`), 'text');
  assert.equal(stripAnsi(`${ESC}(Bplain${ESC}7`), 'plain');
  assert.equal(stripAnsi('no escapes'), 'no escapes');
});

test('hasAnsi detects the escape character', () => {
  assert.equal(hasAnsi('plain'), false);
  assert.equal(hasAnsi(`${ESC}[0m`), true);
});

test('tokenize separates text from escape sequences', () => {
  const tokens = tokenize(`a${ESC}[31mb${ESC}[2Kc`);
  assert.deepEqual(tokens, [
    { type: 'text', value: 'a' },
    { type: 'sgr', value: `${ESC}[31m`, params: '31' },
    { type: 'text', value: 'b' },
    { type: 'escape', value: `${ESC}[2K` },
    { type: 'text', value: 'c' },
  ]);
  assert.deepEqual(tokenize(''), []);
  assert.deepEqual(tokenize('x'), [{ type: 'text', value: 'x' }]);
});

test('tokenize recognises OSC 8 hyperlinks with either terminator', () => {
  const [open, text, close] = tokenize(`${ESC}]8;id=1;https://example.com/a?b=c\x07go${ESC}]8;;${ESC}\\`);
  assert.equal(open.type, 'link');
  assert.equal(open.params, 'id=1');
  assert.equal(open.url, 'https://example.com/a?b=c');
  assert.deepEqual(text, { type: 'text', value: 'go' });
  assert.equal(close.type, 'link');
  assert.equal(close.url, '');
});

test('an unterminated OSC sequence is left as text', () => {
  const tokens = tokenize(`${ESC}]8;;https://example.com`);
  assert.equal(tokens.length, 1);
  assert.equal(tokens[0].type, 'text');
});

test('applySgr tracks attributes and colours in canonical order', () => {
  assert.equal(applySgr('', '31'), '31');
  assert.equal(applySgr('31', '1'), '1;31');
  assert.equal(applySgr('1;31', '44'), '1;31;44');
  assert.equal(applySgr('1;31', '32'), '1;32', 'a new foreground replaces the old one');
  assert.equal(applySgr('1;31', '0'), '');
  assert.equal(applySgr('1;31', ''), '', 'ESC[m is a reset');
  assert.equal(applySgr('1;31', '0;4'), '4');
});

test('applySgr honours the specific reset codes', () => {
  assert.equal(applySgr('1;2;31', '22'), '31', '22 clears bold and dim');
  assert.equal(applySgr('1;31;44', '39'), '1;44');
  assert.equal(applySgr('1;31;44', '49'), '1;31');
  assert.equal(applySgr('3;4;9', '23;24;29'), '');
  assert.equal(applySgr('7', '27'), '');
});

test('applySgr keeps extended colours together', () => {
  assert.equal(applySgr('', '38;5;208'), '38;5;208');
  assert.equal(applySgr('', '38;2;10;20;30;1'), '1;38;2;10;20;30');
  assert.equal(applySgr('38;5;208', '48;2;1;2;3'), '38;5;208;48;2;1;2;3');
  assert.equal(applySgr('38;5;208', '91'), '91');
  assert.equal(applySgr('', '38:2::10:20:30'), '38:2::10:20:30', 'colon form is one parameter');
});

test('applySgr ignores codes it does not track', () => {
  assert.equal(applySgr('1', '11'), '1');
  assert.equal(applySgr('', '73'), '');
});

test('mergeSgr overlays the inner state on the outer one', () => {
  assert.equal(mergeSgr('44', '31'), '31;44');
  assert.equal(mergeSgr('31;44', '32'), '32;44');
  assert.equal(mergeSgr('1', ''), '1');
  assert.equal(mergeSgr('', '4'), '4');
});

test('sgrTransition emits the minimal change', () => {
  assert.equal(sgrTransition('31', '31'), '');
  assert.equal(sgrTransition('31', ''), SGR_RESET);
  assert.equal(sgrTransition('', '1;31'), `${ESC}[1;31m`);
  assert.equal(sgrTransition('31', '1;31'), `${ESC}[1m`, 'only the added attribute');
  assert.equal(sgrTransition('31', '32'), `${ESC}[32m`, 'only the changed colour');
  assert.equal(sgrTransition('1;31', '31'), `${ESC}[0;31m`, 'dropping an attribute needs a reset');
});

test('linkSequence opens and closes hyperlinks', () => {
  assert.equal(linkSequence(''), LINK_CLOSE);
  assert.equal(linkSequence(';https://example.com'), `${ESC}]8;;https://example.com${ESC}\\`);
});
