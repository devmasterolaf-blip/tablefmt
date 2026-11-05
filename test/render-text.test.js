import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table } from '../src/table.js';
import { renderText, renderLines, tableOverhead, columnMetric, simpleRule } from '../src/render/text.js';
import { formatValue } from '../src/render/prepare.js';
import { resolveBorder } from '../src/borders.js';
import { normalizeColumn } from '../src/columns.js';
import { stringWidth } from '../src/cells.js';
import { LayoutError, OptionError } from '../src/errors.js';

const plain = { color: false };

/**
 * Compare rendered output with the expected lines.
 * @param {string} actual
 * @param {string[]} expected
 */
function sameLines(actual, expected) {
  assert.deepEqual(actual.split('\n'), expected);
}

test('renders column titles as the header', () => {
  const table = new Table({
    columns: [
      { key: 'name', title: 'Name' },
      { key: 'qty', title: 'Qty', align: 'right' },
    ],
  });
  table.row({ name: 'apple', qty: 3 }).row({ name: 'kiwi', qty: 12 });
  sameLines(renderText(table, plain), [
    '┌───────┬─────┐',
    '│ Name  │ Qty │',
    '├───────┼─────┤',
    '│ apple │   3 │',
    '│ kiwi  │  12 │',
    '└───────┴─────┘',
  ]);
});

test('header: false hides the automatic header', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }], header: false }).row(['1']);
  sameLines(renderText(table, plain), ['┌───┐', '│ 1 │', '└───┘']);
});

test('an empty table renders as an empty string', () => {
  assert.equal(renderText(new Table(), plain), '');
  assert.deepEqual(renderLines(new Table(), plain), []);
});

test('ascii, markdown and borderless styles', () => {
  const table = new Table().header(['a', 'b']).row(['1', '22']);
  sameLines(renderText(table, { ...plain, border: 'ascii' }), [
    '+---+----+',
    '| a | b  |',
    '+---+----+',
    '| 1 | 22 |',
    '+---+----+',
  ]);
  sameLines(renderText(table, { ...plain, border: 'markdown' }), ['| a | b  |', '|---|----|', '| 1 | 22 |']);
  sameLines(renderText(table, { ...plain, border: 'none' }), ['a  b', '1  22']);
});

test('borderless output has no trailing spaces', () => {
  const table = new Table().header(['a', 'b']).row(['1\n2', '']);
  assert.equal(renderText(table, { ...plain, border: 'none' }), 'a  b\n1\n2');
});

test('padding can be removed', () => {
  const table = new Table().header(['a', 'b']).row(['1', '2']);
  sameLines(renderText(table, { ...plain, padding: 0 }), ['┌─┬─┐', '│a│b│', '├─┼─┤', '│1│2│', '└─┴─┘']);
});

test('column spans merge cells and fix the junctions around them', () => {
  const table = new Table()
    .header(['a', 'b', 'c'])
    .row([{ content: 'x', rowSpan: 2 }, '1', '2'])
    .row(['3', '4'])
    .row(['y', { content: 'wide', colSpan: 2 }]);
  sameLines(renderText(table, { ...plain, rowSeparators: true }), [
    '┌───┬───┬───┐',
    '│ a │ b │ c │',
    '├───┼───┼───┤',
    '│ x │ 1 │ 2 │',
    '│   ├───┼───┤',
    '│   │ 3 │ 4 │',
    '├───┼───┴───┤',
    '│ y │ wide  │',
    '└───┴───────┘',
  ]);
});

test('a cell spanning rows and columns leaves no rule inside it', () => {
  const table = new Table()
    .row([{ content: 'big', rowSpan: 2, colSpan: 2 }, 'r'])
    .row(['s'])
    .row(['a', 'b', 'c']);
  sameLines(renderText(table, { ...plain, rowSeparators: true, border: 'ascii' }), [
    '+-------+---+',
    '| big   | r |',
    '|       +---+',
    '|       | s |',
    '+---+---+---+',
    '| a | b | c |',
    '+---+---+---+',
  ]);
});

test('a tall row-spanning cell stretches the last row it covers', () => {
  const table = new Table().row([{ content: '1\n2\n3\n4', rowSpan: 2 }, 'a']).row(['b']);
  sameLines(renderText(table, { ...plain, rowSeparators: true }), [
    '┌───┬───┐',
    '│ 1 │ a │',
    '│ 2 ├───┤',
    '│ 3 │ b │',
    '│ 4 │   │',
    '└───┴───┘',
  ]);
});

test('a wide spanning cell widens the columns under it', () => {
  const table = new Table().row([{ content: 'a long spanning title', colSpan: 2 }]).row(['a', 'b']);
  sameLines(renderText(table, plain), [
    '┌───────────────────────┐',
    '│ a long spanning title │',
    '│ a         │ b         │',
    '└───────────┴───────────┘',
  ]);
});

