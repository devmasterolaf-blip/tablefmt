import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColumn, normalizeColumns } from '../src/columns.js';
import { OptionError } from '../src/errors.js';

test('a column gets sensible defaults', () => {
  const column = normalizeColumn({}, 0);
  assert.deepEqual(column, {
    key: undefined,
    title: undefined,
    width: undefined,
    minWidth: undefined,
    maxWidth: undefined,
    flex: 1,
    align: 'left',
    headerAlign: 'left',
    valign: 'top',
    format: undefined,
    wrap: 'word',
    truncate: 'end',
    ellipsis: '…',
    sgr: '',
  });
});

test('a string is shorthand for a key, and the title defaults to the key', () => {
  const column = normalizeColumn('name', 0);
  assert.equal(column.key, 'name');
  assert.equal(column.title, 'name');
  assert.equal(normalizeColumn({ key: 'n', title: 'Name' }, 0).title, 'Name');
});

test('header alignment follows the column alignment', () => {
  assert.equal(normalizeColumn({ align: 'right' }, 0).headerAlign, 'right');
  assert.equal(normalizeColumn({ align: 'decimal' }, 0).headerAlign, 'right');
  assert.equal(normalizeColumn({ align: 'right', headerAlign: 'center' }, 0).headerAlign, 'center');
});

test('the column style is compiled to SGR parameters', () => {
  assert.equal(normalizeColumn({ style: 'bold red' }, 0).sgr, '1;31');
});

test('width constraints are validated', () => {
  assert.throws(() => normalizeColumn({ width: 0 }, 2), (error) => error.option === 'columns[2].width');
  assert.throws(() => normalizeColumn({ minWidth: 1.5 }, 0), OptionError);
  assert.throws(() => normalizeColumn({ maxWidth: '10' }, 0), OptionError);
  assert.throws(() => normalizeColumn({ width: 5, maxWidth: 10 }, 0), /cannot be combined/);
  assert.throws(() => normalizeColumn({ minWidth: 9, maxWidth: 4 }, 0), /minWidth \(9\) is greater than maxWidth \(4\)/);
  assert.equal(normalizeColumn({ minWidth: 4, maxWidth: 4 }, 0).minWidth, 4);
});

test('other column options are validated', () => {
  assert.throws(() => normalizeColumn({ flex: -1 }, 0), /non-negative number/);
  assert.throws(() => normalizeColumn({ flex: Infinity }, 0), OptionError);
  assert.throws(() => normalizeColumn({ align: 'justify' }, 0), /expected one of left, right, center, decimal/);
  assert.throws(() => normalizeColumn({ headerAlign: 'decimal' }, 0), OptionError);
  assert.throws(() => normalizeColumn({ valign: 'center' }, 0), /expected one of top, middle, bottom/);
  assert.throws(() => normalizeColumn({ wrap: true }, 0), OptionError);
  assert.throws(() => normalizeColumn({ truncate: 'left' }, 0), OptionError);
  assert.throws(() => normalizeColumn({ format: 'upper' }, 0), /expected a function/);
  assert.throws(() => normalizeColumn({ key: 5 }, 0), /expected a string/);
  assert.throws(() => normalizeColumn({ titel: 'x' }, 1), (error) => error.option === 'columns[1].titel' && /did you mean "title"/.test(error.message));
  assert.throws(() => normalizeColumn(42, 0), OptionError);
});

test('normalizeColumns rejects non-arrays and duplicate keys', () => {
  assert.equal(normalizeColumns(['a', { key: 'b' }, {}]).length, 3);
  assert.throws(() => normalizeColumns('a,b'), /expected an array of column definitions/);
  assert.throws(() => normalizeColumns(['a', 'b', 'a']), (error) => error.option === 'columns[2].key' && /duplicate column key "a"/.test(error.message));
  assert.equal(normalizeColumns([{}, {}]).length, 2, 'columns without keys never collide');
});
