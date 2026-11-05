import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Table, normalizeCell, checkTableOptions } from '../src/table.js';
import { buildGrid } from '../src/grid.js';
import { OptionError, LayoutError } from '../src/errors.js';

/** Build the grid of a table the way the renderers do. */
function gridOf(table) {
  return buildGrid(
    { header: table.headerRows, body: table.bodyRows, footer: table.footerRows },
    table.columns?.length,
  );
}

/** Render the grid as a small map of cell values, for readable assertions. */
function sketch(grid) {
  return grid.slots.map((row) => row.map((cell) => (cell.filler ? '.' : String(cell.spec.value))).join(' '));
}

test('normalizeCell treats plain values as content', () => {
  assert.deepEqual(normalizeCell(42, 'cell'), {
    value: 42, colSpan: 1, rowSpan: 1, align: undefined, valign: undefined, sgr: '',
  });
  assert.equal(normalizeCell(null, 'cell').value, null);
  assert.deepEqual(normalizeCell({ a: 1 }, 'cell').value, { a: 1 }, 'objects without content are values');
  const date = new Date(0);
  assert.equal(normalizeCell(date, 'cell').value, date);
});

test('normalizeCell reads an object with content as cell options', () => {
  const cell = normalizeCell({ content: 'x', colSpan: 2, rowSpan: 3, align: 'center', valign: 'middle', style: 'red' }, 'cell');
  assert.deepEqual(cell, { value: 'x', colSpan: 2, rowSpan: 3, align: 'center', valign: 'middle', sgr: '31' });
});

test('normalizeCell validates cell options', () => {
  assert.throws(() => normalizeCell({ content: 'x', colSpan: 0 }, 'row 1, cell 2'), (error) => error.option === 'row 1, cell 2.colSpan');
  assert.throws(() => normalizeCell({ content: 'x', rowSpan: 1.5 }, 'c'), OptionError);
  assert.throws(() => normalizeCell({ content: 'x', align: 'decimal' }, 'c'), OptionError);
  assert.throws(() => normalizeCell({ content: 'x', colspan: 2 }, 'c'), /did you mean "colSpan"/);
});

test('Table validates its options', () => {
  assert.throws(() => new Table({ border: 'fancy' }), OptionError);
  assert.throws(() => new Table({ padding: -1 }), OptionError);
  assert.throws(() => new Table({ maxWidth: 0 }), OptionError);
  assert.throws(() => new Table({ expand: 'yes' }), /expected a boolean/);
  assert.throws(() => new Table({ zebra: { fg: 'nope' } }), /unknown colour/);
  assert.throws(() => new Table({ headerStyle: { blod: true } }), OptionError);
  assert.throws(() => new Table({ nullText: 0 }), /expected a string/);
  assert.throws(() => new Table({ colums: [] }), /did you mean "columns"/);
  assert.throws(() => new Table('nope'), OptionError);
  assert.doesNotThrow(() => new Table({ zebra: true, rowSeparators: true, border: 'ascii', padding: 0 }));
});

test('checkTableOptions returns only the given keys', () => {
  assert.deepEqual(checkTableOptions({ padding: 2 }), { padding: 2 });
  assert.deepEqual(checkTableOptions(undefined), {});
});

test('methods chain and collect rows per section', () => {
  const table = new Table().header(['a', 'b']).row([1, 2]).rows([[3, 4], [5, 6]]).footer(['x', 'y']);
  assert.equal(table.headerRows.length, 1);
  assert.equal(table.bodyRows.length, 3);
  assert.equal(table.footerRows.length, 1);
});

test('object rows are mapped through the column keys', () => {
  const table = new Table({ columns: ['name', 'qty'] });
  table.row({ qty: 2, name: 'pear', ignored: true });
  assert.deepEqual(table.bodyRows[0].cells.map((cell) => cell.value), ['pear', 2]);
  table.row({ name: 'fig' });
  assert.deepEqual(table.bodyRows[1].cells.map((cell) => cell.value), ['fig', undefined]);
});

test('object rows need keyed columns', () => {
  assert.throws(() => new Table().row({ a: 1 }), /object rows need every column to have a key/);
  assert.throws(() => new Table({ columns: [{ title: 'A' }] }).row({ a: 1 }), OptionError);
});

test('rows must be arrays or plain objects', () => {
  assert.throws(() => new Table().row('abc'), /row 1.*expected an array or object, got "abc"/);
  assert.throws(() => new Table().header(5), /header row 1/);
  assert.throws(() => new Table().rows('abc'), /expected an iterable of rows/);
  assert.throws(() => new Table().rows(null), OptionError);
  assert.throws(() => new Table().row([1], { colour: 'red' }), /unknown option/);
});

