/**
 * The `tablefmt` command: read CSV, JSON or NDJSON and print a table.
 * @module cli
 */

import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { TablefmtError, UsageError, OptionError, ParseError, LayoutError } from './errors.js';
import { suggest } from './validate.js';
import { BORDER_NAMES } from './borders.js';
import { readRecords, detectFormat, INPUT_FORMATS } from './input/records.js';
import { fromRecordSet } from './input/adapters.js';
import { sortRecords, filterRecords, selectColumns } from './transform.js';
import { render, OUTPUT_FORMATS } from './render/index.js';
import { VERSION } from './index.js';

/**
 * @typedef {object} CliIo the outside world, injectable for tests
 * @property {AsyncIterable<string | Uint8Array> & {isTTY?: boolean}} [stdin]
 * @property {{write: (chunk: string) => unknown, isTTY?: boolean, columns?: number}} [stdout]
 * @property {{write: (chunk: string) => unknown}} [stderr]
 * @property {Record<string, string | undefined>} [env]
 */

/** Exit codes of the command. */
export const EXIT = Object.freeze({ ok: 0, failure: 1, usage: 2 });

export const HELP = `Usage: tablefmt [options] [file]

Read CSV, JSON or NDJSON from a file (or standard input when no file or "-"
is given) and print it as a table.

Options:
  -f, --format <name>     output format: ${OUTPUT_FORMATS.join(', ')} (default: text)
  -i, --input <name>      input format: auto, ${INPUT_FORMATS.join(', ')} (default: auto, from the
                          file extension or the content)
  -s, --style <name>      border style for text output: ${BORDER_NAMES.join(', ')}
                          (default: light)
  -c, --columns <list>    columns to show, in order: name,qty or name=Fruit,qty
      --sort <spec>       sort by columns: qty or -qty,name (leading "-" or
                          trailing ":desc" sorts descending)
      --filter <expr>     keep matching rows, e.g. "qty >= 10" or "name ~ app";
                          operators: = != < <= > >= ~ !~; may be repeated
  -w, --max-width <n>     fit text output into n columns (default: the terminal
                          width when printing to a terminal)
  -d, --delimiter <char>  CSV input delimiter; "tab" or "\\t" for tabs
                          (default: "," or a tab for .tsv files)
      --no-header         the input has no header row; print no header
      --zebra             dim every second row (when colour is on)
      --row-separators    draw a rule between all rows
      --color, --no-color force colour on or off (default: on for terminals,
                          honouring NO_COLOR and FORCE_COLOR)
  -h, --help              show this help
  -V, --version           show the version

Exit codes: 0 success, 1 unreadable or invalid input, 2 invalid usage.
`;

/** @type {{long: string, short?: string, value?: boolean, repeat?: boolean}[]} */
const FLAGS = [
  { long: 'format', short: 'f', value: true },
  { long: 'input', short: 'i', value: true },
  { long: 'style', short: 's', value: true },
  { long: 'columns', short: 'c', value: true },
  { long: 'sort', value: true },
  { long: 'filter', value: true, repeat: true },
  { long: 'max-width', short: 'w', value: true },
  { long: 'delimiter', short: 'd', value: true },
  { long: 'no-header' },
  { long: 'zebra' },
  { long: 'row-separators' },
  { long: 'color' },
  { long: 'no-color' },
  { long: 'help', short: 'h' },
  { long: 'version', short: 'V' },
];

/**
 * Parse command-line arguments.
 * @param {readonly string[]} argv arguments after the program name
 * @returns {{flags: Record<string, any>, files: string[]}} flag values by
 *   long name (`true` for switches, an array for repeatable flags)
 * @throws {UsageError}
 */
