import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, parseArgs, HELP, EXIT } from '../src/cli.js';
import { UsageError } from '../src/errors.js';
import { VERSION } from '../src/index.js';

const fixture = (name) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
const bin = fileURLToPath(new URL('../bin/tablefmt.js', import.meta.url));

/**
 * Run the command in-process with captured streams.
 * @param {string[]} argv
 * @param {{stdin?: string, stdinTTY?: boolean, isTTY?: boolean, columns?: number, env?: Record<string, string>}} [io]
 */
async function run(argv, io = {}) {
  let out = '';
  let err = '';
  const stdin = {
    isTTY: io.stdinTTY ?? false,
    async *[Symbol.asyncIterator]() {
      if (io.stdin !== undefined) yield Buffer.from(io.stdin);
    },
  };
  const code = await main(argv, {
    stdin,
    stdout: { write: (chunk) => (out += chunk), isTTY: io.isTTY ?? false, columns: io.columns },
    stderr: { write: (chunk) => (err += chunk) },
    env: io.env ?? {},
  });
  return { code, out, err };
}

test('parseArgs handles long, short, attached and repeated options', () => {
  assert.deepEqual(parseArgs(['-f', 'csv', '--style=ascii', '-w40', 'data.csv']), {
    flags: { format: 'csv', style: 'ascii', 'max-width': '40' },
    files: ['data.csv'],
  });
  assert.deepEqual(parseArgs(['--filter', 'a=1', '--filter=b>2', '--zebra']).flags, {
    filter: ['a=1', 'b>2'],
    zebra: true,
  });
  assert.deepEqual(parseArgs(['-', '--', '--odd-name.csv']).files, ['-', '--odd-name.csv']);
  assert.deepEqual(parseArgs(['--sort', '-qty']).flags, { sort: '-qty' }, 'a value may start with a dash');
});

test('parseArgs rejects unknown options and missing values', () => {
  assert.throws(() => parseArgs(['--fromat', 'csv']), (error) => error instanceof UsageError && /unknown option --fromat \(did you mean --format\?\)/.test(error.message));
  assert.throws(() => parseArgs(['-x']), /unknown option -x/);
  assert.throws(() => parseArgs(['--sort']), /option --sort needs a value/);
  assert.throws(() => parseArgs(['--zebra=yes']), /does not take a value/);
});

test('prints a CSV file as a table', async () => {
  const { code, out, err } = await run([fixture('fruit.csv')]);
  assert.equal(code, EXIT.ok);
  assert.equal(err, '');
  assert.deepEqual(out.split('\n'), [
    '┌────────┬─────┬───────┬──────────────┐',
    '│ name   │ qty │ price │ note         │',
    '├────────┼─────┼───────┼──────────────┤',
    '│ apple  │   3 │  1.25 │ crisp, sweet │',
    '│ kiwi   │  12 │  0.50 │              │',
    '│ banana │   7 │  0.25 │ ripe         │',
    '│ cherry │ 100 │  4.00 │ in season    │',
    '└────────┴─────┴───────┴──────────────┘',
    '',
  ]);
});

test('filters, sorts, selects and renames columns', async () => {
  const { code, out } = await run([
    fixture('fruit.csv'), '--filter', 'qty >= 7', '--filter', 'name !~ kiwi', '--sort', '-qty', '-c', 'name=Fruit,qty', '-s', 'ascii',
  ]);
  assert.equal(code, 0);
  assert.deepEqual(out.trimEnd().split('\n'), [
    '+--------+-----+',
    '| Fruit  | qty |',
    '+--------+-----+',
    '| cherry | 100 |',
    '| banana |   7 |',
    '+--------+-----+',
  ]);
});

test('reads JSON and NDJSON by extension and writes other formats', async () => {
  const markdown = await run([fixture('fruit.json'), '-f', 'markdown']);
  assert.deepEqual(markdown.out.trimEnd().split('\n'), [
    '| name  | qty | tags            | origin |',
    '| ----- | --: | --------------- | ------ |',
    '| apple |   3 | ["red","green"] |        |',
    '| kiwi  |  12 |                 | NZ     |',
  ]);
  const csv = await run([fixture('log.ndjson'), '--format=csv', '--filter', 'ms > 10']);
  assert.equal(csv.out, 'level,msg,ms\ninfo,started,12\nwarn,slow request,950\n');
  const html = await run([fixture('log.ndjson'), '-f', 'html', '-c', 'msg']);
  assert.ok(html.out.startsWith('<table>\n  <thead>\n    <tr><th>msg</th></tr>'));
  assert.ok(html.out.endsWith('</table>\n'));
});

