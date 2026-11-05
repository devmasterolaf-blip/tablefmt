# tablefmt

A terminal table and text-layout library for Node.js, with a small
command-line tool.

It measures text the way a terminal draws it (wide CJK characters, emoji,
combining marks), keeps ANSI colours and hyperlinks intact while wrapping
and truncating, and lays out tables with column spans, row spans, groups,
footers and nested tables. The same table can be written as bordered text,
Markdown, CSV or HTML, and can be built from objects, arrays, CSV, JSON or
NDJSON.

- Plain JavaScript (ES modules) with JSDoc types, no runtime dependencies
- Node.js 22 or newer
- Version 0.1.0: a first release; the API may still change

## Contents

- [Install](#install)
- [Command line](#command-line)
- [Library quick start](#library-quick-start)
- [Tables](#tables)
- [Colour and styles](#colour-and-styles)
- [Text helpers](#text-helpers)
- [Reading data](#reading-data)
- [Sorting, filtering and selecting](#sorting-filtering-and-selecting)
- [Other output formats](#other-output-formats)
- [Streaming](#streaming)
- [Errors](#errors)
- [Project layout](#project-layout)
- [Tests](#tests)
- [Limitations](#limitations)

## Install

The package is not published to the npm registry. Use it from a clone:

```sh
git clone <repository-url> tablefmt
cd tablefmt
npm test          # optional: run the test suite
npm link          # puts the `tablefmt` command on your PATH
```

To use the library from another project, install it by path:

```sh
npm install /path/to/tablefmt
```

There is no build step and nothing to compile.

## Command line

```
tablefmt [options] [file]
```

`tablefmt` reads CSV, JSON or NDJSON from a file, or from standard input
when no file (or `-`) is given, and prints a table. The examples below use
the files in `test/fixtures`.

```console
$ tablefmt test/fixtures/fruit.csv
┌────────┬─────┬───────┬──────────────┐
│ name   │ qty │ price │ note         │
├────────┼─────┼───────┼──────────────┤
│ apple  │   3 │  1.25 │ crisp, sweet │
│ kiwi   │  12 │  0.50 │              │
│ banana │   7 │  0.25 │ ripe         │
│ cherry │ 100 │  4.00 │ in season    │
└────────┴─────┴───────┴──────────────┘
```

Columns that hold only numbers are right-aligned. Filter, sort, pick and
rename columns, and choose a border style:

```console
$ tablefmt test/fixtures/fruit.csv --filter 'qty >= 7' --sort -qty --columns name=Fruit,qty --style rounded
╭────────┬─────╮
│ Fruit  │ qty │
├────────┼─────┤
│ cherry │ 100 │
│ kiwi   │  12 │
│ banana │   7 │
╰────────┴─────╯
```

Write Markdown, CSV or HTML instead of a drawn table:

```console
$ tablefmt test/fixtures/fruit.json --format markdown
| name  | qty | tags            | origin |
| ----- | --: | --------------- | ------ |
| apple |   3 | ["red","green"] |        |
| kiwi  |  12 |                 | NZ     |

$ cat test/fixtures/log.ndjson | tablefmt --format csv --filter 'level = info'
level,msg,ms
info,started,12
info,done,3
```

Fit the table into a width; long cells wrap:

```console
$ tablefmt test/fixtures/fruit.csv -c name,note --max-width 24 --row-separators -s ascii
+--------+-------------+
| name   | note        |
+--------+-------------+
| apple  | crisp,      |
|        | sweet       |
+--------+-------------+
| kiwi   |             |
+--------+-------------+
| banana | ripe        |
+--------+-------------+
| cherry | in season   |
+--------+-------------+
```

### Options

| Option | Meaning |
| --- | --- |
| `-f`, `--format <name>` | Output format: `text` (default), `markdown`, `csv`, `html` |
| `-i`, `--input <name>` | Input format: `auto` (default), `csv`, `json`, `ndjson` |
| `-s`, `--style <name>` | Border style for text output: `ascii`, `light` (default), `heavy`, `double`, `rounded`, `markdown`, `none` |
| `-c`, `--columns <list>` | Columns to show, in order; `name=Title` renames one |
| `--sort <spec>` | Sort by columns: `qty`, `-qty,name`, `qty:desc` |
| `--filter <expr>` | Keep matching rows; may be repeated (all must match) |
| `-w`, `--max-width <n>` | Fit text output into `n` terminal columns |
| `-d`, `--delimiter <char>` | CSV input delimiter; `tab` or `\t` for tabs |
| `--no-header` | The input has no header row; print no header |
| `--zebra` | Dim every second row (when colour is on) |
| `--row-separators` | Draw a rule between all rows |
| `--color`, `--no-color` | Force colour on or off |
| `-h`, `--help`, `-V`, `--version` | Help and version |

With `--input auto` the format comes from the file extension (`.csv`,
`.tsv`, `.json`, `.ndjson`, `.jsonl`) and otherwise from the content: text
that starts with `[` or `{` is JSON or NDJSON, anything else is CSV. A
`.tsv` file is read with a tab delimiter.

Filter expressions are `column operator value` with the operators `=`,
`!=`, `<`, `<=`, `>`, `>=`, `~` (contains, ignoring case) and `!~`. Values
that look like numbers compare as numbers. Quote a value to keep leading or
trailing spaces: `--filter 'name = " x "'`. Filters and `--sort` use the
original column names, also when `--columns` renames or hides a column.

When standard output is a terminal, text output is fitted to the terminal
width and coloured (bold header) unless `NO_COLOR` is set. When it is piped,
the table keeps its natural width and no escape sequences are written.

### Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Success |
| 1 | The input could not be read or parsed, or the table does not fit `--max-width` |
| 2 | Invalid usage: unknown option, bad option value, unknown column, bad filter |

```console
$ tablefmt test/fixtures/fruit.csv --sort nmae
tablefmt: Invalid option "sort": unknown column "nmae" (did you mean "name"?); available: name, qty, price, note
$ echo $?
2
```

## Library quick start

```js
import { Table, renderText } from 'tablefmt';

const table = new Table({ columns: ['Package', 'Version', 'Size'] })
  .row(['left-pad', '1.3.0', '4 kB'])
  .row(['日本語', '0.2.1', '12 kB'])
  .row(['emoji 👍', '10.0.0', '1.1 MB']);

console.log(renderText(table));
```

```
┌──────────┬─────────┬────────┐
│ Package  │ Version │ Size   │
├──────────┼─────────┼────────┤
│ left-pad │ 1.3.0   │ 4 kB   │
│ 日本語   │ 0.2.1   │ 12 kB  │
│ emoji 👍 │ 10.0.0  │ 1.1 MB │
└──────────┴─────────┴────────┘
```

(The borders line up in a terminal, where `日本語` and `👍` take two
columns per character; a proportional font in a browser may show them
shifted.)

Three more complete programs live in [`examples/`](examples): a report
with groups and a nested table, a filter-and-sort pipeline, and a stream.
Run them with `node examples/report.js` and so on.

## Tables

### Columns

`columns` is a list of titles or of column definitions:

| Property | Meaning |
| --- | --- |
| `key` | Property name used for object rows and by the input adapters |
| `title` | Header text (defaults to the key) |
| `width` | Fixed content width in terminal columns |
| `minWidth`, `maxWidth` | Bounds for an automatic width |
| `flex` | Weight when width is shared out (default 1); `0` pins the column at its natural width |
| `align` | `left` (default), `right`, `center` or `decimal` |
| `headerAlign` | Alignment of the header cell (defaults to `align`; `decimal` becomes `right`) |
| `valign` | `top` (default), `middle` or `bottom` |
| `format` | `(value, { row, column }) => value` applied to body cells |
| `wrap` | `word` (default), `hard` (break anywhere) or `none` (truncate) |
| `truncate` | Where the ellipsis goes when `wrap` is `none`: `end`, `start`, `middle` |
| `ellipsis` | Truncation marker (default `…`) |
| `style` | Style for the body cells of the column |

```js
import { Table, renderText } from 'tablefmt';

const table = new Table({
  border: 'rounded',
  maxWidth: 44,
  columns: [
    { key: 'name', title: 'Name', flex: 0 },
    { key: 'price', title: 'Price', align: 'decimal' },
    { key: 'about', title: 'About', minWidth: 12 },
  ],
});
table.row({ name: 'Widget', price: '4.5', about: 'A small part that does one thing well.' });
table.row({ name: 'Gadget', price: '120', about: 'Bigger.' });
table.footer([{ content: 'Prices exclude tax', colSpan: 3, align: 'right' }]);

console.log(renderText(table));
```

```
╭────────┬───────┬─────────────────────────╮
│ Name   │ Price │ About                   │
├────────┼───────┼─────────────────────────┤
│ Widget │   4.5 │ A small part that does  │
│        │       │ one thing well.         │
│ Gadget │ 120   │ Bigger.                 │
├────────┴───────┴─────────────────────────┤
│                       Prices exclude tax │
╰──────────────────────────────────────────╯
```

### Rows, spans, headers and footers

A row is an array of cells or, when the columns have keys, an object. A
cell is a plain value or `{ content, colSpan, rowSpan, align, valign,
style }`. `header()` adds a header row (several are allowed; without one
the column titles are used), `footer()` a footer row, and `group(title)`
starts a titled group of body rows.

```js
import { Table, renderText } from 'tablefmt';

const table = new Table({ border: 'ascii', rowSeparators: true })
  .header([{ content: 'Build matrix', colSpan: 3, align: 'center' }])
  .header(['OS', 'Node 22', 'Node 24'])
  .row([{ content: 'Linux', rowSpan: 2, valign: 'middle' }, 'pass', 'pass'])
  .row([{ content: 'flaky: 1 retry', colSpan: 2 }])
  .row(['macOS', 'pass', 'fail']);

console.log(renderText(table));
```

```
+---------------------------+
|       Build matrix        |
+-------+---------+---------+
| OS    | Node 22 | Node 24 |
+-------+---------+---------+
|       | pass    | pass    |
| Linux +---------+---------+
|       | flaky: 1 retry    |
+-------+---------+---------+
| macOS | pass    | fail    |
+-------+---------+---------+
```

A cell whose content is another `Table` is drawn as a nested table; see
`examples/report.js`. Cell text may contain line breaks, tabs (expanded to
tab stops) and ANSI escape sequences.

### Table options

| Option | Meaning |
| --- | --- |
| `columns` | Column titles or definitions |
| `border` | A style name (`ascii`, `light`, `heavy`, `double`, `rounded`, `markdown`, `none`) or a custom border object; default `light` |
| `padding` | Spaces on each side of a cell (default 1) |
| `maxWidth` | Widest the whole table may be, in terminal columns |
| `expand` | Grow flexible columns to fill `maxWidth` |
| `rowSeparators` | Draw a rule between all rows |
| `zebra` | `true` dims every second body row; a style uses that instead |
| `header` | `false` suppresses the header made from column titles |
| `headerStyle`, `footerStyle` | Styles for header and footer rows (the header is bold by default) |
| `nullText` | Text shown for `null` and `undefined` (default empty) |
| `tabWidth` | Tab stop distance inside cells (default 8) |

Every renderer accepts the same options as a second argument, where they
override the table's own: `renderText(table, { border: 'heavy', maxWidth: 60 })`.

A table that cannot be made narrow enough throws a `LayoutError`.

## Colour and styles

A style is an object with `fg`, `bg` (a colour name, `#rgb`/`#rrggbb` or a
0-255 palette index) and the flags `bold`, `dim`, `italic`, `underline`,
`inverse`, `strikethrough`, or a shorthand string such as `'bold red'`.
Styles can be set on a column, a row (`table.row(cells, { style })`), a
cell, the header, the footer and the zebra rows; the more specific one
wins.

Whether escape sequences are written is decided once per render:

```js
import { Table, renderText } from 'tablefmt';

const table = new Table({
  border: 'none',
  zebra: true,
  columns: ['Check', { key: 'state', title: 'State', style: { fg: 'green' } }],
})
  .row(['lint', 'ok'])
  .row(['tests', { content: 'failed', style: { fg: 'red', bold: true } }]);

renderText(table);                   // colour decided from process.env and process.stdout
renderText(table, { color: true });  // always emit escape sequences
renderText(table, { color: false }); // never
renderText(table, { environment: { env: { NO_COLOR: '1' }, isTTY: true } }); // decide from this instead

console.log(renderText(table, { color: false }));
```

```
Check  State
lint   ok
tests  failed
```

Detection checks, in this order: `NO_COLOR` (any non-empty value) turns
colour off; `FORCE_COLOR` turns it on, or off when it is `0` or `false`;
`TERM=dumb` turns it off; otherwise colour is on only for a terminal. The
`environment` option makes this testable without touching the process.

With colour off, the styles given as options are dropped and escape
sequences inside cell text are removed, so the layout is identical either
way.

## Text helpers

The functions the table renderer is built on are exported too. All of them
understand ANSI SGR sequences and OSC 8 hyperlinks: styles are closed at
the end of each line and reopened on the next, and never counted as width.

```js
import { wrap, truncate, pad, stringWidth, stripAnsi, alignDecimal } from 'tablefmt';

stringWidth('héllo');                 // 5
stringWidth('日本');                   // 4
stringWidth('👨‍👩‍👧');                    // 2
stringWidth('\x1b[31mred\x1b[0m');    // 3

wrap('The quick brown fox jumps over the lazy dog', 16);
// [ 'The quick brown', 'fox jumps over', 'the lazy dog' ]

wrap('\x1b[1mbold text that wraps\x1b[0m', 10);
// [ '\x1b[1mbold text\x1b[0m', '\x1b[1mthat wraps\x1b[0m' ]

truncate('A long sentence that will not fit', 14);
// 'A long senten…'
truncate('/usr/local/share/doc/readme.txt', 16, { position: 'middle' });
// '/usr/loc…dme.txt'

pad('ok', 6, 'center');               // '  ok  '
stripAnsi('\x1b[32mgreen\x1b[0m');    // 'green'
alignDecimal(['1.5', '-22', '3.125']);
// [ '  1.5  ', '-22    ', '  3.125' ]
```

Also exported: `graphemes`, `graphemeWidth`, `codePointWidth`, `hasAnsi`,
`expandTabs`, `createStyler` and `detectColor`.

## Reading data

```js
import { fromObjects, fromCsv, renderText, renderMarkdown } from 'tablefmt';

const people = [
  { name: 'Ada', born: 1815, field: 'mathematics' },
  { name: 'Grace', born: 1906, field: 'computer science' },
];
console.log(renderText(fromObjects(people)));
console.log(renderMarkdown(fromCsv('item,qty\nnuts,40\nbolts,125\n')));
```

```
┌───────┬──────┬──────────────────┐
│ name  │ born │ field            │
├───────┼──────┼──────────────────┤
│ Ada   │ 1815 │ mathematics      │
│ Grace │ 1906 │ computer science │
└───────┴──────┴──────────────────┘
| item  | qty |
| ----- | --: |
| nuts  |  40 |
| bolts | 125 |
```

| Function | Input |
| --- | --- |
| `fromObjects(records, options)` | An array of objects; columns are the union of the keys in first-seen order |
| `fromArrays(rows, options)` | An array of arrays; the first row holds the titles unless `headerRow: false` |
| `fromCsv(text, options)` | CSV text (RFC 4180 quoting, any single-character `delimiter`, `headerRow`) |
| `fromJson(text, options)` | A JSON array of objects, array of arrays, or a single object |
| `fromNdjson(text, options)` | One JSON value per line; blank lines are skipped |
| `fromRecordSet(set, options)` | A `{ keys, records }` pair as returned by `readRecords` |

All of them accept the table options. A column whose values are all numbers
(or numeric strings) is right-aligned; pass `columns` to choose, order,
rename or configure columns yourself. Nested objects and arrays are shown
as JSON.

The lower-level pieces are `parseCsv(text, { delimiter, skipEmptyLines })`
(returns arrays of strings), `parseNdjson(text)`, `detectFormat(text)` and
`readRecords(text, format, options)`.

## Sorting, filtering and selecting

These helpers work on plain records, before a table is built:

```js
import { readRecords, filterRecords, sortRecords, selectColumns, fromRecordSet, render } from 'tablefmt';

let set = readRecords('{"host":"a","ms":120}\n{"host":"b","ms":45}\n{"host":"c","ms":300}\n', 'ndjson');
set = { ...set, records: filterRecords(set.records, ['ms >= 100'], set.keys) };
set = { ...set, records: sortRecords(set.records, '-ms', set.keys) };
set = selectColumns(set, ['ms', 'host']);
console.log(render(fromRecordSet(set), 'csv', { newline: '\n' }));
```

```
ms,host
300,c
120,a
```

- `sortRecords(records, spec, keys?)` sorts by one or more keys (`'-ms,host'`
  or an array). The sort is stable, numbers sort numerically and before
  text, text uses natural order (`file2` before `file10`), and empty values
  go last in both directions.
- `filterRecords(records, filters, keys?)` keeps the records that match
  every filter: an expression string, a `{ key, operator, value }` object or
  a predicate function.
- `selectColumns(set, keys)` chooses and reorders the columns of a record
  set.
- Passing `keys` makes unknown column names an `OptionError` with a
  suggestion instead of silently matching nothing.

## Other output formats

```js
import { Table, renderHtml, renderMarkdown, renderCsv } from 'tablefmt';

const table = new Table({ columns: ['Name', { key: 'n', title: 'Count', align: 'right' }] })
  .row(['a|b', 1])
  .row(['<c>', 22]);

console.log(renderMarkdown(table));
console.log(renderCsv(table, { newline: '\n' }));
console.log(renderHtml(table, { caption: 'Counts' }));
```

```
| Name | Count |
| ---- | ----: |
| a\|b |     1 |
| <c>  |    22 |
Name,Count
a|b,1
<c>,22
<table>
  <caption>Counts</caption>
  <thead>
    <tr><th>Name</th><th style="text-align: right">Count</th></tr>
  </thead>
  <tbody>
    <tr><td>a|b</td><td style="text-align: right">1</td></tr>
    <tr><td>&lt;c&gt;</td><td style="text-align: right">22</td></tr>
  </tbody>
</table>
```

- `renderMarkdown(table, { pretty })` writes a pipe table. Pipes are
  escaped and line breaks become `<br>`. Spans are flattened (the text goes
  in the first cell), group titles become bold rows.
- `renderCsv(table, { delimiter, newline, quote })` writes RFC 4180 CSV
  with CRLF line ends by default; `quote: 'all'` quotes every field.
- `renderHtml(table, { caption, className, indent })` writes a `<table>`
  with `thead`, one `tbody` per group, `tfoot`, and real `colspan` and
  `rowspan` attributes. Text is escaped; ANSI sequences are removed.
- `render(table, format, options)` dispatches on `'text'`, `'markdown'`,
  `'csv'` or `'html'`.

## Streaming

`createStream` prints rows as they are written instead of collecting them
first. Because nothing is known about later rows, the column widths are
fixed up front from `width` (or `minWidth`, or the title).

```js
import { createStream } from 'tablefmt';

const stream = createStream({
  columns: [
    { key: 'n', title: '#', width: 3, align: 'right' },
    { key: 'file', title: 'File', width: 14 },
  ],
});
stream.write([1, 'index.js']);
stream.write({ n: 2, file: 'render/text.js' });
stream.end();
```

```
┌─────┬────────────────┐
│   # │ File           │
├─────┼────────────────┤
│   1 │ index.js       │
│   2 │ render/text.js │
└─────┴────────────────┘
```

Output goes to `process.stdout` unless an `output` object with a `write`
method is given. Spans are not available in a stream.

## Errors

Every error thrown on purpose extends `TablefmtError` and has a stable
`code`:

| Class | `code` | Thrown when |
| --- | --- | --- |
| `OptionError` | `ERR_OPTION` | An option has the wrong type or value, or is unknown; `error.option` names it |
| `ParseError` | `ERR_PARSE` | CSV, JSON, NDJSON or a filter expression is malformed; `error.line` and `error.column` are set when known |
| `LayoutError` | `ERR_LAYOUT` | Spans overlap or run out of the table, or the table cannot fit `maxWidth` |
| `UsageError` | `ERR_USAGE` | The command line is wrong (thrown by the CLI's argument parser) |

```js
import { Table, renderText, fromCsv } from 'tablefmt';

for (const attempt of [
  () => new Table({ boder: 'ascii' }),
  () => new Table({ columns: [{ key: 'a', align: 'middle' }] }),
  () => fromCsv('a,b\n1,"oops\n'),
  () => renderText(new Table({ maxWidth: 5 }).row(['a', 'b', 'c'])),
]) {
  try {
    attempt();
  } catch (error) {
    console.log(`${error.name} [${error.code}] ${error.message}`);
  }
}
```

```
OptionError [ERR_OPTION] Invalid option "boder": unknown option (did you mean "border"?)
OptionError [ERR_OPTION] Invalid option "columns[0].align": expected one of left, right, center, decimal, got "middle"
ParseError [ERR_PARSE] Unterminated quoted field (line 2, column 3)
LayoutError [ERR_LAYOUT] Table needs at least 13 columns of width but maxWidth is 5
```

## Project layout

```
bin/tablefmt.js        command entry point
src/index.js           public API
src/errors.js          error classes
src/validate.js        option checks and "did you mean" suggestions
src/width.js           display width of graphemes
src/ansi.js            escape-sequence tokenizer, SGR and hyperlink state
src/cells.js           text <-> styled cells
src/text.js            wrap, truncate, pad
src/decimal.js         decimal-point alignment
src/style.js           style descriptions, colour detection
src/borders.js         border styles and junction lookup
src/columns.js         column definitions
src/table.js           the Table model
src/grid.js            span placement
src/layout.js          width allocation
src/render/            text, Markdown, CSV and HTML renderers
src/input/             CSV and NDJSON parsers, record sets, adapters
src/transform.js       sort, filter, select
src/stream.js          incremental rendering
src/cli.js             argument parsing and the command itself
examples/              runnable examples
test/                  node:test suites and fixtures
```

## Tests

```sh
npm test
```

runs every `test/*.test.js` file with the built-in Node.js test runner; no
packages need to be installed. To run one file:

```sh
node --test test/render-text.test.js
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for how the code is organised and
what a change should include.

## Limitations

Things this version does not do, so that nobody has to find out the hard
way:

- **Shrinking is proportional.** When a table has to be narrower than its
  content, every flexible column gives up width in proportion to how far it
  is above its minimum. A short column next to a long one can therefore be
  cut below its longest word. Pin such columns with `flex: 0`, `width` or
  `minWidth`.
- **Word wrapping breaks at spaces only.** There are no break opportunities
  after hyphens or between CJK characters; a word that is too long is split
  at the column edge.
- **A column narrower than a wide character overflows.** A two-column
  character in a one-column cell is not replaced or clipped, and the border
  of that row shifts.
- **East Asian ambiguous-width characters count as one column**, and there
  is no option to change that.
- **Only SGR styling and OSC 8 hyperlinks survive inside cells.** Other
  escape sequences are removed, and the less common SGR attributes
  (alternative fonts, framed, superscript and the like) are dropped.
- **Colours are not downgraded.** A `#rrggbb` colour is written as a
  24-bit sequence whatever the terminal supports.
- **Column formatters apply to body cells only**, not to footers.
- **Markdown output escapes only pipes and line breaks.** Other Markdown
  or HTML syntax in cell text is passed through. **CSV output does not
  guard against spreadsheet formulas.**
- **HTML output carries alignment only**: no vertical alignment and no
  conversion of styles to CSS.
- **Streams need widths.** A stream column without `width` or `minWidth` is
  only as wide as its title. Spans are rejected.
- **The command reads one input at a time, fully into memory**, and has no
  option to limit the number of rows. A JSON array of arrays is read as
  data rows without a header row.
- **Format detection is shallow.** Text that starts with `[` or `{` is
  always taken for JSON or NDJSON, so CSV that begins that way needs
  `--input csv`.

## License

MIT, see [LICENSE](LICENSE).
