import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table } from '../src/table.js';
import { renderCsv, quoteCsvField, checkDelimiter } from '../src/render/csv.js';
import { OptionError } from '../src/errors.js';

test('quoteCsvField quotes only when needed', () => {
  assert.equal(quoteCsvField('plain'), 'plain');
  assert.equal(quoteCsvField(''), '');
  assert.equal(quoteCsvField('a,b'), '"a,b"');
  assert.equal(quoteCsvField('say "hi"'), '"say ""hi"""');
  assert.equal(quoteCsvField('two\nlines'), '"two\nlines"');
  assert.equal(quoteCsvField('cr\rhere'), '"cr\rhere"');
  assert.equal(quoteCsvField(' padded '), ' padded ', 'spaces are part of the field');
  assert.equal(quoteCsvField('a;b', ';'), '"a;b"');
  assert.equal(quoteCsvField('a,b', ';'), 'a,b');
  assert.equal(quoteCsvField('x', ',', true), '"x"');
});

test('writes header, body and footer records separated by CRLF', () => {
  const table = new Table({
    columns: [
      { key: 'name', title: 'Name' },
      { key: 'qty', title: 'Qty' },
    ],
  });
  table.row(['apple, red', 3]).row(['kiwi', null]).footer(['Total', 3]);
  assert.equal(renderCsv(table), 'Name,Qty\r\n"apple, red",3\r\nkiwi,\r\nTotal,3');
});

test('header: false leaves the titles out', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }] }).row(['1']);
  assert.equal(renderCsv(table, { header: false }), '1');
});

test('delimiter, newline and quote options', () => {
  const table = new Table().header(['a', 'b']).row(['1;2', 'x']);
  assert.equal(renderCsv(table, { delimiter: ';', newline: '\n' }), 'a;b\n"1;2";x');
  assert.equal(renderCsv(table, { delimiter: '\t', newline: '\n' }), 'a\tb\n1;2\tx');
  assert.equal(renderCsv(table, { quote: 'all', newline: '\n' }), '"a","b"\n"1;2","x"');
});

test('formatters and nullText apply; ANSI is stripped', () => {
  const table = new Table({ columns: [{ key: 'n', format: (value) => value.toFixed(1) }, { key: 't' }], header: false });
  table.row([1, '\x1b[32mgreen\x1b[0m']).row([2.25, undefined]);
  assert.equal(renderCsv(table, { newline: '\n', nullText: 'NULL' }), '1.0,green\n2.3,NULL');
});

test('group titles are skipped and spans are flattened', () => {
  const table = new Table();
  table.group('Fruit').row([{ content: 'both', colSpan: 2 }]).row([{ content: 'tall', rowSpan: 2 }, 1]).row([2]);
  assert.equal(renderCsv(table, { newline: '\n' }), 'both,\ntall,1\n,2');
});

test('multi-line cells stay inside one quoted field', () => {
  const table = new Table().row(['line 1\nline 2', 'b']);
  assert.equal(renderCsv(table), '"line 1\nline 2",b');
});

test('a nested table is written as CSV inside one field', () => {
  const table = new Table().row(['x', new Table().row(['a', 'b "c"']).row(['d', 'e'])]);
  assert.equal(renderCsv(table, { newline: '\n' }), 'x,"a,""b """"c""""""\nd,e"');
});

test('options are validated', () => {
  const table = new Table().row(['1']);
  assert.throws(() => renderCsv(table, { delimiter: ';;' }), OptionError);
  assert.throws(() => renderCsv(table, { delimiter: '"' }), /cannot be the delimiter/);
  assert.throws(() => renderCsv(table, { newline: '\r' }), OptionError);
  assert.throws(() => renderCsv(table, { quote: 'always' }), /expected one of minimal, all/);
  assert.equal(checkDelimiter('|'), '|');
  assert.equal(renderCsv(new Table()), '');
});
