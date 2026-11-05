/**
 * Typed errors thrown by tablefmt.
 *
 * Every error carries a stable machine-readable `code` so callers can branch
 * on the kind of failure without matching message text.
 * @module errors
 */

/** Base class for all errors raised by this library. */
export class TablefmtError extends Error {
  /**
   * @param {string} message
   * @param {string} [code]
   */
  constructor(message, code = 'ERR_TABLEFMT') {
    super(message);
    this.name = new.target.name;
    /** @type {string} */
    this.code = code;
  }
}

/** An option or argument has the wrong type or an unsupported value. */
export class OptionError extends TablefmtError {
  /**
   * @param {string} option name of the offending option, e.g. `columns[2].width`
   * @param {string} message description of what is wrong
   */
  constructor(option, message) {
    super(`Invalid option "${option}": ${message}`, 'ERR_OPTION');
    /** @type {string} */
    this.option = option;
  }
}

/** Input text (CSV, JSON, NDJSON, filter expression) could not be parsed. */
export class ParseError extends TablefmtError {
  /**
   * @param {string} message
   * @param {{line?: number, column?: number, format?: string}} [where]
   */
  constructor(message, where = {}) {
    const at = where.line === undefined
      ? ''
      : ` (line ${where.line}${where.column === undefined ? '' : `, column ${where.column}`})`;
    super(`${message}${at}`, 'ERR_PARSE');
    /** @type {number | undefined} 1-based line of the problem */
    this.line = where.line;
    /** @type {number | undefined} 1-based column of the problem */
    this.column = where.column;
    /** @type {string | undefined} input format being parsed */
    this.format = where.format;
  }
}

/** The table structure is inconsistent or cannot be laid out. */
export class LayoutError extends TablefmtError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'ERR_LAYOUT');
  }
}

/** The command line was used incorrectly. */
export class UsageError extends TablefmtError {
  /** @param {string} message */
  constructor(message) {
    super(message, 'ERR_USAGE');
  }
}
