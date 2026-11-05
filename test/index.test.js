import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tablefmt from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('VERSION matches package.json', () => {
  assert.equal(tablefmt.VERSION, pkg.version);
});

test('the public API is complete and stable', () => {
  assert.deepEqual(Object.keys(tablefmt).sort(), [
    'BORDERS',
    'BORDER_NAMES',
    'INPUT_FORMATS',
    'LayoutError',
    'OUTPUT_FORMATS',
    'OptionError',
    'ParseError',
    'Table',
    'TableStream',
    'TablefmtError',
    'UsageError',
    'VERSION',
    'alignDecimal',
    'codePointWidth',
    'compareValues',
    'createStream',
    'createStyler',
    'detectColor',
    'detectFormat',
    'expandTabs',
    'filterRecords',
    'fromArrays',
    'fromCsv',
    'fromJson',
    'fromNdjson',
    'fromObjects',
    'fromRecordSet',
    'graphemeWidth',
    'graphemes',
    'hasAnsi',
    'inferColumns',
    'pad',
    'parseCsv',
    'parseFilter',
    'parseNdjson',
    'parseSort',
    'readRecords',
    'render',
    'renderCsv',
    'renderHtml',
    'renderMarkdown',
    'renderText',
    'selectColumns',
    'sortRecords',
    'stringWidth',
    'stripAnsi',
    'truncate',
    'wrap',
  ]);
});

test('render dispatches on the format name', () => {
  const table = tablefmt.fromObjects([{ a: 1, b: 'x,y' }]);
  assert.equal(tablefmt.render(table, 'text', { color: false, border: 'ascii' }), '+---+-----+\n| a | b   |\n+---+-----+\n| 1 | x,y |\n+---+-----+');
  assert.equal(tablefmt.render(table, undefined, { color: false, border: 'none' }), 'a  b\n1  x,y');
  assert.equal(tablefmt.render(table, 'markdown'), '|   a | b   |\n| --: | --- |\n|   1 | x,y |');
  assert.equal(tablefmt.render(table, 'csv', { newline: '\n' }), 'a,b\n1,"x,y"');
  assert.ok(tablefmt.render(table, 'html').startsWith('<table>'));
  assert.throws(() => tablefmt.render(table, 'htm'), /expected one of text, markdown, csv, html, got "htm" \(did you mean "html"\?\)/);
});

test('a pipeline from CSV text to a rendered table', () => {
  const set = tablefmt.readRecords('city,pop\nOslo,709000\nBergen,289000\nTromsø,78000\n', 'csv');
  const records = tablefmt.sortRecords(tablefmt.filterRecords(set.records, 'pop > 100000'), '-pop');
  const table = tablefmt.fromRecordSet(tablefmt.selectColumns({ keys: set.keys, records }, 'pop,city'));
  assert.deepEqual(tablefmt.renderText(table, { color: false, border: 'rounded' }).split('\n'), [
    '╭────────┬────────╮',
    '│    pop │ city   │',
    '├────────┼────────┤',
    '│ 709000 │ Oslo   │',
    '│ 289000 │ Bergen │',
    '╰────────┴────────╯',
  ]);
});
