import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNdjson } from '../src/input/ndjson.js';
import {
  objectsToRecordSet,
  arraysToRecordSet,
  valueToRecordSet,
  detectFormat,
  readRecords,
} from '../src/input/records.js';
import { ParseError, OptionError } from '../src/errors.js';

test('parseNdjson reads one value per line and skips blank lines', () => {
  assert.deepEqual(parseNdjson('{"a":1}\n\n{"a":2}\r\n  \n[3]\n'), [{ a: 1 }, { a: 2 }, [3]]);
  assert.deepEqual(parseNdjson(''), []);
  assert.deepEqual(parseNdjson('\u{feff}{"a":1}'), [{ a: 1 }]);
});

test('parseNdjson names the broken line', () => {
  assert.throws(
    () => parseNdjson('{"a":1}\n{"a":}\n{"a":3}'),
    (error) => error instanceof ParseError && error.line === 2 && error.format === 'ndjson' && /^Invalid JSON: /.test(error.message),
  );
  assert.throws(() => parseNdjson(null), ParseError);
});

test('objectsToRecordSet unions keys in first-seen order', () => {
  const set = objectsToRecordSet([{ b: 1, a: 2 }, { c: 3, a: 4 }]);
  assert.deepEqual(set.keys, ['b', 'a', 'c']);
  assert.equal(set.records.length, 2);
  assert.throws(() => objectsToRecordSet([{ a: 1 }, 5]), /record 2 is 5/);
  assert.throws(() => objectsToRecordSet([null]), /record 1 is null/);
});

test('arraysToRecordSet names fields from the header row', () => {
  const set = arraysToRecordSet([['name', 'qty'], ['apple', '3'], ['kiwi']]);
  assert.deepEqual(set.keys, ['name', 'qty']);
  assert.deepEqual(set.records, [{ name: 'apple', qty: '3' }, { name: 'kiwi' }]);
});

test('arraysToRecordSet repairs blank, duplicate and missing names', () => {
  const set = arraysToRecordSet([['id', '', 'id', ' id '], ['1', '2', '3', '4', '5']]);
  assert.deepEqual(set.keys, ['id', 'column2', 'id_2', 'id_3', 'column5']);
  assert.deepEqual(set.records[0], { id: '1', column2: '2', id_2: '3', id_3: '4', column5: '5' });
});

test('arraysToRecordSet without a header row uses positional names', () => {
  const set = arraysToRecordSet([[1, 2], [3]], false);
  assert.deepEqual(set.keys, ['column1', 'column2']);
  assert.deepEqual(set.records, [{ column1: 1, column2: 2 }, { column1: 3 }]);
  assert.deepEqual(arraysToRecordSet([]), { keys: [], records: [] });
  assert.throws(() => arraysToRecordSet([[1], 'x']), /row 2 is "x"/);
});

test('valueToRecordSet accepts the three JSON shapes', () => {
  assert.deepEqual(valueToRecordSet({ a: 1 }).records, [{ a: 1 }]);
  assert.deepEqual(valueToRecordSet([{ a: 1 }, { b: 2 }]).keys, ['a', 'b']);
  assert.deepEqual(valueToRecordSet([[1, 2]]).keys, ['column1', 'column2']);
  assert.deepEqual(valueToRecordSet([['x'], [1]], true), { keys: ['x'], records: [{ x: 1 }] });
  assert.deepEqual(valueToRecordSet([]), { keys: [], records: [] });
  assert.throws(() => valueToRecordSet(5), /got 5/);
  assert.throws(() => valueToRecordSet([{ a: 1 }, [2]]), ParseError);
});

test('detectFormat sniffs JSON, NDJSON and CSV', () => {
  assert.equal(detectFormat('[{"a":1}]'), 'json');
  assert.equal(detectFormat('  {"a":1}\n'), 'json');
  assert.equal(detectFormat('{"a":1}\n{"a":2}\n'), 'ndjson');
  assert.equal(detectFormat('[1,2]\n[3,4]'), 'ndjson');
  assert.equal(detectFormat('a,b\n1,2'), 'csv');
  assert.equal(detectFormat(''), 'csv');
  assert.equal(detectFormat('[{"a":1},'), 'json', 'broken JSON is reported as JSON');
});

test('readRecords parses each format', () => {
  assert.deepEqual(readRecords('a;b\n1;2', 'csv', { delimiter: ';' }), { keys: ['a', 'b'], records: [{ a: '1', b: '2' }] });
  assert.deepEqual(readRecords('1,2', 'csv', { headerRow: false }).records, [{ column1: '1', column2: '2' }]);
  assert.deepEqual(readRecords('[{"a":1}]', 'json').records, [{ a: 1 }]);
  assert.deepEqual(readRecords('{"a":1}\n{"b":2}', 'ndjson').keys, ['a', 'b']);
  assert.throws(
    () => readRecords('[{"a":1},', 'json'),
    (error) => error instanceof ParseError && error.format === 'json',
  );
  assert.throws(() => readRecords('a', 'xml'), OptionError);
});
