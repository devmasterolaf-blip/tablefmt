# Changelog

All notable changes to this project are recorded in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] - 2026-11-05

First version.

### Added

- Display width of text by grapheme cluster: East Asian wide and fullwidth
  characters, emoji (modifiers, ZWJ sequences, flags, variation selectors),
  combining marks and zero-width characters.
- ANSI awareness: an escape-sequence tokenizer, SGR state tracking and
  OSC 8 hyperlinks, so that styled text can be measured, wrapped, truncated
  and padded without breaking sequences.
- Text helpers: `wrap` (word and hard modes), `truncate` (start, middle,
  end), `pad`, `stringWidth`, `stripAnsi`, `expandTabs`, `alignDecimal`.
- A `Table` model with column definitions, header and footer rows, row
  groups, column and row spans, multi-line cells and nested tables.
- Width allocation within `maxWidth`, with fixed, minimum and maximum
  widths, flex weights and `expand`.
- Border styles `ascii`, `light`, `heavy`, `double`, `rounded`,
  `markdown` and `none`, custom border objects, and junctions that follow
  the spans around them.
- Styles per table section, column, row and cell, zebra rows, and colour
  detection from an injectable environment (`NO_COLOR`, `FORCE_COLOR`,
  `TERM`, terminal or not).
- Renderers for bordered text, Markdown pipe tables, RFC 4180 CSV and HTML.
- Input adapters for objects, arrays, CSV, JSON and NDJSON with column
  inference, plus a CSV parser that reports the position of errors.
- `sortRecords`, `filterRecords` and `selectColumns` helpers with a small
  filter expression syntax.
- `createStream` for printing rows incrementally with fixed column widths.
- Typed errors (`OptionError`, `ParseError`, `LayoutError`, `UsageError`)
  with stable codes, and validation of every option with "did you mean"
  suggestions.
- The `tablefmt` command with `--format`, `--input`, `--style`,
  `--columns`, `--sort`, `--filter`, `--max-width`, `--delimiter`,
  `--no-header`, `--zebra`, `--row-separators` and `--color`/`--no-color`,
  and exit codes 0, 1 and 2.
- Runnable examples in `examples/`.

### Fixed

- The command no longer prints a stack trace when the program reading its
  output (for example `head`) closes the pipe early.
