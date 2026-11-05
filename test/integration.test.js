import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Table,
  createStream,
  expandTabs,
  filterRecords,
  fromCsv,
  fromObjects,
  fromRecordSet,
  parseCsv,
  readRecords,
  render,
  renderCsv,
  renderText,
  selectColumns,
  sortRecords,
  stringWidth,
  stripAnsi,
  wrap,
  truncate,
} from '../src/index.js';

/** Small deterministic generator so failures can be reproduced. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const WORDS = [
  'alpha', 'beta', 'x', 'supercalifragilistic', '中文', '日本語テキスト', 'café', 'naïve', '👍', '🇯🇵',
  'e\u{0301}', '12.5', '-3', 'a-b', '\x1b[31mred\x1b[0m', '\x1b[1;4mbold\x1b[22;24m', 'tab\there', 'two\nlines', '',
];

/** @param {() => number} next */
function phrase(next) {
  const count = Math.floor(next() * 5);
  const words = [];
  for (let i = 0; i < count; i++) words.push(WORDS[Math.floor(next() * WORDS.length)]);
  return words.join(' ');
}

test('wrapped lines never exceed the width and keep all visible text', () => {
  const next = random(1);
  for (let round = 0; round < 300; round++) {
    const text = phrase(next);
    const width = 2 + Math.floor(next() * 12);
    const lines = wrap(text, width);
    for (const line of lines) {
      assert.ok(stringWidth(line) <= width, `${JSON.stringify(line)} is wider than ${width}`);
    }
    const squash = (value) => stripAnsi(value).replace(/\s+/g, '');
    assert.equal(squash(lines.join('')), squash(text), `wrapping ${JSON.stringify(text)} at ${width}`);
  }
});

test('truncated text fits the width and is unchanged when it already fits', () => {
  const next = random(2);
  for (let round = 0; round < 300; round++) {
    const text = phrase(next).replace(/\n/g, ' ');
    const width = 1 + Math.floor(next() * 12);
    for (const position of ['end', 'start', 'middle']) {
      const result = truncate(text, width, { position });
      assert.ok(stringWidth(result) <= width, `${JSON.stringify(result)} is wider than ${width}`);
      if (stringWidth(text) <= width) assert.equal(stripAnsi(result), expandTabs(stripAnsi(text)));
    }
  }
});

test('every line of a bordered table has the same width, within maxWidth', () => {
  const next = random(3);
  for (let round = 0; round < 120; round++) {
    const columns = 1 + Math.floor(next() * 4);
    const table = new Table({ border: ['light', 'ascii', 'double', 'rounded', 'heavy'][round % 5], rowSeparators: round % 3 === 0 });
    table.header(Array.from({ length: columns }, (_, i) => `col ${i}`));
    const rows = 1 + Math.floor(next() * 4);
    for (let r = 0; r < rows; r++) table.row(Array.from({ length: columns }, () => phrase(next)));
    const maxWidth = columns * 7 + 1 + Math.floor(next() * 30);
    const lines = renderText(table, { maxWidth, color: round % 2 === 0 }).split('\n');
    const widths = new Set(lines.map((line) => stringWidth(line)));
    assert.equal(widths.size, 1, `round ${round}: ragged lines\n${lines.join('\n')}`);
    assert.ok([...widths][0] <= maxWidth, `round ${round}: wider than ${maxWidth}`);
  }
});

test('spans, groups, footers and nested tables line up together', () => {
  const inner = new Table({ border: 'ascii' }).header(['k', 'v']).rows([['a', 1], ['b', 2]]);
  const table = new Table({ columns: ['Region', 'Q1', 'Q2', { key: 'detail', title: 'Detail' }], border: 'light' })
    .group('North')
    .rows([
      [{ content: 'Oslo', rowSpan: 2 }, 10, 12, inner],
      [{ content: 'no data', colSpan: 2, align: 'center' }, 'second line'],
    ])
    .group('South')
    .row(['Rome', 7, 9, ''])
    .footer([{ content: 'Total', colSpan: 3 }, '38']);
  const lines = renderText(table, { color: false }).split('\n');
  assert.deepEqual(lines, [
    '┌────────┬────┬────┬─────────────┐',
    '│ Region │ Q1 │ Q2 │ Detail      │',
    '├────────┴────┴────┴─────────────┤',
    '│ North                          │',
    '│ Oslo   │ 10 │ 12 │ +---+---+   │',
    '│        │    │    │ | k | v |   │',
    '│        │    │    │ +---+---+   │',
    '│        │    │    │ | a | 1 |   │',
    '│        │    │    │ | b | 2 |   │',
    '│        │    │    │ +---+---+   │',
    '│        │ no data │ second line │',
    '├────────┴─────────┴─────────────┤',
    '│ South                          │',
    '│ Rome   │ 7  │ 9  │             │',
    '├────────┴────┴────┼─────────────┤',
    '│ Total            │ 38          │',
    '└──────────────────┴─────────────┘',
  ]);
});

