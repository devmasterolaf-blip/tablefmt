import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BORDERS, BORDER_NAMES, resolveBorder, junction, UP, RIGHT, DOWN, LEFT } from '../src/borders.js';
import { OptionError } from '../src/errors.js';
import { plainWidth } from '../src/width.js';

test('all built-in styles are listed and frozen', () => {
  assert.deepEqual(BORDER_NAMES, ['ascii', 'light', 'heavy', 'double', 'rounded', 'markdown', 'none']);
  for (const name of BORDER_NAMES) {
    assert.equal(BORDERS[name].name, name);
    assert.ok(Object.isFrozen(BORDERS[name]));
    assert.equal([...BORDERS[name].junctions].length, 9);
  }
});

test('border characters are all one column wide', () => {
  for (const name of BORDER_NAMES) {
    const border = BORDERS[name];
    for (const char of [...border.junctions, border.horizontal, border.vertical]) {
      assert.ok(plainWidth(char) <= 1, `${name}: ${char}`);
    }
  }
});

test('junction picks corners, tees and the cross from the arm mask', () => {
  const light = BORDERS.light;
  assert.equal(junction(light, RIGHT | DOWN), '┌');
  assert.equal(junction(light, RIGHT | DOWN | LEFT), '┬');
  assert.equal(junction(light, DOWN | LEFT), '┐');
  assert.equal(junction(light, UP | RIGHT | DOWN), '├');
  assert.equal(junction(light, UP | RIGHT | DOWN | LEFT), '┼');
  assert.equal(junction(light, UP | DOWN | LEFT), '┤');
  assert.equal(junction(light, UP | RIGHT), '└');
  assert.equal(junction(light, UP | RIGHT | LEFT), '┴');
  assert.equal(junction(light, UP | LEFT), '┘');
});

test('collinear and single arms fall back to line pieces', () => {
  const heavy = BORDERS.heavy;
  assert.equal(junction(heavy, LEFT | RIGHT), '━');
  assert.equal(junction(heavy, UP | DOWN), '┃');
  assert.equal(junction(heavy, LEFT), '━');
  assert.equal(junction(heavy, DOWN), '┃');
  assert.equal(junction(heavy, 0), ' ');
});

test('rounded differs from light only in its corners', () => {
  assert.equal(junction(BORDERS.rounded, RIGHT | DOWN), '╭');
  assert.equal(junction(BORDERS.rounded, UP | LEFT), '╯');
  assert.equal(junction(BORDERS.rounded, UP | RIGHT | DOWN | LEFT), '┼');
});

test('resolveBorder looks up names and rejects unknown ones', () => {
  assert.equal(resolveBorder('double'), BORDERS.double);
  assert.throws(() => resolveBorder('rouded'), /did you mean "rounded"/);
  assert.throws(() => resolveBorder(5), OptionError);
  assert.throws(() => resolveBorder(null), OptionError);
});

test('resolveBorder accepts a custom style object', () => {
  const custom = resolveBorder({ horizontal: '=', vertical: ':', junctions: '*********' });
  assert.equal(custom.name, 'custom');
  assert.equal(custom.rules, 'all');
  assert.equal(custom.edges, true);
  assert.equal(junction(custom, UP | RIGHT), '*');
  assert.throws(() => resolveBorder({ horizontal: '=', vertical: ':', junctions: '***' }), /exactly 9/);
  assert.throws(() => resolveBorder({ horizontal: '=' }), OptionError);
  assert.throws(
    () => resolveBorder({ horizontal: '=', vertical: ':', junctions: '*********', rules: 'some' }),
    /expected one of all, header, none/,
  );
});
