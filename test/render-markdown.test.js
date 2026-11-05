import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table } from '../src/table.js';
import { renderMarkdown, escapeMarkdownCell } from '../src/render/markdown.js';

test('renders a padded pipe table with an alignment row', () => {
  const table = new Table({
    columns: [
      { key: 'name', title: 'Name' },
      { key: 'qty', title: 'Qty', align: 'right' },
      { key: 'note', title: 'Note', align: 'center' },
    ],
  });
  table.row(['apple', 3, 'ok']).row(['kiwi', 12, 'fresh']);
  assert.deepEqual(renderMarkdown(table).split('\n'), [
    '| Name  | Qty | Note  |',
    '| ----- | --: | :---: |',
    '| apple |   3 |  ok   |',
    '| kiwi  |  12 | fresh |',
  ]);
});

test('pretty: false writes compact rows', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B', align: 'decimal' }] });
  table.row(['long value', 1.5]);
  assert.deepEqual(renderMarkdown(table, { pretty: false }).split('\n'), [
    '| A | B |',
    '| --- | --: |',
    '| long value | 1.5 |',
  ]);
});

test('pipes are escaped and line breaks become <br>', () => {
  assert.equal(escapeMarkdownCell('a|b'), 'a\\|b');
  assert.equal(escapeMarkdownCell('a\\|b'), 'a\\\\\\|b', 'a backslash before a pipe is escaped too');
  assert.equal(escapeMarkdownCell('a\\b'), 'a\\b', 'other backslashes are left alone');
  assert.equal(escapeMarkdownCell('x\ny\r\nz'), 'x<br>y<br>z');
  assert.equal(escapeMarkdownCell('\x1b[31mred\x1b[0m'), 'red');
  const table = new Table().header(['h']).row(['a|b\nc']);
  assert.deepEqual(renderMarkdown(table).split('\n'), ['| h         |', '| --------- |', '| a\\|b<br>c |']);
});

test('a table without a header gets an empty header row', () => {
  const table = new Table().row(['中文', 'b']).row(['c']);
  assert.deepEqual(renderMarkdown(table).split('\n'), [
    '|      |     |',
    '| ---- | --- |',
    '| 中文 | b   |',
    '| c    |     |',
  ]);
});

test('spans are flattened and group titles are bold', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] });
  table.group('Fruit').row([{ content: 'both', colSpan: 2 }]).row([{ content: 'tall', rowSpan: 2 }, 1]).row([2]);
  assert.deepEqual(renderMarkdown(table).split('\n'), [
    '| A         | B   |',
    '| --------- | --- |',
    '| **Fruit** |     |',
    '| both      |     |',
    '| tall      | 1   |',
    '|           | 2   |',
  ]);
});

test('extra header rows and footers become ordinary rows', () => {
  const table = new Table().header(['a']).header(['b']).row(['1']).footer(['sum']);
  assert.deepEqual(renderMarkdown(table).split('\n'), ['| a   |', '| --- |', '| b   |', '| 1   |', '| sum |']);
});

test('nested tables are written as inline HTML', () => {
  const table = new Table().header(['h']).row([new Table().row(['a|b'])]);
  const lines = renderMarkdown(table, { pretty: false }).split('\n');
  assert.equal(lines[2], '| <table><tbody><tr><td>a|b</td></tr></tbody></table> |');
});

test('empty tables and bad options', () => {
  assert.equal(renderMarkdown(new Table()), '');
  assert.throws(() => renderMarkdown(new Table().row(['1']), { prety: true }), /did you mean "pretty"/);
});
