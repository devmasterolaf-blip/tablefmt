import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table } from '../src/table.js';
import { renderHtml, escapeHtml } from '../src/render/html.js';
import { OptionError } from '../src/errors.js';

test('escapeHtml escapes the five special characters', () => {
  assert.equal(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`), '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;');
  assert.equal(escapeHtml('plain'), 'plain');
});

test('renders header, body and footer sections', () => {
  const table = new Table({
    columns: [
      { key: 'name', title: 'Name' },
      { key: 'qty', title: 'Qty', align: 'right' },
    ],
  });
  table.row(['apple', 3]).footer(['Total', 3]);
  assert.deepEqual(renderHtml(table).split('\n'), [
    '<table>',
    '  <thead>',
    '    <tr><th>Name</th><th style="text-align: right">Qty</th></tr>',
    '  </thead>',
    '  <tbody>',
    '    <tr><td>apple</td><td style="text-align: right">3</td></tr>',
    '  </tbody>',
    '  <tfoot>',
    '    <tr><td>Total</td><td style="text-align: right">3</td></tr>',
    '  </tfoot>',
    '</table>',
  ]);
});

test('cell text is escaped and line breaks become <br>', () => {
  const table = new Table().row(['<script>alert("x")</script>', 'a & b\nc\r\nd']);
  const html = renderHtml(table);
  assert.ok(html.includes('<td>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</td>'));
  assert.ok(html.includes('<td>a &amp; b<br>c<br>d</td>'));
  assert.ok(!html.includes('<script>'));
});

test('ANSI escape sequences are removed', () => {
  const html = renderHtml(new Table().row(['\x1b[1;31mhot\x1b[0m', '\x1b]8;;http://x.y\x1b\\link\x1b]8;;\x1b\\']));
  assert.ok(html.includes('<tr><td>hot</td><td>link</td></tr>'));
});

test('spans become colspan and rowspan attributes', () => {
  const table = new Table()
    .row([{ content: 'big', rowSpan: 2, colSpan: 2 }, 'r'])
    .row(['s'])
    .row(['a', 'b', 'c']);
  const rows = renderHtml(table, { indent: '' }).split('\n').filter((line) => line.startsWith('<tr>'));
  assert.deepEqual(rows, [
    '<tr><td colspan="2" rowspan="2">big</td><td>r</td></tr>',
    '<tr><td>s</td></tr>',
    '<tr><td>a</td><td>b</td><td>c</td></tr>',
  ]);
});

test('each group gets its own tbody and titles span the table', () => {
  const table = new Table({ columns: [{ key: 'k' }, { key: 'v', align: 'center' }], header: false });
  table.group('First <1>').row(['a', 1]).group().row(['b', 2]);
  assert.deepEqual(renderHtml(table, { indent: '' }).split('\n'), [
    '<table>',
    '<tbody>',
    '<tr><th colspan="2">First &lt;1&gt;</th></tr>',
    '<tr><td>a</td><td style="text-align: center">1</td></tr>',
    '</tbody>',
    '<tbody>',
    '<tr><td>b</td><td style="text-align: center">2</td></tr>',
    '</tbody>',
    '</table>',
  ]);
});

test('short rows are completed with empty cells', () => {
  const html = renderHtml(new Table().row(['a', 'b']).row(['c']), { indent: '' });
  assert.ok(html.includes('<tr><td>c</td><td></td></tr>'));
});

test('caption and class are escaped', () => {
  const html = renderHtml(new Table().row(['1']), { caption: 'Stock "A" & B', className: 'tbl "x"' });
  assert.ok(html.startsWith('<table class="tbl &quot;x&quot;">\n  <caption>Stock &quot;A&quot; &amp; B</caption>\n'));
});

test('nested tables become nested table elements on one line', () => {
  const table = new Table().row(['x', new Table().header(['h']).row(['<n>'])]);
  const html = renderHtml(table);
  assert.ok(
    html.includes(
      '<td><table><thead><tr><th>h</th></tr></thead><tbody><tr><td>&lt;n&gt;</td></tr></tbody></table></td>',
    ),
  );
});

test('formatters, nullText and cell alignment overrides apply', () => {
  const table = new Table({ columns: [{ key: 'n', format: (value) => `<${value}>` }, { key: 'm' }], header: false });
  table.row([1, null]).row([{ content: 2, align: 'right' }, undefined]);
  const html = renderHtml(table, { indent: '', nullText: 'n/a' });
  assert.ok(html.includes('<tr><td>&lt;1&gt;</td><td>n/a</td></tr>'));
  assert.ok(html.includes('<tr><td style="text-align: right">&lt;2&gt;</td><td>n/a</td></tr>'));
});

test('an empty table is an empty table element', () => {
  assert.equal(renderHtml(new Table()), '<table>\n</table>');
});

test('options are validated', () => {
  const table = new Table().row(['1']);
  assert.throws(() => renderHtml(table, { caption: 3 }), OptionError);
  assert.throws(() => renderHtml(table, { indent: 2 }), OptionError);
  assert.throws(() => renderHtml(table, { clasName: 'x' }), /did you mean "className"/);
  assert.throws(() => renderHtml('nope'), /expected a Table/);
});
