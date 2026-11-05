/**
 * Helpers for sorting, filtering and selecting columns of records before
 * they are put in a table.
 * @module transform
 */

import { OptionError, ParseError } from './errors.js';
import { describe, suggest } from './validate.js';
import { splitDecimal } from './decimal.js';

/** @typedef {Record<string, unknown>} DataRecord */
/** @typedef {{key: string, descending: boolean}} SortKey */
/** @typedef {'=' | '!=' | '<' | '<=' | '>' | '>=' | '~' | '!~'} FilterOperator */
/** @typedef {{key: string, operator: FilterOperator, value: string}} Filter */

const collator = new Intl.Collator('en', { numeric: true });

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function isEmpty(value) {
  return value === undefined || value === null || value === '';
}

/**
 * Numeric reading of a value: numbers as they are, numeric strings with
 * thousands separators and a percent sign removed, otherwise undefined.
 * @param {unknown} value
 * @returns {number | undefined}
 */
export function toNumber(value) {
  if (typeof value === 'number') return Number.isNaN(value) ? undefined : value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!/\d/.test(text) || splitDecimal(text) === undefined) return undefined;
  return Number(text.replaceAll(',', '').replace(/%$/, ''));
}

/**
 * Order two values: numbers numerically and before text, text in natural
 * order ("item2" before "item10"), empty values (null, undefined, '') last.
 * @param {unknown} a
 * @param {unknown} b
 * @returns {number} negative, zero or positive
 */
