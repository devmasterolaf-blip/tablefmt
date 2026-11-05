# Contributing to tablefmt

Thanks for taking the time to improve tablefmt. This file explains how the
code is organised, how to run the checks and what a change should contain.

## Setup

You need Node.js 22 or newer and nothing else. The project has no runtime
or development dependencies, so there is no install step:

```sh
git clone <repository-url> tablefmt
cd tablefmt
npm test
```

## Running the tests

```sh
npm test                               # everything
node --test test/text.test.js          # one file
node --test --test-name-pattern=wrap   # tests whose name matches
```

The suite uses the built-in `node:test` runner and `node:assert/strict`.
It takes a few seconds. A few tests start the real command
(`bin/tablefmt.js`) or the scripts in `examples/` as child processes.

## How the code fits together

The modules form layers, and a module only imports from the layers below
it:

1. `errors.js`, `validate.js`: error classes and option checks.
2. `width.js`, `ansi.js`: display width of plain text, and the escape
   sequence tokenizer with SGR and hyperlink state.
3. `cells.js`: text is parsed into "styled cells", one per grapheme
   cluster, each carrying its width, SGR state and link. All layout is done
   on arrays of cells, and `serialize` turns them back into a string with
   the smallest set of escape sequences.
4. `text.js`, `decimal.js`, `style.js`: wrapping, truncating, padding,
   decimal alignment, style descriptions and colour detection.
5. `borders.js`, `columns.js`, `table.js`, `grid.js`, `layout.js`: the
   table model, span placement on a grid, and width allocation.
6. `render/`: `prepare.js` resolves a table into columns, a grid and cell
   text once; the four renderers build on it.
7. `input/`, `transform.js`, `stream.js`: parsers, adapters, record
   helpers and incremental output.
8. `cli.js`, `bin/tablefmt.js`: the command.

`src/index.js` is the public API. `test/index.test.js` pins the list of
exported names, so adding or removing an export is always a visible change.

## Conventions

- Plain ES modules with JSDoc types. No TypeScript sources, no build step.
- No dependencies. If something needs a table of Unicode data, keep it
  small and inside the module that uses it.
- Throw one of the typed errors from `errors.js` for anything a caller can
  cause: `OptionError` for bad arguments, `ParseError` for bad input text,
  `LayoutError` for tables that cannot be drawn. Messages name the option
  or the position and say what was expected.
- Validate options at the public entry points with the helpers in
  `validate.js`; unknown option names are errors, with a suggestion.
- Functions that format text must work on cells, not on raw strings, so
  that escape sequences and wide characters are never split.
- Nothing reads `process.env` or `process.stdout` except through an
  `environment` or `io` argument with a default. That keeps every code path
  testable.
- Write escape characters in source as `\x1b` or `\u{...}`; keep invisible
  characters out of string literals.

## What a change should include

- Tests for the new behaviour, next to the tests of the module you
  changed. Bug fixes come with a test that fails without the fix.
- Rendered tables in tests are written out as arrays of lines, so that a
  failure shows the drawn table.
- An entry under "Unreleased" in `CHANGELOG.md` for anything a user can
  notice.
- An update to `README.md` when options, exports, command-line flags or
  the listed limitations change. Code blocks in the README are real output;
  rerun them when they change.
- A new example in `examples/` needs its output recorded in
  `test/fixtures/examples/` (run it with `NO_COLOR=1`).

## Commit messages

Use short conventional subjects such as `feat(render): …`, `fix(cli): …`,
`test: …` or `docs: …`, and explain the why in the body when it is not
obvious. Keep each commit to one change, with the tests passing.

## Reporting bugs

Please include the Node.js version, a small script or command that shows
the problem, the output you got and the output you expected. For layout
problems, mention the terminal and font, since they decide how wide some
characters are drawn.
