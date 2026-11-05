import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStream, TableStream } from '../src/stream.js';
import { stringWidth } from '../src/cells.js';
import { LayoutError, OptionError, TablefmtError } from '../src/errors.js';

/**
 * A stream that collects what is written to it.
 * @param {Record<string, any>} options
 */
function collect(options) {
  /** @type {string[]} */
  const chunks = [];
  const stream = createStream({ color: false, ...options, output: { write: (chunk) => chunks.push(chunk) } });
  return { stream, chunks, text: () => chunks.join('') };
}

const columns = [
  { key: 'id', title: 'ID', width: 4, align: 'right' },
  { key: 'msg', title: 'Message' },
  { key: 'lvl', title: 'Lvl', align: 'center' },
];

test('rows are written as they arrive, between a header and a closing rule', () => {
  const { stream, chunks } = collect({ columns, maxWidth: 40 });
  assert.ok(stream instanceof TableStream);
  assert.deepEqual(chunks, [], 'nothing is written before the first row');
  stream.write([1, 'first row', 'ok']);
  assert.deepEqual(chunks, [
    '┌──────┬─────────────────┬─────────────┐\n│   ID │ Message         │     Lvl     │\n',
    '├──────┼─────────────────┼─────────────┤\n│    1 │ first row       │     ok      │\n',
  ]);
  stream.write({ id: 2, msg: 'second', lvl: 'x' });
  assert.equal(chunks[2], '│    2 │ second          │      x      │\n');
  stream.end();
  assert.equal(chunks[3], '└──────┴─────────────────┴─────────────┘\n');
  assert.equal(stream.rowCount, 2);
});

test('widths are fixed up front and fill maxWidth', () => {
  const { stream, text } = collect({ columns, maxWidth: 40 });
  assert.deepEqual(stream.widths, [4, 15, 11]);
  stream.write([7, 'a much longer message that has to wrap', 'warn']).end();
  const lines = text().trimEnd().split('\n');
  assert.ok(lines.every((line) => stringWidth(line) === 40));
  assert.deepEqual(lines.slice(3, 6), [
    '│    7 │ a much longer   │    warn     │',
    '│      │ message that    │             │',
    '│      │ has to wrap     │             │',
  ]);
});

test('without maxWidth a column is as wide as its title, width or minWidth', () => {
  const { stream, text } = collect({
    columns: [{ key: 'a', title: 'Name' }, { key: 'b', title: 'B', minWidth: 6 }, { key: 'c', title: 'C', width: 3, wrap: 'none' }],
    border: 'ascii',
  });
  assert.deepEqual(stream.widths, [4, 6, 3]);
  stream.write(['ab', 'cd', 'truncated']).end();
  assert.deepEqual(text().trimEnd().split('\n'), [
    '+------+--------+-----+',
    '| Name | B      | C   |',
    '+------+--------+-----+',
    '| ab   | cd     | tr… |',
    '+------+--------+-----+',
  ]);
});

test('row separators and other border styles', () => {
  const two = [{ key: 'a', title: 'A' }, { key: 'b', title: 'Bee' }];
  const ascii = collect({ columns: two, border: 'ascii', rowSeparators: true });
  ascii.stream.write(['1', '2']).write(['3', '4']).end();
  assert.deepEqual(ascii.text().trimEnd().split('\n'), [
    '+---+-----+',
    '| A | Bee |',
    '+---+-----+',
    '| 1 | 2   |',
    '+---+-----+',
    '| 3 | 4   |',
    '+---+-----+',
  ]);
  const markdown = collect({ columns: two, border: 'markdown', rowSeparators: true });
  markdown.stream.write(['1', '2']).write(['3', '4']).end();
  assert.equal(markdown.text(), '| A | Bee |\n|---|-----|\n| 1 | 2   |\n| 3 | 4   |\n');
  const none = collect({ columns: two, border: 'none' });
  none.stream.write(['1', '2']).end();
  assert.equal(none.text(), 'A  Bee\n1  2\n');
});

test('header: false starts with the first row', () => {
  const { stream, text } = collect({ columns: [{ key: 'a', title: 'A', width: 3 }], header: false });
  stream.write(['x']).write(['y']).end();
  assert.equal(text(), '┌─────┐\n│ x   │\n│ y   │\n└─────┘\n');
});

test('an empty stream still shows its header', () => {
  const { stream, text } = collect({ columns: [{ key: 'a', title: 'A' }] });
  stream.end();
  stream.end();
  assert.equal(text(), '┌───┐\n│ A │\n└───┘\n');
});

test('zebra striping and row styles work across writes', () => {
  const { stream, chunks } = collect({ columns: [{ key: 'a', title: 'A' }], color: true, zebra: true, border: 'none' });
  stream.write(['1']).write(['2']).write(['3'], { style: 'red' }).end();
  assert.deepEqual(chunks, ['\x1b[1mA\x1b[0m\n', '1\n', '\x1b[2m2\x1b[0m\n', '\x1b[31m3\x1b[0m\n']);
});

test('colour follows the output and the injected environment', () => {
  const run = (output, extra) => {
    const chunks = [];
    const stream = new TableStream({
      columns: [{ key: 'a', title: 'A' }],
      border: 'none',
      output: { ...output, write: (chunk) => chunks.push(chunk) },
      ...extra,
    });
    stream.end();
    return chunks.join('');
  };
  assert.equal(run({ isTTY: true }, { environment: { env: {}, isTTY: true } }), '\x1b[1mA\x1b[0m\n');
  assert.equal(run({ isTTY: true }, { environment: { env: { NO_COLOR: '1' }, isTTY: true } }), 'A\n');
  assert.equal(run({}, { color: true }), '\x1b[1mA\x1b[0m\n');
  assert.equal(run({ isTTY: true }, { color: false }), 'A\n');
});

test('writing after end and spanning cells are errors', () => {
  const { stream, chunks } = collect({ columns: [{ key: 'a', title: 'A' }, { key: 'b', title: 'B' }] });
  assert.throws(() => stream.write([{ content: 'x', colSpan: 2 }]), LayoutError);
  assert.deepEqual(chunks, [], 'a rejected first row writes nothing');
  stream.write(['1', '2']);
  assert.throws(() => stream.write([{ content: 'x', rowSpan: 2 }, 'y']), /Spanning cells are not supported/);
  stream.write(['3', '4']);
  stream.end();
  assert.equal(stream.rowCount, 2);
  assert.throws(
    () => stream.write(['5', '6']),
    (error) => error instanceof TablefmtError && error.code === 'ERR_STREAM_ENDED',
  );
});

test('options are validated', () => {
  assert.throws(() => createStream({}), /needs its columns up front/);
  assert.throws(() => createStream({ columns: [] }), OptionError);
  assert.throws(() => createStream({ columns: [{ key: 'a' }], output: {} }), /write method/);
  assert.throws(() => createStream({ columns: [{ key: 'a' }], color: 1 }), OptionError);
  assert.throws(() => createStream({ columns: [{ key: 'a' }], maxWdith: 10 }), /did you mean "maxWidth"/);
  assert.throws(() => createStream({ columns: [{ key: 'a' }, { key: 'b' }], maxWidth: 8 }), LayoutError);
  assert.throws(() => createStream({ columns: [{ key: 'a', width: 30 }], maxWidth: 20 }), LayoutError);
});