test('multi-line cells honour vertical alignment', () => {
  const table = new Table({
    columns: [{ key: 'a' }, { key: 'b', valign: 'middle' }, { key: 'c', valign: 'bottom' }],
  }).row(['one\ntwo\nthree', 'mid', 'bot']);
  sameLines(renderText(table, plain), [
    '┌───────┬─────┬─────┐',
    '│ a     │ b   │ c   │',
    '├───────┼─────┼─────┤',
    '│ one   │     │     │',
    '│ two   │ mid │     │',
    '│ three │     │ bot │',
    '└───────┴─────┴─────┘',
  ]);
});

test('maxWidth wraps the flexible columns', () => {
  const table = new Table({
    columns: [
      { key: 'id', title: 'ID', minWidth: 2 },
      { key: 'text', title: 'Text' },
    ],
  }).row([1, 'the quick brown fox jumps over the lazy dog']);
  const out = renderText(table, { ...plain, maxWidth: 24 });
  sameLines(out, [
    '┌────┬─────────────────┐',
    '│ ID │ Text            │',
    '├────┼─────────────────┤',
    '│ 1  │ the quick brown │',
    '│    │ fox jumps over  │',
    '│    │ the lazy dog    │',
    '└────┴─────────────────┘',
  ]);
  assert.equal(stringWidth(out), 24);
});

test('a table that cannot fit reports the width it needs', () => {
  const table = new Table().row(['abc', 'def', 'ghi']);
  assert.throws(
    () => renderText(table, { ...plain, maxWidth: 9 }),
    (error) => error instanceof LayoutError && /needs at least 13 columns of width but maxWidth is 9/.test(error.message),
  );
});

test('expand fills maxWidth according to flex weights', () => {
  const table = new Table({
    columns: [
      { key: 'a', flex: 1 },
      { key: 'b', flex: 3 },
    ],
  }).row(['x', 'y']);
  sameLines(renderText(table, { ...plain, maxWidth: 21, expand: true }), [
    '┌──────┬────────────┐',
    '│ a    │ b          │',
    '├──────┼────────────┤',
    '│ x    │ y          │',
    '└──────┴────────────┘',
  ]);
  assert.throws(() => renderText(table, { ...plain, expand: true }), OptionError);
});

test('fixed and minimum widths are respected', () => {
  const table = new Table({
    columns: [
      { key: 'a', width: 6, align: 'center' },
      { key: 'b', minWidth: 5 },
    ],
  }).row(['ab', 'c']);
  sameLines(renderText(table, plain), [
    '┌────────┬───────┐',
    '│   a    │ b     │',
    '├────────┼───────┤',
    '│   ab   │ c     │',
    '└────────┴───────┘',
  ]);
});

test('wrap: none truncates, wrap: hard breaks inside words', () => {
  const table = new Table({
    columns: [
      { key: 'a', wrap: 'none', maxWidth: 8 },
      { key: 'b', wrap: 'none', maxWidth: 8, truncate: 'middle' },
      { key: 'c', wrap: 'hard', maxWidth: 4 },
    ],
  }).row(['abcdefghijkl', 'abcdefghijkl', 'abcdefghij']);
  sameLines(renderText(table, plain), [
    '┌──────────┬──────────┬──────┐',
    '│ a        │ b        │ c    │',
    '├──────────┼──────────┼──────┤',
    '│ abcdefg… │ abcd…jkl │ abcd │',
    '│          │          │ efgh │',
    '│          │          │ ij   │',
    '└──────────┴──────────┴──────┘',
  ]);
});

test('decimal columns line numbers up on the point', () => {
  const table = new Table({
    columns: [
      { key: 'item', title: 'Item' },
      { key: 'price', title: 'Price', align: 'decimal' },
    ],
  });
  table.row(['tea', 1.5]).row(['cake', 22.25]).row(['mug', 100]).row(['gift', 'n/a']).footer(['Total', 123.75]);
  sameLines(renderText(table, plain), [
    '┌───────┬────────┐',
    '│ Item  │  Price │',
    '├───────┼────────┤',
    '│ tea   │   1.5  │',
    '│ cake  │  22.25 │',
    '│ mug   │ 100    │',
    '│ gift  │    n/a │',
    '├───────┼────────┤',
    '│ Total │ 123.75 │',
    '└───────┴────────┘',
  ]);
});