export function parseArgs(argv) {
  /** @type {Record<string, any>} */
  const flags = {};
  /** @type {string[]} */
  const files = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      files.push(...argv.slice(i + 1));
      break;
    }
    if (arg === '-' || !arg.startsWith('-')) {
      files.push(arg);
      continue;
    }
    const long = arg.startsWith('--');
    const equals = long ? arg.indexOf('=') : -1;
    const name = long ? arg.slice(2, equals === -1 ? undefined : equals) : arg.slice(1, 2);
    const flag = FLAGS.find((entry) => (long ? entry.long === name : entry.short === name));
    if (!flag) {
      const hint = long ? suggest(name, FLAGS.map((entry) => entry.long)) : undefined;
      throw new UsageError(`unknown option ${long ? `--${name}` : `-${name}`}${hint ? ` (did you mean --${hint}?)` : ''}`);
    }
    /** @type {string | undefined} */
    let attached;
    if (long && equals !== -1) attached = arg.slice(equals + 1);
    else if (!long && arg.length > 2) attached = arg.slice(2);
    if (!flag.value) {
      if (attached !== undefined) throw new UsageError(`option --${flag.long} does not take a value`);
      flags[flag.long] = true;
      continue;
    }
    const value = attached ?? argv[++i];
    if (value === undefined) throw new UsageError(`option --${flag.long} needs a value`);
    if (flag.repeat) (flags[flag.long] ??= []).push(value);
    else flags[flag.long] = value;
  }
  return { flags, files };
}

/**
 * @param {string} flag
 * @param {string} value
 * @param {readonly string[]} allowed
 * @returns {string}
 */
function choice(flag, value, allowed) {
  if (allowed.includes(value)) return value;
  const hint = suggest(value, allowed);
  throw new UsageError(
    `invalid --${flag} "${value}"${hint ? ` (did you mean "${hint}"?)` : ''}; expected one of: ${allowed.join(', ')}`,
  );
}

/**
 * @param {AsyncIterable<string | Uint8Array>} stream
 * @returns {Promise<string>}
 */