test('reads standard input and sniffs its format', async () => {
  const csv = await run(['-s', 'none'], { stdin: 'a,b\n1,x\n' });
  assert.equal(csv.out, 'a  b\n1  x\n');
  const json = await run(['-', '-s', 'none'], { stdin: '[{"a":1,"b":"x"}]' });
  assert.equal(json.out, 'a  b\n1  x\n');
  const ndjson = await run(['-s', 'none'], { stdin: '{"a":1}\n{"a":22}\n' });
  assert.equal(ndjson.out, ' a\n 1\n22\n');
  const forced = await run(['-i', 'csv', '-s', 'none'], { stdin: '[x],y\n1,2\n' });
  assert.equal(forced.out, '[x]  y\n  1  2\n');
});

test('tab-separated files and explicit delimiters', async () => {
  const tsv = await run([fixture('cities.tsv'), '-s', 'none']);
  assert.equal(tsv.out, 'city       pop\nOslo    709000\nBergen  289000\n');
  const semi = await run(['-d', ';', '-s', 'none'], { stdin: 'a;b\n1;2\n' });
  assert.equal(semi.out, 'a  b\n1  2\n');
  const tab = await run(['-d', 'tab', '-s', 'none'], { stdin: 'a\tb\n1\t2\n' });
  assert.equal(tab.out, 'a  b\n1  2\n');
  const wrong = await run(['-d', ';', fixture('fruit.json')]);
  assert.equal(wrong.code, EXIT.usage);
  assert.match(wrong.err, /--delimiter only applies to CSV input, but the input is json/);
});

test('--no-header treats the first record as data', async () => {
  const { out } = await run(['--no-header', '-s', 'ascii'], { stdin: 'apple,3\nkiwi,12\n' });
  assert.deepEqual(out.trimEnd().split('\n'), ['+-------+----+', '| apple |  3 |', '| kiwi  | 12 |', '+-------+----+']);
});

test('--max-width wraps and reports tables that cannot fit', async () => {
  const fit = await run([fixture('fruit.csv'), '-c', 'name,note', '-w', '21']);
  assert.equal(fit.code, 0);
  assert.ok(fit.out.trimEnd().split('\n').every((line) => [...line].length <= 21));
  const narrow = await run([fixture('fruit.csv'), '-w', '10']);
  assert.equal(narrow.code, EXIT.failure);
  assert.equal(narrow.err, 'tablefmt: Table needs at least 17 columns of width but maxWidth is 10\n');
  assert.equal(narrow.out, '');
  const bad = await run([fixture('fruit.csv'), '-w', 'wide']);
  assert.equal(bad.code, EXIT.usage);
  assert.match(bad.err, /invalid --max-width "wide"/);
});

test('the terminal width is used on a terminal, and ignored when too small', async () => {
  const wide = await run([fixture('fruit.csv'), '-c', 'name,note', '--no-color'], { isTTY: true, columns: 21 });
  assert.ok(wide.out.trimEnd().split('\n').every((line) => [...line].length <= 21));
  const tiny = await run([fixture('fruit.csv'), '-c', 'name,note', '--no-color'], { isTTY: true, columns: 4 });
  assert.equal(tiny.code, 0);
  assert.ok(tiny.out.includes('│ apple  │ crisp, sweet │'));
  const piped = await run([fixture('fruit.csv'), '-c', 'name,note'], { isTTY: false, columns: 21 });
  assert.ok(piped.out.includes('│ apple  │ crisp, sweet │'));
});

test('colour follows the terminal, the environment and the flags', async () => {
  const args = ['-s', 'none'];
  const stdin = 'a\n1\n2\n';
  assert.equal((await run(args, { stdin })).out, 'a\n1\n2\n');
  assert.equal((await run(args, { stdin, isTTY: true })).out, '\x1b[1ma\x1b[0m\n1\n2\n');
  assert.equal((await run(args, { stdin, isTTY: true, env: { NO_COLOR: '1' } })).out, 'a\n1\n2\n');
  assert.equal((await run([...args, '--no-color'], { stdin, isTTY: true })).out, 'a\n1\n2\n');
  assert.equal((await run([...args, '--color', '--zebra'], { stdin })).out, '\x1b[1ma\x1b[0m\n1\n\x1b[2m2\x1b[0m\n');
  const both = await run([...args, '--color', '--no-color'], { stdin });
  assert.equal(both.code, EXIT.usage);
});

