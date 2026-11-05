import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TablefmtError,
  OptionError,
  ParseError,
  LayoutError,
  UsageError,
} from '../src/errors.js';
import { checkInteger, checkEnum, checkOptions, suggest, describe } from '../src/validate.js';

test('every error extends TablefmtError and carries a code', () => {
  const errors = [
    [new OptionError('width', 'bad'), 'ERR_OPTION', 'OptionError'],
    [new ParseError('bad input'), 'ERR_PARSE', 'ParseError'],
    [new LayoutError('too narrow'), 'ERR_LAYOUT', 'LayoutError'],
    [new UsageError('missing file'), 'ERR_USAGE', 'UsageError'],
  ];
  for (const [error, code, name] of errors) {
    assert.ok(error instanceof TablefmtError);
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.name, name);
  }
});

test('OptionError names the option in the message', () => {
  const error = new OptionError('columns[1].width', 'expected an integer');
  assert.equal(error.option, 'columns[1].width');
  assert.equal(error.message, 'Invalid option "columns[1].width": expected an integer');
});

test('ParseError appends the position when it is known', () => {
  assert.equal(new ParseError('boom').message, 'boom');
  assert.equal(new ParseError('boom', { line: 3 }).message, 'boom (line 3)');
  const error = new ParseError('boom', { line: 3, column: 7, format: 'csv' });
  assert.equal(error.message, 'boom (line 3, column 7)');
  assert.equal(error.line, 3);
  assert.equal(error.column, 7);
  assert.equal(error.format, 'csv');
});

test('checkInteger accepts integers in range and rejects the rest', () => {
  assert.equal(checkInteger('n', 5, { min: 1 }), 5);
  assert.throws(() => checkInteger('n', 1.5), OptionError);
  assert.throws(() => checkInteger('n', '5'), /expected an integer, got "5"/);
  assert.throws(() => checkInteger('n', 0, { min: 1 }), /expected an integer >= 1, got 0/);
  assert.throws(() => checkInteger('n', 9, { min: 1, max: 8 }), /between 1 and 8/);
  assert.throws(() => checkInteger('n', NaN), OptionError);
});

test('checkEnum suggests a close match', () => {
  assert.equal(checkEnum('align', 'left', ['left', 'right']), 'left');
  assert.throws(
    () => checkEnum('align', 'rigth', ['left', 'right']),
    /expected one of left, right, got "rigth" \(did you mean "right"\?\)/,
  );
  assert.throws(() => checkEnum('align', 3, ['left', 'right']), /got 3$/);
});

test('checkOptions rejects non-objects and unknown keys', () => {
  assert.deepEqual(checkOptions('options', undefined, ['a']), {});
  assert.throws(() => checkOptions('options', [], ['a']), /expected an options object, got an array/);
  assert.throws(() => checkOptions('options', null, ['a']), /got null/);
  assert.throws(
    () => checkOptions('options', { maxWidht: 3 }, ['maxWidth', 'border']),
    (error) => error instanceof OptionError && error.option === 'maxWidht' && /did you mean "maxWidth"/.test(error.message),
  );
  assert.throws(
    () => checkOptions('columns[0]', { zzz: 1 }, ['key']),
    (error) => error.option === 'columns[0].zzz' && !/did you mean/.test(error.message),
  );
});

test('suggest only offers plausible typos', () => {
  assert.equal(suggest('rouded', ['ascii', 'rounded', 'heavy']), 'rounded');
  assert.equal(suggest('xyz', ['ascii', 'rounded']), undefined);
});

test('describe renders values for messages', () => {
  assert.equal(describe(null), 'null');
  assert.equal(describe([1]), 'an array');
  assert.equal(describe({}), 'an object');
  assert.equal(describe('a'), '"a"');
  assert.equal(describe(undefined), 'undefined');
  assert.equal(describe(true), 'true');
});
