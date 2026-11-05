import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const examples = fileURLToPath(new URL('../examples/', import.meta.url));
const expected = fileURLToPath(new URL('./fixtures/examples/', import.meta.url));

const scripts = readdirSync(examples).filter((name) => name.endsWith('.js')).sort();

test('every example has a recorded output', () => {
  assert.deepEqual(scripts, ['pipeline.js', 'report.js', 'stream.js']);
  assert.deepEqual(readdirSync(expected).sort(), ['pipeline.txt', 'report.txt', 'stream.txt']);
});

for (const script of scripts) {
  test(`examples/${script} runs and prints the recorded output`, () => {
    const result = spawnSync(process.execPath, [examples + script], { encoding: 'utf8' });
    assert.equal(result.stderr, '');
    assert.equal(result.status, 0);
    assert.equal(result.stdout, readFileSync(expected + script.replace(/\.js$/, '.txt'), 'utf8'));
  });
}

test('examples colour their output only when asked to', () => {
  const env = { ...process.env, FORCE_COLOR: '1' };
  delete env.NO_COLOR;
  const result = spawnSync(process.execPath, [examples + 'report.js'], { encoding: 'utf8', env });
  assert.equal(result.status, 0);
  assert.ok(result.stdout.includes('\x1b[1m'), 'the header and the styled cell are bold');
  const plain = readFileSync(expected + 'report.txt', 'utf8');
  assert.equal(result.stdout.replace(/\x1b\[[0-9;]*m/g, ''), plain);
});
