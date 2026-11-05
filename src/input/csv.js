/**
 * CSV parser following RFC 4180, with a few common extensions: any of
 * CRLF, LF or CR ends a record, a byte order mark is ignored, and the
 * delimiter is configurable.
 * @module input/csv
 */

import { ParseError } from '../errors.js';
import { checkOptions } from '../validate.js';
import { checkDelimiter } from '../render/csv.js';

/**
 * @typedef {object} CsvParseOptions
 * @property {string} [delimiter] field separator, one character (default `,`)
 * @property {boolean} [skipEmptyLines] drop records that are completely
 *   empty lines (default true)
 */

/**
 * Parse CSV text into records of string fields.
 *
 * A field that starts with a double quote runs to the matching closing
 * quote and may contain delimiters, line breaks and doubled quotes. A
 * quote inside an unquoted field is kept as an ordinary character.
 * @param {string} text
 * @param {CsvParseOptions} [options]
 * @returns {string[][]}
 * @throws {ParseError} for an unterminated quoted field or text right
 *   after a closing quote
 */
export function parseCsv(text, options) {
  const opts = checkOptions('options', options, ['delimiter', 'skipEmptyLines']);
  const delimiter = checkDelimiter(opts.delimiter ?? ',');
  const skipEmptyLines = opts.skipEmptyLines !== false;
  if (typeof text !== 'string') throw new ParseError('CSV input must be a string', { format: 'csv' });

  /** @type {string[][]} */
  const records = [];
  /** @type {string[]} */
  let record = [];
  let field = '';
  let quoted = false; // whether the current field was written in quotes
  let line = 1;
  let lineStart = 0;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  if (i === 1) lineStart = 1;
  const length = text.length;

  const endRecord = () => {
    const blank = record.length === 0 && field === '' && !quoted;
    if (!blank || !skipEmptyLines) {
      record.push(field);
      records.push(record);
    }
    record = [];
    field = '';
    quoted = false;
  };

  while (i < length) {
    const char = text[i];
    if (char === '"' && field === '' && !quoted) {
      // Quoted field: read up to the closing quote.
      const openLine = line;
      const openColumn = i - lineStart + 1;
      i++;
      for (;;) {
        if (i >= length) {
          throw new ParseError('Unterminated quoted field', { line: openLine, column: openColumn, format: 'csv' });
        }
        const inner = text[i];
        if (inner === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          i++;
          break;
        }
        if (inner === '\n' || (inner === '\r' && text[i + 1] !== '\n')) {
          line++;
          lineStart = i + 1;
        }
        field += inner;
        i++;
      }
      quoted = true;
      const next = text[i];
      if (i < length && next !== delimiter && next !== '\r' && next !== '\n') {
        throw new ParseError(`Unexpected ${JSON.stringify(next)} after a closing quote`, {
          line,
          column: i - lineStart + 1,
          format: 'csv',
        });
      }
    } else if (char === delimiter) {
      record.push(field);
      field = '';
      quoted = false;
      i++;
      // A delimiter at the very end still starts one last, empty field.
      if (i === length) {
        record.push('');
        records.push(record);
        return records;
      }
    } else if (char === '\r' || char === '\n') {
      endRecord();
      i += char === '\r' && text[i + 1] === '\n' ? 2 : 1;
      line++;
      lineStart = i;
    } else {
      field += char;
      i++;
    }
  }
  // Last record without a trailing line break.
  if (record.length > 0 || field !== '' || quoted) endRecord();
  return records;
}
