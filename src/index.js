/**
 * tablefmt: terminal tables and text layout.
 *
 * This module is the public API. Anything not exported here is internal
 * and may change between releases.
 * @module tablefmt
 */

export const VERSION = '0.1.0';

export { TablefmtError, OptionError, ParseError, LayoutError, UsageError } from './errors.js';

// Measuring and text layout.
export { graphemes, graphemeWidth, codePointWidth } from './width.js';
export { stripAnsi, hasAnsi } from './ansi.js';
export { stringWidth, expandTabs } from './cells.js';
export { wrap, truncate, pad } from './text.js';
export { alignDecimal } from './decimal.js';
export { createStyler, detectColor } from './style.js';

// Tables.
export { Table } from './table.js';
export { BORDERS, BORDER_NAMES } from './borders.js';
export { render, renderText, renderMarkdown, renderCsv, renderHtml, OUTPUT_FORMATS } from './render/index.js';
export { TableStream, createStream } from './stream.js';

// Input and data helpers.
export { parseCsv } from './input/csv.js';
export { parseNdjson } from './input/ndjson.js';
export { readRecords, detectFormat, INPUT_FORMATS } from './input/records.js';
export { fromObjects, fromArrays, fromCsv, fromJson, fromNdjson, fromRecordSet, inferColumns } from './input/adapters.js';
export {
  sortRecords,
  filterRecords,
  selectColumns,
  parseSort,
  parseFilter,
  compareValues,
} from './transform.js';