async function readAll(stream) {
  const decoder = new TextDecoder();
  let text = '';
  for await (const chunk of stream) {
    text += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Do the work of the command and return the text to print.
 * @param {readonly string[]} argv
 * @param {Required<CliIo>} io
 * @returns {Promise<string>}
 */
async function run(argv, io) {
  const { flags, files } = parseArgs(argv);
  if (flags.help) return HELP;
  if (flags.version) return `${VERSION}\n`;
  if (files.length > 1) throw new UsageError(`expected one input file, got ${files.length}`);
  if (flags.color && flags['no-color']) throw new UsageError('--color and --no-color cannot be combined');

  const format = choice('format', flags.format ?? 'text', OUTPUT_FORMATS);
  const border = choice('style', flags.style ?? 'light', BORDER_NAMES);
  let input = choice('input', flags.input ?? 'auto', ['auto', ...INPUT_FORMATS]);
  /** @type {number | undefined} */
  let maxWidth;
  if (flags['max-width'] !== undefined) {
    if (!/^[1-9]\d*$/.test(flags['max-width'])) {
      throw new UsageError(`invalid --max-width "${flags['max-width']}"; expected a positive whole number`);
    }
    maxWidth = Number(flags['max-width']);
  }

  const file = files[0] ?? '-';
  /** @type {string} */
  let text;
  if (file === '-') {
    if (io.stdin.isTTY) throw new UsageError('no input: give a file or pipe data on standard input');
    text = await readAll(io.stdin);
  } else {
    try {
      text = await readFile(file, 'utf8');
    } catch (error) {
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      const reason = code === 'ENOENT' ? 'no such file' : code === 'EISDIR' ? 'it is a directory' : code ?? String(error);
      throw new TablefmtError(`cannot read ${file}: ${reason}`, 'ERR_READ');
    }
  }

  const extension = extname(file).toLowerCase();
  if (input === 'auto') {
    if (extension === '.csv' || extension === '.tsv') input = 'csv';
    else if (extension === '.json') input = 'json';
    else if (extension === '.ndjson' || extension === '.jsonl') input = 'ndjson';
    else input = detectFormat(text);
  }
  /** @type {import('./input/records.js').ReadOptions} */
  const readOptions = {};
  if (flags['no-header']) readOptions.headerRow = false;
  if (input === 'csv') {
    const delimiter = flags.delimiter ?? (extension === '.tsv' ? '\t' : ',');
    readOptions.delimiter = delimiter === 'tab' || delimiter === '\\t' ? '\t' : delimiter;
  } else if (flags.delimiter !== undefined) {
    throw new UsageError(`--delimiter only applies to CSV input, but the input is ${input}`);
  }

  let set = readRecords(text, /** @type {'csv' | 'json' | 'ndjson'} */ (input), readOptions);
  if (flags.filter) set = { keys: set.keys, records: filterRecords(set.records, flags.filter, set.keys) };
  if (flags.sort) set = { keys: set.keys, records: sortRecords(set.records, flags.sort, set.keys) };
  /** @type {Map<string, string>} */
  const titles = new Map();
  if (flags.columns !== undefined) {
    const keys = String(flags.columns).split(',').map((part) => {
      const equals = part.indexOf('=');
      if (equals === -1) return part;
      titles.set(part.slice(0, equals).trim(), part.slice(equals + 1).trim());
      return part.slice(0, equals);
    });
    set = selectColumns(set, keys);
  }

  const table = fromRecordSet(set, {
    columns: set.keys.map((key) => (titles.has(key) ? { key, title: titles.get(key) } : key)),
    border,
    zebra: Boolean(flags.zebra),
    rowSeparators: Boolean(flags['row-separators']),
    header: !flags['no-header'],
  });
  if (format !== 'text') {
    const output = render(table, /** @type {any} */ (format), format === 'csv' ? { newline: '\n' } : undefined);
    return output === '' ? '' : `${output}\n`;
  }
  /** @type {Record<string, any>} */
  const options = { environment: { env: io.env, isTTY: Boolean(io.stdout.isTTY) } };
  if (flags.color || flags['no-color']) options.color = Boolean(flags.color);
  let output;
  if (maxWidth === undefined && io.stdout.isTTY && Number.isInteger(io.stdout.columns)) {
    // The terminal width is only a wish: fall back to the natural width
    // when the table cannot be squeezed into it.
    try {
      output = render(table, 'text', { ...options, maxWidth: io.stdout.columns });
    } catch (error) {
      if (!(error instanceof LayoutError)) throw error;
      output = render(table, 'text', options);
    }
  } else {
    output = render(table, 'text', maxWidth === undefined ? options : { ...options, maxWidth });
  }
  return output === '' ? '' : `${output}\n`;
}

/**
 * Entry point of the command.
 * @param {readonly string[]} argv arguments after the program name
 * @param {CliIo} [io] streams and environment; defaults to the process's
 * @returns {Promise<number>} the exit code
 */
export async function main(argv, io = {}) {
  const resolved = {
    stdin: io.stdin ?? process.stdin,
    stdout: io.stdout ?? process.stdout,
    stderr: io.stderr ?? process.stderr,
    env: io.env ?? process.env,
  };
  try {
    const output = await run(argv, resolved);
    if (output !== '') resolved.stdout.write(output);
    return EXIT.ok;
  } catch (error) {
    if (!(error instanceof TablefmtError)) {
      resolved.stderr.write(`tablefmt: unexpected error: ${error instanceof Error ? error.stack : String(error)}\n`);
      return EXIT.failure;
    }
    const usage =
      error instanceof UsageError ||
      error instanceof OptionError ||
      (error instanceof ParseError && error.format === 'filter');
    resolved.stderr.write(`tablefmt: ${error.message}\n`);
    if (error instanceof UsageError) resolved.stderr.write('Try "tablefmt --help" for more information.\n');
    return usage ? EXIT.usage : EXIT.failure;
  }
}
