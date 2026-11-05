import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toNumber,
  compareValues,
  parseSort,
  sortRecords,
  parseFilter,
  matchesFilter,
  filterRecords,
  selectColumns,
} from '../src/transform.js';
import { OptionError, ParseError } from '../src/errors.js';

const fruit = [
  { name: 'kiwi', qty: '12', price: 0.5 },
  { name: 'apple', qty: '3', price: 1.25 },
  { name: 'Banana', qty: '', price: 0.25 },
  { name: 'cherry', qty: '100', price: null },
];
const names = (records) => records.map((record) => record.name);

test('toNumber reads numbers and numeric strings', () => {
  assert.equal(toNumber(5), 5);
  assert.equal(toNumber('1,234.50'), 1234.5);
  assert.equal(toNumber(' 45% '), 45);
  assert.equal(toNumber('-1e3'), -1000);
  assert.equal(toNumber(7n), 7);
  assert.equal(toNumber('abc'), undefined);
  assert.equal(toNumber(''), undefined);
  assert.equal(toNumber(NaN), undefined);
  assert.equal(toNumber(true), undefined);
});

test('compareValues orders numbers, text and empties', () => {
  assert.ok(compareValues('3', '12') < 0, 'numeric strings compare as numbers');
  assert.ok(compareValues(2, 'abc') < 0, 'numbers come before text');
  assert.ok(compareValues('item2', 'item10') < 0, 'natural order inside text');
  assert.ok(compareValues('apple', 'Banana') < 0, 'case does not decide the order');
  assert.ok(compareValues('', 'a') > 0);
  assert.ok(compareValues(null, 0) > 0);
  assert.equal(compareValues(undefined, ''), 0);
  assert.equal(compareValues('1.0', 1), 0);
});

test('parseSort accepts the three direction spellings', () => {
  assert.deepEqual(parseSort('name'), [{ key: 'name', descending: false }]);
  assert.deepEqual(parseSort('-qty, name:asc ,price:DESC'), [
    { key: 'qty', descending: true },
    { key: 'name', descending: false },
    { key: 'price', descending: true },
  ]);
  assert.deepEqual(parseSort(['-a']), [{ key: 'a', descending: true }]);
  assert.throws(() => parseSort('a,,b'), /empty sort key/);
  assert.throws(() => parseSort(5), OptionError);
});

test('sortRecords sorts numerically and keeps empties last', () => {
  assert.deepEqual(names(sortRecords(fruit, 'qty')), ['apple', 'kiwi', 'cherry', 'Banana']);
  assert.deepEqual(names(sortRecords(fruit, '-qty')), ['cherry', 'kiwi', 'apple', 'Banana']);
  assert.deepEqual(names(sortRecords(fruit, 'price:desc')), ['apple', 'kiwi', 'Banana', 'cherry']);
  assert.deepEqual(names(sortRecords(fruit, 'name')), ['apple', 'Banana', 'cherry', 'kiwi']);
  assert.deepEqual(names(fruit), ['kiwi', 'apple', 'Banana', 'cherry'], 'the input is not modified');
});

test('sortRecords is stable and supports several keys', () => {
  const rows = [
    { g: 'b', n: 2, id: 1 },
    { g: 'a', n: 2, id: 2 },
    { g: 'b', n: 1, id: 3 },
    { g: 'a', n: 2, id: 4 },
  ];
  assert.deepEqual(sortRecords(rows, 'g').map((row) => row.id), [2, 4, 1, 3]);
  assert.deepEqual(sortRecords(rows, 'g,-n').map((row) => row.id), [2, 4, 1, 3]);
  assert.deepEqual(sortRecords(rows, ['-g', 'n']).map((row) => row.id), [3, 1, 2, 4]);
});

test('sortRecords checks keys when they are known', () => {
  assert.throws(
    () => sortRecords(fruit, 'nmae', ['name', 'qty', 'price']),
    (error) => error instanceof OptionError && error.option === 'sort' && /unknown column "nmae" \(did you mean "name"\?\); available: name, qty, price/.test(error.message),
  );
  assert.deepEqual(names(sortRecords(fruit, 'nope')), names(fruit));
});

test('parseFilter splits key, operator and value', () => {
  assert.deepEqual(parseFilter('qty>=10'), { key: 'qty', operator: '>=', value: '10' });
  assert.deepEqual(parseFilter('  unit price != 3 '), { key: 'unit price', operator: '!=', value: '3' });
  assert.deepEqual(parseFilter('name ~ " app "'), { key: 'name', operator: '~', value: ' app ' });
  assert.deepEqual(parseFilter('name='), { key: 'name', operator: '=', value: '' });
  assert.deepEqual(parseFilter('a !~ b'), { key: 'a', operator: '!~', value: 'b' });
  assert.throws(
    () => parseFilter('no operator'),
    (error) => error instanceof ParseError && error.format === 'filter' && /Invalid filter "no operator"/.test(error.message),
  );
  assert.throws(() => parseFilter('=5'), ParseError);
  assert.throws(() => parseFilter(undefined), ParseError);
});

test('matchesFilter compares numerically when both sides are numbers', () => {
  const record = { qty: '12', name: 'Kiwi', note: '' };
  const match = (expression) => matchesFilter(record, parseFilter(expression));
  assert.equal(match('qty = 12.0'), true);
  assert.equal(match('qty != 12'), false);
  assert.equal(match('qty > 3'), true, 'not a string comparison');
  assert.equal(match('qty <= 12'), true);
  assert.equal(match('qty < 12'), false);
  assert.equal(match('name = Kiwi'), true);
  assert.equal(match('name = kiwi'), false, 'equality is case-sensitive');
  assert.equal(match('name ~ IW'), true, 'contains is not');
  assert.equal(match('name !~ iw'), false);
  assert.equal(match('name > Apple'), true);
  assert.equal(match('note ='), true);
  assert.equal(match('note != x'), true);
  assert.equal(match('note < 5'), false, 'empty values never match an ordering');
  assert.equal(match('missing ='), true);
  assert.equal(match('missing ~ a'), false);
});

test('filterRecords combines expressions, filters and functions', () => {
  assert.deepEqual(names(filterRecords(fruit, 'qty >= 12')), ['kiwi', 'cherry']);
  assert.deepEqual(names(filterRecords(fruit, ['qty >= 12', 'name ~ ch'])), ['cherry']);
  assert.deepEqual(names(filterRecords(fruit, [(record) => record.price > 0.3, { key: 'qty', operator: '<', value: '10' }])), ['apple']);
  assert.deepEqual(names(filterRecords(fruit, [])), names(fruit));
  assert.throws(() => filterRecords(fruit, 'qty'), ParseError);
  assert.throws(() => filterRecords(fruit, [5]), OptionError);
  assert.throws(() => filterRecords(fruit, 'nam ~ a', ['name', 'qty']), /unknown column "nam" \(did you mean "name"\?\)/);
});

test('selectColumns reorders keys and rejects unknown or repeated ones', () => {
  const set = { keys: ['name', 'qty', 'price'], records: fruit };
  assert.deepEqual(selectColumns(set, 'price, name').keys, ['price', 'name']);
  assert.deepEqual(selectColumns(set, ['qty']).keys, ['qty']);
  assert.equal(selectColumns(set, 'qty').records, fruit);
  assert.throws(
    () => selectColumns(set, 'name,cost'),
    (error) => error instanceof OptionError && error.option === 'columns' && /unknown column "cost"; available: name, qty, price/.test(error.message),
  );
  assert.throws(() => selectColumns(set, 'name,name'), /listed twice/);
  assert.throws(() => selectColumns(set, 'name,'), /empty column name/);
});