test('--row-separators draws a rule between rows', async () => {
  const { out } = await run(['--row-separators', '-s', 'ascii'], { stdin: 'a\n1\n2\n' });
  assert.equal(out, '+---+\n| a |\n+---+\n| 1 |\n+---+\n| 2 |\n+---+\n');
});

test('--help and --version', async () => {
  const help = await run(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, HELP);
  for (const flag of ['--format', '--input', '--style', '--columns', '--sort', '--filter', '--max-width', '--delimiter', '--no-header', '--zebra', '--row-separators', '--no-color', '--version']) {
    assert.ok(HELP.includes(flag), `help mentions ${flag}`);
  }
  assert.equal((await run(['-V'])).out, `${VERSION}\n`);
});

test('usage errors exit with 2 and point to --help', async () => {
  const cases = [
    [['--fromat', 'csv'], /unknown option --fromat \(did you mean --format\?\)/],
    [['-f', 'pdf'], /invalid --format "pdf"; expected one of: text, markdown, csv, html/],
    [['-s', 'rouded'], /invalid --style "rouded" \(did you mean "rounded"\?\)/],
    [['-i', 'xml'], /invalid --input "xml"/],
    [['a.csv', 'b.csv'], /expected one input file, got 2/],
  ];
  for (const [argv, pattern] of cases) {
    const { code, out, err } = await run(argv, { stdin: 'a\n1\n' });
    assert.equal(code, EXIT.usage, argv.join(' '));
    assert.equal(out, '');
    assert.match(err, pattern);
    assert.ok(err.endsWith('Try "tablefmt --help" for more information.\n'));
  }
  const noInput = await run([], { stdinTTY: true });
  assert.equal(noInput.code, EXIT.usage);
  assert.match(noInput.err, /no input/);
});

test('unknown columns and bad filters are usage errors', async () => {
  const sort = await run([fixture('fruit.csv'), '--sort', 'nmae']);
  assert.equal(sort.code, EXIT.usage);
  assert.equal(sort.err, 'tablefmt: Invalid option "sort": unknown column "nmae" (did you mean "name"?); available: name, qty, price, note\n');
  const columns = await run([fixture('fruit.csv'), '-c', 'name,cost']);
  assert.equal(columns.code, EXIT.usage);
  assert.match(columns.err, /unknown column "cost"/);
  const filter = await run([fixture('fruit.csv'), '--filter', 'qty']);
  assert.equal(filter.code, EXIT.usage);
  assert.match(filter.err, /Invalid filter "qty"/);
});

test('unreadable files and invalid data exit with 1', async () => {
  const missing = await run([fixture('missing.csv')]);
  assert.equal(missing.code, EXIT.failure);
  assert.match(missing.err, /^tablefmt: cannot read .*missing\.csv: no such file\n$/);
  const directory = await run([fixture('')]);
  assert.equal(directory.code, EXIT.failure);
  assert.match(directory.err, /it is a directory/);
  const csv = await run(['-i', 'csv'], { stdin: 'a,b\n1,"open\n' });
  assert.equal(csv.code, EXIT.failure);
  assert.equal(csv.err, 'tablefmt: Unterminated quoted field (line 2, column 3)\n');
  const ndjson = await run(['-i', 'ndjson'], { stdin: '{"a":1}\n{oops}\n' });
  assert.equal(ndjson.code, EXIT.failure);
  assert.match(ndjson.err, /^tablefmt: Invalid JSON: .* \(line 2\)\n$/);
  const json = await run([], { stdin: '[1, 2]' });
  assert.equal(json.code, EXIT.failure);
  assert.match(json.err, /Expected every record to be an object, but record 1 is 1/);
});

test('empty input prints nothing', async () => {
  const { code, out, err } = await run([], { stdin: '' });
  assert.deepEqual({ code, out, err }, { code: 0, out: '', err: '' });
});

test('the installed command works end to end', () => {
  const ok = spawnSync(process.execPath, [bin, '--sort', 'qty:desc', '-c', 'name,qty', '-s', 'markdown'], {
    input: 'name,qty\napple,3\nkiwi,12\n',
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  assert.equal(ok.status, 0);
  assert.equal(ok.stderr, '');
  assert.equal(ok.stdout, '| name  | qty |\n|-------|-----|\n| kiwi  |  12 |\n| apple |   3 |\n');
  const bad = spawnSync(process.execPath, [bin, fixture('fruit.csv'), '--format', 'yaml'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /invalid --format "yaml"/);
  const missing = spawnSync(process.execPath, [bin, fixture('nope.json')], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
});
