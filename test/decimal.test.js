import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignDecimal, splitDecimal } from '../src/decimal.js';

test('splitDecimal separates the integer part from the rest', () => {
  assert.deepEqual(splitDecimal('12.50'), ['12', '.50']);
  assert.deepEqual(splitDecimal('-3'), ['-3', '']);
  assert.deepEqual(splitDecimal('.5'), ['', '.5']);
  assert.deepEqual(splitDecimal('1,234.5'), ['1,234', '.5']);
  assert.deepEqual(splitDecimal('1.5e-3'), ['1', '.5e-3']);
  assert.deepEqual(splitDecimal('45%'), ['45', '%']);
});

test('splitDecimal rejects text that is not a number', () => {
  assert.equal(splitDecimal('abc'), undefined);
  assert.equal(splitDecimal(''), undefined);
  assert.equal(splitDecimal('-'), undefined);
  assert.equal(splitDecimal('1.2.3'), undefined);
  assert.equal(splitDecimal('12 apples'), undefined);
});

test('alignDecimal lines up the decimal points', () => {
  assert.deepEqual(alignDecimal(['1.5', '22.25', '333']), ['  1.5 ', ' 22.25', '333   ']);
  assert.deepEqual(alignDecimal(['-1.5', '10']), ['-1.5', '10  ']);
});

test('alignDecimal leaves non-numeric entries alone', () => {
  assert.deepEqual(alignDecimal(['1.5', 'n/a', '10.25']), [' 1.5 ', 'n/a', '10.25']);
  assert.deepEqual(alignDecimal(['a', 'b']), ['a', 'b']);
  assert.deepEqual(alignDecimal([]), []);
});

test('alignDecimal trims numbers and keeps their escape sequences', () => {
  assert.deepEqual(alignDecimal([' 1.5 ', '10']), [' 1.5', '10  ']);
  const red = '\x1b[31m-2.75\x1b[0m';
  assert.deepEqual(alignDecimal([red, '100.5']), [` ${red}`, '100.5 ']);
});
