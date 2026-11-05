import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isNumeric,
  inferColumns,
  fromRecordSet,
  fromObjects,
  fromArrays,
  fromCsv,
  fromJson,
  fromNdjson,
} from '../src/input/adapters.js';
import { renderText } from '../src/render/text.js';
import { OptionError, ParseError } from '../src/errors.js';

const plain = { color: false, border: 'ascii' };

test('isNumeric recognises numbers and numeric strings', () => {
  for (const value of [0, -1.5, 12n, '12', ' -3.5 ', '1,234.50', '1e6', '45%', '.5']) {
    assert.equal(isNumeric(value), true, String(value));
  }
  for (const value of [NaN, Infinity, '', ' ', 'abc', '12a', '1.2.3', '-', '%', true, null, undefined, {}]) {
    assert.equal(isNumeric(value), false, String(value));
  }
});

test('inferColumns right-aligns all-numeric columns', () => {
  const columns = inferColumns({
    keys: ['name', 'qty', 'mixed', 'empty'],
    records: [
      { name: 'a', qty: '3', mixed: '1', empty: '' },
      { name: 'b', qty: 12.5, mixed: 'x', empty: null },
      { name: 'c', qty: '' },
    ],
  });
  assert.deepEqual(columns, [
    { key: 'name', title: 'name', align: 'left' },
    { key: 'qty', title: 'qty', align: 'right' },
    { key: 'mixed', title: 'mixed', align: 'left' },
    { key: 'empty', title: 'empty', align: 'left' },
  ]);
});

test('fromObjects builds columns from the union of keys', () => {
  const table = fromObjects([{ name: 'apple', qty: 3 }, { name: 'kiwi', qty: 12, note: 'ripe' }]);
  assert.deepEqual(renderText(table, plain).split('\n'), [
    '+-------+-----+------+',
    '| name  | qty | note |',
    '+-------+-----+------+',
    '| apple |   3 |      |',
    '| kiwi  |  12 | ripe |',
    '+-------+-----+------+',
  ]);
});

test('columns selects, orders and customises', () => {
  const table = fromObjects(
    [{ name: 'apple', qty: 3, secret: 'x' }],
    { columns: ['qty', { key: 'name', title: 'Fruit', align: 'center', minWidth: 9 }, 'missing'], nullText: '?' },
  );
  assert.deepEqual(renderText(table, plain).split('\n'), [
    '+-----+-----------+---------+',
    '| qty |   Fruit   | missing |',
    '+-----+-----------+---------+',
    '|   3 |   apple   | ?       |',
    '+-----+-----------+---------+',
  ]);
  assert.throws(() => fromObjects([], { columns: 'name' }), OptionError);
  assert.throws(() => fromObjects([], { columns: [{ title: 'no key' }] }), /columns\[0\]/);
  assert.throws(() => fromObjects([], { columns: [5] }), OptionError);
});

test('object values with a content property are data, not cell options', () => {
  const table = fromObjects([{ a: { content: 'x', other: 1 } }]);
  assert.ok(renderText(table, plain).includes('| {"content":"x","other":1} |'));
});

test('fromObjects validates its input', () => {
  assert.throws(() => fromObjects({ a: 1 }), /expected an array/);
  assert.throws(() => fromObjects([1]), ParseError);
  assert.throws(() => fromObjects([], { bordr: 'ascii' }), /did you mean "border"/);
  assert.equal(renderText(fromObjects([]), plain), '');
});

test('fromArrays uses the first row as titles by default', () => {
  const table = fromArrays([['Name', 'Qty'], ['apple', 3]]);
  assert.deepEqual(renderText(table, plain).split('\n'), [
    '+-------+-----+',
    '| Name  | Qty |',
    '+-------+-----+',
    '| apple |   3 |',
    '+-------+-----+',
  ]);
});

test('fromArrays without a header row shows no header', () => {
  const table = fromArrays([['apple', 3], ['kiwi', 12]], { headerRow: false });
  assert.deepEqual(renderText(table, plain).split('\n'), [
    '+-------+----+',
    '| apple |  3 |',
    '| kiwi  | 12 |',
    '+-------+----+',
  ]);
  const named = fromArrays([['apple', 3]], { headerRow: false, columns: [{ key: 'column1', title: 'Fruit' }] });
  assert.ok(renderText(named, plain).includes('| Fruit |'));
  assert.throws(() => fromArrays('x'), OptionError);
});

test('fromCsv infers numeric columns from strings', () => {
  const table = fromCsv('item,price\n"tea, green",1.50\ncake,22.25\n');
  assert.deepEqual(renderText(table, plain).split('\n'), [
    '+------------+-------+',
    '| item       | price |',
    '+------------+-------+',
    '| tea, green |  1.50 |',
    '| cake       | 22.25 |',
    '+------------+-------+',
  ]);
});

test('fromCsv passes on delimiter and headerRow', () => {
  const table = fromCsv('1;2\n3;4', { delimiter: ';', headerRow: false, border: 'none' });
  assert.equal(renderText(table, { color: false }), 'column1  column2\n      1        2\n      3        4');
  assert.throws(() => fromCsv('a\n"x'), ParseError);
});

test('fromJson and fromNdjson accept objects and arrays', () => {
  const expected = ['+---+----+', '| a | b  |', '+---+----+', '| 1 | x  |', '| 2 | yy |', '+---+----+'];
  assert.deepEqual(renderText(fromJson('[{"a":1,"b":"x"},{"a":2,"b":"yy"}]'), plain).split('\n'), expected);
  assert.deepEqual(renderText(fromNdjson('{"a":1,"b":"x"}\n{"a":2,"b":"yy"}\n'), plain).split('\n'), expected);
  assert.deepEqual(
    renderText(fromJson('[["a","b"],[1,"x"],[2,"yy"]]', { headerRow: true }), plain).split('\n'),
    expected,
  );
  assert.throws(() => fromJson('nope'), ParseError);
  assert.throws(() => fromJson('[]', { delimiter: ';' }), /only CSV input has a delimiter/);
});

test('fromRecordSet keeps table options', () => {
  const table = fromRecordSet({ keys: ['a'], records: [{ a: 1 }] }, { border: 'markdown' });
  assert.equal(renderText(table, { color: false }), '| a |\n|---|\n| 1 |');
});