test('formatters apply to body cells only; nullText fills gaps', () => {
  const table = new Table({
    columns: [
      { key: 'n', title: 'N', format: (value) => `$${value.toFixed(2)}`, align: 'right' },
      { key: 'd', title: 'D' },
    ],
    nullText: '-',
  });
  table.row([1.5, null]).row([20, { a: 1 }]).footer([21.5, true]);
  sameLines(renderText(table, plain), [
    '┌────────┬─────────┐',
    '│      N │ D       │',
    '├────────┼─────────┤',
    '│  $1.50 │ -       │',
    '│ $20.00 │ {"a":1} │',
    '├────────┼─────────┤',
    '│   21.5 │ true    │',
    '└────────┴─────────┘',
  ]);
});

test('formatters receive the row index and the column', () => {
  const seen = [];
  const table = new Table({
    columns: [{ key: 'a', format: (value, context) => (seen.push([context.row, context.column.key]), String(value)) }],
  });
  table.row(['x']).row(['y']);
  renderText(table, plain);
  assert.deepEqual(seen, [[0, 'a'], [1, 'a']]);
});

test('formatValue covers the common value types', () => {
  assert.equal(formatValue(null, '-'), '-');
  assert.equal(formatValue(undefined), '');
  assert.equal(formatValue(12n), '12');
  assert.equal(formatValue(false), 'false');
  assert.equal(formatValue(new Date(Date.UTC(2020, 0, 2))), '2020-01-02T00:00:00.000Z');
  assert.equal(formatValue(new Date(NaN)), 'Invalid Date');
  assert.equal(formatValue([1, 'a']), '[1,"a"]');
  const circular = {};
  circular.self = circular;
  assert.equal(formatValue(circular), '[object Object]');
});

test('wide characters, combining marks and tabs keep the borders aligned', () => {
  const table = new Table().row(['日本語', 'e\u{301}t\u{e9}']).row(['👍🏽 ok', 'a\tb']);
  const lines = renderText(table, plain).split('\n');
  assert.deepEqual(lines, [
    '┌────────┬───────────┐',
    '│ 日本語 │ e\u{301}t\u{e9}       │',
    '│ 👍🏽 ok  │ a       b │',
    '└────────┴───────────┘',
  ]);
  assert.deepEqual(lines.map((line) => stringWidth(line)), [22, 22, 22, 22]);
});

test('groups are separated by rules and may carry a title', () => {
  const table = new Table({
    columns: [
      { key: 'k', title: 'K' },
      { key: 'v', title: 'V' },
    ],
  });
  table.group('First').row(['a', 1]).row(['b', 2]).group().row(['c', 3]).group('Third').row(['d', 4]);
  sameLines(renderText(table, plain), [
    '┌───┬───┐',
    '│ K │ V │',
    '├───┴───┤',
    '│ First │',
    '│ a │ 1 │',
    '│ b │ 2 │',
    '├───┼───┤',
    '│ c │ 3 │',
    '├───┴───┤',
    '│ Third │',
    '│ d │ 4 │',
    '└───┴───┘',
  ]);
});

test('nested tables render inside a cell and shrink with it', () => {
  const inner = new Table().row(['some longer words here', 'x']);
  const table = new Table({ columns: [{ key: 'label', minWidth: 5 }, { key: 'detail' }], header: false });
  table.row(['outer', inner]);
  sameLines(renderText(table, { ...plain, maxWidth: 30 }), [
    '┌───────┬────────────────────┐',
    '│ outer │ ┌────────────┬───┐ │',
    '│       │ │ some       │ x │ │',
    '│       │ │ longer     │   │ │',
    '│       │ │ words here │   │ │',
    '│       │ └────────────┴───┘ │',
    '└───────┴────────────────────┘',
  ]);
});

test('ANSI styling in cell content is kept with colour and stripped without', () => {
  const table = new Table().row(['\x1b[31mred\x1b[0m', 'x']);
  assert.equal(
    renderText(table, { color: true, border: 'ascii' }),
    '+-----+---+\n| \x1b[31mred\x1b[0m | x |\n+-----+---+',
  );
  assert.equal(renderText(table, { color: false, border: 'ascii' }), '+-----+---+\n| red | x |\n+-----+---+');
});

test('hyperlinks are reopened on every wrapped line', () => {
  const table = new Table().row(['\x1b]8;;http://x.y\x1b\\link text\x1b]8;;\x1b\\']);
  const open = '\x1b]8;;http://x.y\x1b\\';
  const close = '\x1b]8;;\x1b\\';
  sameLines(renderText(table, { color: true, maxWidth: 8, border: 'ascii' }), [
    '+------+',
    `| ${open}link${close} |`,
    `| ${open}text${close} |`,
    '+------+',
  ]);
});