test('CSV survives a round trip through the table model', () => {
  const next = random(4);
  const rows = [['id', 'text', 'note']];
  for (let r = 0; r < 60; r++) {
    rows.push([String(r), phrase(next).replace(/\x1b\[[0-9;]*m/g, ''), ['plain', 'a,b', 'say "hi"', 'line\nbreak', ' padded ', ''][r % 6]]);
  }
  const table = fromCsv(renderCsv(new Table().rows(rows)));
  assert.deepEqual(parseCsv(renderCsv(table)), rows);
  assert.deepEqual(parseCsv(renderCsv(table, { quote: 'all', newline: '\n', delimiter: ';' }), { delimiter: ';' }), rows);
});

test('records flow from text through filter, sort and select into every renderer', () => {
  const csv = 'city,country,population,area\nOslo,NO,709000,454\nBergen,NO,289000,465\nRome,IT,2760000,1285\nMilan,IT,1370000,182\nNice,FR,342000,72\n';
  let set = readRecords(csv, 'csv');
  set = { keys: set.keys, records: filterRecords(set.records, ['population >= 300000', 'country != FR'], set.keys) };
  set = { keys: set.keys, records: sortRecords(set.records, 'country,-population', set.keys) };
  set = selectColumns(set, ['city', 'population']);
  const table = fromRecordSet(set, { border: 'ascii' });
  assert.equal(render(table, 'csv', { newline: '\n' }), 'city,population\nRome,2760000\nMilan,1370000\nOslo,709000');
  assert.equal(render(table, 'markdown'), [
    '| city  | population |',
    '| ----- | ---------: |',
    '| Rome  |    2760000 |',
    '| Milan |    1370000 |',
    '| Oslo  |     709000 |',
  ].join('\n'));
  assert.equal(render(table, 'text', { color: false }), [
    '+-------+------------+',
    '| city  | population |',
    '+-------+------------+',
    '| Rome  |    2760000 |',
    '| Milan |    1370000 |',
    '| Oslo  |     709000 |',
    '+-------+------------+',
  ].join('\n'));
  const html = render(table, 'html');
  assert.equal(html.match(/<tr>/g).length, 4);
  assert.ok(html.includes('<td style="text-align: right">2760000</td>'));
});

test('a stream draws the same table as the batch renderer given the same widths', () => {
  const columns = [
    { key: 'id', width: 4, align: 'right' },
    { key: 'name', width: 12 },
    { key: 'note', width: 10, wrap: 'hard' },
  ];
  const rows = [
    [1, 'Ada Lovelace', 'first programmer'],
    [2, '中文 name', ''],
    [3, 'x', 'a\nb'],
  ];
  for (const border of ['light', 'ascii', 'none', 'markdown']) {
    for (const rowSeparators of [false, true]) {
      let streamed = '';
      const stream = createStream({ columns, border, rowSeparators, color: false, output: { write: (chunk) => (streamed += chunk) } });
      for (const row of rows) stream.write(row);
      stream.end();
      const batch = renderText(new Table({ columns, border, rowSeparators }).rows(rows), { color: false });
      assert.equal(streamed, `${batch}\n`, `border ${border}, separators ${rowSeparators}`);
    }
  }
});

test('colour never changes the layout', () => {
  const data = [
    { name: '\x1b[32mok\x1b[0m', detail: 'all \x1b[1mgood\x1b[22m here', n: 1 },
    { name: '\x1b[31mfailed\x1b[0m', detail: '\x1b]8;;https://example.com\x1b\\see the log\x1b]8;;\x1b\\', n: 22 },
  ];
  const options = { zebra: true, maxWidth: 30, columns: [{ key: 'name', style: { fg: 'cyan' } }, 'detail', { key: 'n', align: 'right' }] };
  const coloured = renderText(fromObjects(data, options), { color: true });
  const plain = renderText(fromObjects(data, options), { color: false });
  assert.notEqual(coloured, plain);
  assert.equal(stripAnsi(coloured), stripAnsi(plain));
  assert.ok(!plain.includes('\x1b[3'), 'colours given as options are dropped');
});

test('a large table renders in one pass without recursion limits', () => {
  const rows = Array.from({ length: 5000 }, (_, i) => ({ id: i, label: `row ${i}`, value: (i * 0.25).toFixed(2) }));
  const lines = renderText(fromObjects(rows), { color: false }).split('\n');
  assert.equal(lines.length, 5000 + 4);
  assert.equal(lines[3], '│    0 │ row 0    │    0.00 │');
  assert.equal(lines.at(-2), '│ 4999 │ row 4999 │ 1249.75 │');
});