test('rows accepts any iterable', () => {
  const table = new Table().rows(new Set([[1], [2]]));
  assert.equal(table.bodyRows.length, 2);
});

test('group starts a new group and can add a title row', () => {
  const table = new Table().row(['a']).group('Second').row(['b']).group().row(['c']);
  assert.deepEqual(table.bodyRows.map((row) => row.group), [0, 1, 1, 2]);
  assert.deepEqual(table.bodyRows.map((row) => row.title), [false, true, false, false]);
});

test('a group before any row does not create an empty group', () => {
  const table = new Table().group('First').row(['a']);
  assert.deepEqual(table.bodyRows.map((row) => row.group), [0, 0]);
});

test('the grid infers the column count from the widest row', () => {
  const grid = gridOf(new Table().row([1]).row([1, 2, 3]).row([1, 2]));
  assert.equal(grid.columnCount, 3);
  assert.deepEqual(sketch(grid), ['1 . .', '1 2 3', '1 2 .']);
});

test('an empty table has an empty grid', () => {
  const grid = gridOf(new Table());
  assert.equal(grid.columnCount, 0);
  assert.deepEqual(grid.rows, []);
  assert.deepEqual(grid.cells, []);
});

test('column spans cover neighbouring slots', () => {
  const grid = gridOf(new Table().row([{ content: 'a', colSpan: 2 }, 'b']).row(['c', 'd', 'e']));
  assert.deepEqual(sketch(grid), ['a a b', 'c d e']);
  assert.equal(grid.slots[0][0], grid.slots[0][1]);
});

test('row spans push later cells to the right', () => {
  const table = new Table()
    .row([{ content: 'a', rowSpan: 2 }, 'b', 'c'])
    .row(['d', 'e'])
    .row(['f', { content: 'g', rowSpan: 2, colSpan: 2 }])
    .row(['h']);
  assert.deepEqual(sketch(gridOf(table)), ['a b c', 'a d e', 'f g g', 'h g g']);
});

test('a span in the middle of a row is skipped over', () => {
  const table = new Table().row(['a', { content: 'b', rowSpan: 2 }, 'c']).row(['d', 'e']);
  assert.deepEqual(sketch(gridOf(table)), ['a b c', 'd b e']);
});

test('cells are listed once in reading order', () => {
  const table = new Table().row([{ content: 'a', rowSpan: 2 }, 'b']).row(['c']);
  assert.deepEqual(gridOf(table).cells.map((cell) => cell.spec.value), ['a', 'b', 'c']);
});

test('sections are stacked header, body, footer', () => {
  const table = new Table().row(['b']).footer(['f']).header(['h']);
  const grid = gridOf(table);
  assert.deepEqual(grid.rows.map((row) => row.section), ['header', 'body', 'footer']);
  assert.deepEqual(sketch(grid), ['h', 'b', 'f']);
});

test('a group title spans every column', () => {
  const grid = gridOf(new Table().group('T').row([1, 2, 3]));
  assert.deepEqual(sketch(grid), ['T T T', '1 2 3']);
  assert.equal(grid.slots[0][0].colSpan, 3);
});

test('too many cells for the defined columns is a layout error', () => {
  const table = new Table({ columns: ['a', 'b'] }).row([1, 2, 3]);
  assert.throws(() => gridOf(table), (error) => error instanceof LayoutError && /body row 1: cell 3 would end at column 3 but the table has 2 columns/.test(error.message));
  const spanning = new Table({ columns: ['a', 'b'] }).row([1, { content: 2, colSpan: 2 }]);
  assert.throws(() => gridOf(spanning), /would end at column 3/);
});

test('a row span may not leave its section', () => {
  const table = new Table().header([{ content: 'h', rowSpan: 2 }]).row(['b']);
  assert.throws(() => gridOf(table), /header row 1: cell 1 has rowSpan 2 but only 1 row remains in the header/);
  const body = new Table().row(['a']).row([{ content: 'b', rowSpan: 3 }]);
  assert.throws(() => gridOf(body), /only 1 row remains in the body/);
});

test('a column span that runs into a row span is rejected', () => {
  const table = new Table().row(['a', { content: 'b', rowSpan: 2 }]).row([{ content: 'c', colSpan: 2 }]);
  assert.throws(() => gridOf(table), /body row 2: cell 1 overlaps a cell that spans down from an earlier row/);
});

test('a row span may not cross a group title', () => {
  const table = new Table().row([{ content: 'a', rowSpan: 3 }, 'b']).group('T').row(['c']);
  assert.throws(() => gridOf(table), /body row 2: a group title cannot be crossed/);
  const second = new Table().row(['a', { content: 'b', rowSpan: 3 }]).group('T').row(['c']);
  assert.throws(() => gridOf(second), /body row 2: a group title cannot be crossed/);
});