test('header style and zebra striping apply when colour is on', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }] }).rows([['1'], ['2'], ['3']]);
  assert.equal(
    renderText(table, { color: true, border: 'none', zebra: true }),
    '\x1b[1mA\x1b[0m\n1\n\x1b[2m2\x1b[0m\n3',
  );
  assert.equal(renderText(table, { color: false, border: 'none', zebra: true }), 'A\n1\n2\n3');
  assert.equal(
    renderText(table, { color: true, border: 'none', zebra: 'bg:blue', headerStyle: 'underline' }),
    '\x1b[4mA\x1b[0m\n1\n\x1b[44m2\x1b[0m\n3',
  );
});

test('zebra striping restarts in every group', () => {
  const table = new Table().group('g1').rows([['1'], ['2']]).group('g2').rows([['3'], ['4']]);
  const lines = renderText(table, { color: true, border: 'none', zebra: 'red' }).split('\n');
  // The style covers the whole cell, so a background stripe has no gaps.
  assert.deepEqual(lines, ['g1', '1', '\x1b[31m2 \x1b[0m', 'g2', '3', '\x1b[31m4 \x1b[0m']);
});

test('cell style beats row style beats column style', () => {
  const table = new Table({ columns: [{ key: 'a', style: 'red' }, { key: 'b' }], header: false });
  table.row(['1', { content: '2', style: 'bold' }], { style: 'underline' });
  table.row([{ content: '3', style: 'green' }, '4']);
  sameLines(renderText(table, { color: true, border: 'ascii' }), [
    '+---+---+',
    '|\x1b[4;31m 1 \x1b[0m|\x1b[1;4m 2 \x1b[0m|',
    '|\x1b[32m 3 \x1b[0m| 4 |',
    '+---+---+',
  ]);
});

test('colour is detected from the injected environment', () => {
  const table = new Table({ columns: [{ key: 'a', title: 'A' }] }).row(['1']);
  const render = (environment) => renderText(table, { border: 'none', environment });
  assert.equal(render({ env: {}, isTTY: true }), '\x1b[1mA\x1b[0m\n1');
  assert.equal(render({ env: { NO_COLOR: '1' }, isTTY: true }), 'A\n1');
  assert.equal(render({ env: {}, isTTY: false }), 'A\n1');
  assert.equal(render({ env: { FORCE_COLOR: '1' }, isTTY: false }), '\x1b[1mA\x1b[0m\n1');
});

test('render options override the table options and are validated', () => {
  const table = new Table({ border: 'ascii' }).row(['1']);
  assert.equal(renderText(table, plain), '+---+\n| 1 |\n+---+');
  assert.equal(renderText(table, { ...plain, border: 'light' }), '┌───┐\n│ 1 │\n└───┘');
  assert.throws(() => renderText(table, { colour: false }), /did you mean "color"/);
  assert.throws(() => renderText(table, { color: 'yes' }), OptionError);
  assert.throws(() => renderText(table, { columns: [] }), OptionError);
  assert.throws(() => renderText({}, plain), /expected a Table/);
});

test('renderLines accepts fixed widths and can leave out the outer rules', () => {
  const table = new Table().row(['a', 'b']);
  assert.deepEqual(renderLines(table, plain, { widths: [3, 2], bare: true }), ['│ a   │ b  │']);
  assert.throws(() => renderLines(table, plain, { widths: [3] }), LayoutError);
});

test('tableOverhead counts borders and padding', () => {
  assert.equal(tableOverhead(3, resolveBorder('light'), 1), 10);
  assert.equal(tableOverhead(3, resolveBorder('light'), 0), 4);
  assert.equal(tableOverhead(3, resolveBorder('none'), 1), 4);
  assert.equal(tableOverhead(0, resolveBorder('light'), 1), 0);
});

test('columnMetric turns a column definition into allocation bounds', () => {
  const metric = (options, natural) => columnMetric(normalizeColumn(options, 0), natural);
  assert.deepEqual(metric({ width: 7 }, 20), { preferred: 7, floor: 7, ceiling: 7, flex: 0 });
  assert.deepEqual(metric({ minWidth: 4, maxWidth: 9 }, 20), { preferred: 9, floor: 4, ceiling: 9, flex: 1 });
  assert.deepEqual(metric({ flex: 0 }, 6), { preferred: 6, floor: 6, ceiling: Infinity, flex: 0 });
  assert.deepEqual(metric({ align: 'decimal' }, 6), { preferred: 6, floor: 6, ceiling: Infinity, flex: 1 });
});

test('simpleRule draws rules for a span-free table', () => {
  const border = resolveBorder('light');
  assert.equal(simpleRule(border, [1, 2], 1, 'top'), '┌───┬────┐');
  assert.equal(simpleRule(border, [1, 2], 1, 'middle'), '├───┼────┤');
  assert.equal(simpleRule(border, [1, 2], 1, 'bottom'), '└───┴────┘');
  assert.equal(simpleRule(resolveBorder('markdown'), [1, 2], 1, 'middle'), '|---|----|');
});
