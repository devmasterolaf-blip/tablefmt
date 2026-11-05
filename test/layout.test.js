import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distribute, allocateWidths } from '../src/layout.js';
import { LayoutError } from '../src/errors.js';

/** Shorthand for a flexible column metric. */
const col = (preferred, extra = {}) => ({ preferred, floor: 1, ceiling: Infinity, flex: 1, ...extra });
const sum = (values) => values.reduce((a, b) => a + b, 0);

test('distribute splits proportionally and keeps the total', () => {
  assert.deepEqual(distribute(10, [1, 1]), [5, 5]);
  assert.deepEqual(distribute(10, [3, 1]), [8, 2]);
  assert.deepEqual(distribute(0, [1, 2]), [0, 0]);
  for (const total of [1, 7, 10, 99]) {
    assert.equal(sum(distribute(total, [1, 2, 3, 5])), total);
  }
});

test('distribute hands leftovers to the largest remainders, earliest first', () => {
  assert.deepEqual(distribute(10, [1, 1, 1]), [4, 3, 3]);
  assert.deepEqual(distribute(2, [1, 1, 1]), [1, 1, 0]);
  assert.deepEqual(distribute(5, [1, 3]), [1, 4]);
});

test('distribute gives nothing to zero weights', () => {
  assert.deepEqual(distribute(7, [0, 1, 0]), [0, 7, 0]);
  assert.deepEqual(distribute(7, [0, 0]), [0, 0]);
  assert.deepEqual(distribute(7, []), []);
});

test('columns keep their preferred width when there is no limit or enough room', () => {
  assert.deepEqual(allocateWidths([col(5), col(10)]), [5, 10]);
  assert.deepEqual(allocateWidths([col(5), col(10)], 20), [5, 10]);
  assert.deepEqual(allocateWidths([col(5), col(10)], 15), [5, 10]);
  assert.deepEqual(allocateWidths([], 10), []);
});

test('shrinking takes more from wider columns', () => {
  const widths = allocateWidths([col(10), col(30)], 30);
  assert.equal(sum(widths), 30);
  assert.ok(widths[0] >= 7 && widths[0] <= 8, `narrow column barely shrinks: ${widths}`);
  assert.ok(widths[1] < 30 - 6);
});

test('shrinking respects floors and reassigns what a floored column cannot give', () => {
  const widths = allocateWidths([col(20, { floor: 18, flex: 5 }), col(20)], 25);
  assert.equal(sum(widths), 25);
  assert.equal(widths[0], 18);
  assert.equal(widths[1], 7);
});

test('columns with flex 0 never shrink', () => {
  assert.deepEqual(allocateWidths([col(10, { flex: 0 }), col(20)], 15), [10, 5]);
});

test('a higher flex weight gives up more width', () => {
  const widths = allocateWidths([col(20, { flex: 3 }), col(20, { flex: 1 })], 32);
  assert.equal(sum(widths), 32);
  assert.deepEqual(widths, [14, 18]);
});

test('an impossible fit throws a LayoutError', () => {
  assert.throws(
    () => allocateWidths([col(10, { floor: 8 }), col(10, { floor: 8 })], 12),
    (error) => error instanceof LayoutError && /need at least 16 columns of width but only 12 are available/.test(error.message),
  );
  assert.throws(() => allocateWidths([col(10, { flex: 0 })], 5), LayoutError);
});

test('shrinking can reach exactly the floors', () => {
  assert.deepEqual(allocateWidths([col(10, { floor: 3 }), col(10, { floor: 4 })], 7), [3, 4]);
});

test('spare width is only handed out when expand is set', () => {
  assert.deepEqual(allocateWidths([col(5), col(5)], 20), [5, 5]);
  assert.deepEqual(allocateWidths([col(5), col(5)], 20, { expand: true }), [10, 10]);
});

test('expansion follows flex weights and stops at ceilings', () => {
  assert.deepEqual(allocateWidths([col(5, { flex: 1 }), col(5, { flex: 3 })], 18, { expand: true }), [7, 11]);
  assert.deepEqual(allocateWidths([col(5, { ceiling: 6 }), col(5)], 20, { expand: true }), [6, 14]);
  assert.deepEqual(allocateWidths([col(5, { flex: 0 }), col(5)], 20, { expand: true }), [5, 15]);
});

test('expansion stops when every column is at its ceiling', () => {
  assert.deepEqual(allocateWidths([col(5, { ceiling: 6 }), col(5, { ceiling: 5 })], 20, { expand: true }), [6, 5]);
  assert.deepEqual(allocateWidths([col(5, { flex: 0 })], 20, { expand: true }), [5]);
});
