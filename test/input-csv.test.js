import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv } from '../src/input/csv.js';
import { ParseError, OptionError } from '../src/errors.js';

test('parses simple records with any line ending', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r1,2\r'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv(''), []);
});

test('keeps empty fields, including leading and trailing ones', () => {
  assert.deepEqual(parseCsv('a,,c'), [['a', '', 'c']]);
  assert.deepEqual(parseCsv(',b,'), [['', 'b', '']]);
  assert.deepEqual(parseCsv('a,\nb,'), [['a', ''], ['b', '']]);
  assert.deepEqual(parseCsv(','), [['', '']]);
});

test('quoted fields may hold delimiters, quotes and line breaks', () => {
  assert.deepEqual(parseCsv('"a,b",c'), [['a,b', 'c']]);
  assert.deepEqual(parseCsv('"say ""hi""",x'), [['say "hi"', 'x']]);
  assert.deepEqual(parseCsv('"line 1\nline 2",x\ny,z'), [['line 1\nline 2', 'x'], ['y', 'z']]);
  assert.deepEqual(parseCsv('"crlf\r\ninside"'), [['crlf\r\ninside']]);
  assert.deepEqual(parseCsv('a,""\n"",b'), [['a', ''], ['', 'b']]);
});

test('whitespace is part of the field', () => {
  assert.deepEqual(parseCsv(' a , b '), [[' a ', ' b ']]);
});

test('a quote inside an unquoted field is literal', () => {
  assert.deepEqual(parseCsv('5" disk,x'), [['5" disk', 'x']]);
});

test('blank lines are skipped unless asked for', () => {
  assert.deepEqual(parseCsv('a\n\nb\n\n'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('a\n\nb', { skipEmptyLines: false }), [['a'], [''], ['b']]);
  assert.deepEqual(parseCsv('a\n""\nb'), [['a'], [''], ['b']], 'a quoted empty field is a record');
});

test('a byte order mark is ignored', () => {
  assert.deepEqual(parseCsv('\u{feff}a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('\u{feff}"a",b'), [['a', 'b']]);
});

test('custom delimiters', () => {
  assert.deepEqual(parseCsv('a;b\n"1;2";3', { delimiter: ';' }), [['a', 'b'], ['1;2', '3']]);
  assert.deepEqual(parseCsv('a\tb,c', { delimiter: '\t' }), [['a', 'b,c']]);
  assert.throws(() => parseCsv('a', { delimiter: '' }), OptionError);
  assert.throws(() => parseCsv('a', { delimeter: ';' }), /did you mean "delimiter"/);
});

test('an unterminated quote reports where the field opened', () => {
  assert.throws(
    () => parseCsv('a,b\nc,"never closed\nmore'),
    (error) =>
      error instanceof ParseError &&
      error.line === 2 &&
      error.column === 3 &&
      error.format === 'csv' &&
      error.message === 'Unterminated quoted field (line 2, column 3)',
  );
});

test('text after a closing quote is an error with its position', () => {
  assert.throws(
    () => parseCsv('ok\n"a"b,c'),
    (error) => error instanceof ParseError && error.line === 2 && error.column === 4 && /Unexpected "b"/.test(error.message),
  );
  assert.throws(
    () => parseCsv('"multi\nline"x'),
    (error) => error.line === 2 && error.column === 6,
  );
});

test('non-string input is rejected', () => {
  assert.throws(() => parseCsv(undefined), ParseError);
});