export function compareValues(a, b) {
  const emptyA = isEmpty(a);
  const emptyB = isEmpty(b);
  if (emptyA || emptyB) return Number(emptyA) - Number(emptyB);
  const numberA = toNumber(a);
  const numberB = toNumber(b);
  if (numberA !== undefined && numberB !== undefined) return numberA - numberB;
  if (numberA !== undefined) return -1;
  if (numberB !== undefined) return 1;
  return collator.compare(text(a), text(b));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function text(value) {
  return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
}

/**
 * Check a key against the known keys.
 * @param {string} option name used in the error
 * @param {string} key
 * @param {readonly string[] | undefined} known skip the check when undefined
 */
function checkKey(option, key, known) {
  if (known === undefined || known.includes(key)) return;
  const hint = suggest(key, known);
  throw new OptionError(
    option,
    `unknown column "${key}"${hint ? ` (did you mean "${hint}"?)` : ''}; available: ${known.join(', ') || 'none'}`,
  );
}

/**
 * Parse a sort specification: a comma-separated list (or an array) of
 * keys, each optionally marked descending with a leading `-` or a
 * trailing `:desc` (`:asc` is accepted too).
 * @param {string | readonly string[]} spec
 * @returns {SortKey[]}
 */
export function parseSort(spec) {
  const parts = typeof spec === 'string' ? spec.split(',') : spec;
  if (!Array.isArray(parts) || parts.some((part) => typeof part !== 'string')) {
    throw new OptionError('sort', `expected a string or an array of strings, got ${describe(spec)}`);
  }
  return parts.map((part) => {
    let key = part.trim();
    let descending = false;
    const direction = /:(asc|desc)$/i.exec(key);
    if (direction) {
      descending = direction[1].toLowerCase() === 'desc';
      key = key.slice(0, direction.index).trim();
    } else if (key.startsWith('-')) {
      descending = true;
      key = key.slice(1).trim();
    }
    if (key === '') throw new OptionError('sort', `empty sort key in ${describe(part)}`);
    return { key, descending };
  });
}

/**
 * Sort records by one or more keys. The sort is stable and returns a new
 * array. Empty values stay last in both directions.
 * @template {DataRecord} T
 * @param {readonly T[]} records
 * @param {string | readonly string[]} spec see {@link parseSort}
 * @param {readonly string[]} [keys] known keys; when given, sorting by any
 *   other key is an error
 * @returns {T[]}
 */
export function sortRecords(records, spec, keys) {
  const sortKeys = parseSort(spec);
  for (const { key } of sortKeys) checkKey('sort', key, keys);
  return [...records].sort((a, b) => {
    for (const { key, descending } of sortKeys) {
      const emptyA = isEmpty(a[key]);
      const emptyB = isEmpty(b[key]);
      if (emptyA || emptyB) {
        if (emptyA !== emptyB) return Number(emptyA) - Number(emptyB);
        continue;
      }
      const order = compareValues(a[key], b[key]);
      if (order !== 0) return descending ? -order : order;
    }
    return 0;
  });
}

const FILTER = /^\s*(.+?)\s*(<=|>=|!=|!~|=|<|>|~)\s*(.*?)\s*$/s;

/**
 * Parse a filter expression such as `qty >= 10`, `name ~ app` or
 * `status != "on hold"`. The value may be wrapped in double quotes to keep
 * surrounding spaces.
 * @param {string} expression
 * @returns {Filter}
 * @throws {ParseError} when there is no operator or no key
 */
export function parseFilter(expression) {
  const match = typeof expression === 'string' ? FILTER.exec(expression) : null;
  if (!match) {
    throw new ParseError(
      `Invalid filter ${describe(expression)}: expected "<column> <operator> <value>" with one of = != < <= > >= ~ !~`,
      { format: 'filter' },
    );
  }
  let value = match[3];
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return { key: match[1], operator: /** @type {FilterOperator} */ (match[2]), value };
}

/**
 * Test one record against a filter.
 * @param {DataRecord} record
 * @param {Filter} filter
 * @returns {boolean}
 */
export function matchesFilter(record, filter) {
  const actual = record[filter.key];
  const { operator, value } = filter;
  if (operator === '~' || operator === '!~') {
    const found = !isEmpty(actual) && text(actual).toLowerCase().includes(value.toLowerCase());
    return operator === '~' ? found || value === '' : !found && value !== '';
  }
  if (operator === '=' || operator === '!=') {
    const a = toNumber(actual);
    const b = toNumber(value);
    const equal =
      a !== undefined && b !== undefined ? a === b : isEmpty(actual) ? value === '' : text(actual) === value;
    return operator === '=' ? equal : !equal;
  }
  // Ordering comparisons never match an empty value.
  if (isEmpty(actual) || value === '') return false;
  const order = compareValues(actual, value);
  if (operator === '<') return order < 0;
  if (operator === '<=') return order <= 0;
  if (operator === '>') return order > 0;
  return order >= 0;
}

/**
 * Keep the records that match every filter.
 * @template {DataRecord} T
 * @param {readonly T[]} records
 * @param {string | Filter | ((record: T) => unknown) | readonly (string | Filter | ((record: T) => unknown))[]} filters
 *   filter expressions, parsed filters or predicate functions
 * @param {readonly string[]} [keys] known keys; when given, filtering on
 *   any other key is an error
 * @returns {T[]}
 */
export function filterRecords(records, filters, keys) {
  const list = Array.isArray(filters) ? filters : [filters];
  const tests = list.map((entry) => {
    if (typeof entry === 'function') return entry;
    const filter = typeof entry === 'string' ? parseFilter(entry) : entry;
    if (filter === null || typeof filter !== 'object' || typeof filter.key !== 'string') {
      throw new OptionError('filter', `expected an expression, a filter or a function, got ${describe(entry)}`);
    }
    checkKey('filter', filter.key, keys);
    return (/** @type {T} */ record) => matchesFilter(record, filter);
  });
  return records.filter((record) => tests.every((test) => test(record)));
}

/**
 * Narrow a record set to the given keys, in the given order. Records are
 * not copied; only the key list changes.
 * @param {import('./input/records.js').RecordSet} set
 * @param {string | readonly string[]} keys comma-separated or as an array
 * @returns {import('./input/records.js').RecordSet}
 * @throws {OptionError} for a key that is not in the set, or a repeated key
 */
export function selectColumns(set, keys) {
  const wanted = (typeof keys === 'string' ? keys.split(',') : keys).map((key) => String(key).trim());
  const seen = new Set();
  for (const key of wanted) {
    if (key === '') throw new OptionError('columns', 'empty column name');
    checkKey('columns', key, set.keys);
    if (seen.has(key)) throw new OptionError('columns', `column "${key}" is listed twice`);
    seen.add(key);
  }
  return { keys: wanted, records: set.records };
}
