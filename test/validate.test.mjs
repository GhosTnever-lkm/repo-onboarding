import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate, parseFrontmatter } from '../scripts/validate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codes = (r) => r.errors.map((e) => e.code);

function copy() {
  const dir = mkdtempSync(path.join(tmpdir(), 'plugin-'));
  for (const rel of ['VERSION', 'README.md', 'CHANGELOG.md', 'LICENSE', '.codex-plugin', '.agents', 'skills']) {
    cpSync(path.join(root, rel), path.join(dir, rel), { recursive: true });
  }
  return dir;
}
function edit(dir, rel, fn) {
  const file = path.join(dir, rel);
  writeFileSync(file, fn(readFileSync(file, 'utf8')));
}
function withCopy(fn) {
  const dir = copy();
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('this repository passes its own plugin checks', () => {
  const r = validate(root);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});

test('CLI checks its own checkout when run from another directory', () => withCopy((dir) => {
  rmSync(path.join(dir, 'VERSION'));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/validate.mjs')], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`OK: ${root} passed all plugin checks.`));
}));

test('CLI honors an explicit checkout relative to the working directory', () => withCopy((dir) => {
  rmSync(path.join(dir, 'VERSION'));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/validate.mjs'), path.basename(dir)], { cwd: path.dirname(dir), encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes(`in ${dir}`));
  assert.ok(result.stderr.includes('[MISSING_FILE] Missing required file: VERSION'));
}));

test('CLI reports a directory named SKILL.md without a stack trace', () => withCopy((dir) => {
  const skill = path.join(dir, 'skills/repo-tour/SKILL.md');
  rmSync(skill);
  mkdirSync(skill);
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/validate.mjs'), dir], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes('[SKILL_MISSING] Expected a regular file: ./skills/repo-tour/SKILL.md'));
  assert.ok(!result.stderr.includes('EISDIR'), result.stderr);
}));

test('detects manifest version drift', () => withCopy((dir) => {
  edit(dir, 'VERSION', () => '9.9.9\n');
  const c = codes(validate(dir));
  assert.ok(c.includes('VERSION_MISMATCH'));
  assert.ok(c.includes('README_PIN_MISMATCH'));
  assert.ok(c.includes('CHANGELOG_ENTRY'));
}));

test('detects a missing skill directory', () => withCopy((dir) => {
  edit(dir, '.codex-plugin/plugin.json', (t) => { const j = JSON.parse(t); j.skills = ['./skills/does-not-exist']; return JSON.stringify(j); });
  assert.ok(codes(validate(dir)).includes('SKILL_MISSING'));
}));

test('rejects skill paths outside the repository', () => withCopy((dir) => {
  edit(dir, '.codex-plugin/plugin.json', (t) => { const j = JSON.parse(t); j.skills = ['../outside']; return JSON.stringify(j); });
  assert.ok(codes(validate(dir)).includes('SKILL_PATH'));
}));

test('rejects skill directories that resolve through a symlink outside the repository', () => withCopy((dir) => {
  const outside = mkdtempSync(path.join(tmpdir(), 'outside-skill-'));
  try {
    writeFileSync(path.join(outside, 'SKILL.md'), '---\nname: external\ndescription: external fixture\n---\n');
    symlinkSync(outside, path.join(dir, 'skills', 'external'), process.platform === 'win32' ? 'junction' : 'dir');
    edit(dir, '.codex-plugin/plugin.json', (t) => { const j = JSON.parse(t); j.skills = ['./skills/external']; return JSON.stringify(j); });
    const result = validate(dir);
    assert.ok(codes(result).includes('SKILL_PATH'), JSON.stringify(result.errors));
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
}));

test('rejects invalid JSON and missing files without crashing', () => withCopy((dir) => {
  edit(dir, '.agents/plugins/marketplace.json', () => '{ not json');
  assert.ok(codes(validate(dir)).includes('INVALID_JSON'));
  rmSync(path.join(dir, 'LICENSE'));
  assert.ok(codes(validate(dir)).includes('MISSING_FILE'));
}));

test('requires a truncated MIT license to be flagged', () => withCopy((dir) => {
  edit(dir, 'LICENSE', (t) => t.split('THE SOFTWARE IS PROVIDED')[0]);
  assert.ok(codes(validate(dir)).includes('LICENSE_TEXT'));
}));

test('frontmatter parser handles CRLF, BOM, quotes, and missing delimiters', () => {
  assert.deepEqual(parseFrontmatter('\uFEFF---\r\nname: "x"\r\ndescription: y\r\n---\r\nbody'), { name: 'x', description: 'y' });
  assert.equal(parseFrontmatter('name: x\n'), null);
  assert.equal(parseFrontmatter('---\nname: x\n'), null);
});
