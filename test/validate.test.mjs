import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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

test('rejects an external SKILL.md symlink even when its directory is local', (t) => withCopy((dir) => {
  const outside = mkdtempSync(`${dir}-outside-`);
  try {
    const skill = path.join(dir, 'skills', 'repo-tour', 'SKILL.md');
    const target = path.join(outside, 'SKILL.md');
    cpSync(skill, target);
    rmSync(skill);
    try {
      symlinkSync(target, skill, 'file');
    } catch (err) {
      if (process.platform === 'win32' && err.code === 'EPERM') {
        t.skip('File symlinks require Windows developer mode or elevated privileges');
        return;
      }
      throw err;
    }
    const result = validate(dir);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), ['SKILL_PATH']);
    assert.match(result.errors[0].message, /Skill file resolves outside the repository/);
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
}));

for (const [label, contents, expected] of [
  ['missing document', null, 'SKILL_MISSING'],
  ['missing frontmatter', 'name: repo-tour\ndescription: A tour\n', 'SKILL_FRONTMATTER'],
  ['empty description', '---\nname: repo-tour\ndescription: ""\n---\n', 'SKILL_FIELD'],
  ['missing name', '---\ndescription: A tour\n---\n', 'SKILL_FIELD'],
  ['wrong name', '---\nname: other-skill\ndescription: A tour\n---\n', 'SKILL_NAME_MISMATCH'],
]) {
  test(`rejects skill metadata: ${label}`, () => withCopy((dir) => {
    const rel = 'skills/repo-tour/SKILL.md';
    if (contents === null) rmSync(path.join(dir, rel));
    else edit(dir, rel, () => contents);
    const result = validate(dir);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), [expected]);
  }));
}

for (const [label, change, expected] of [
  ['unregistered plugin', (j) => { j.plugins[0].name = 'other-plugin'; }, 'MARKETPLACE_ENTRY'],
  ['duplicate registration', (j) => { j.plugins.push(j.plugins[0]); }, 'MARKETPLACE_ENTRY'],
  ['missing plugin list', (j) => { delete j.plugins; }, 'MARKETPLACE_ENTRY'],
  ['missing source', (j) => { delete j.plugins[0].source; }, 'MARKETPLACE_SOURCE'],
  ['nested source', (j) => { j.plugins[0].source.path = './skills'; }, 'MARKETPLACE_SOURCE'],
  ['parent source', (j) => { j.plugins[0].source.path = '../'; }, 'MARKETPLACE_SOURCE'],
]) {
  test(`rejects marketplace configuration: ${label}`, () => withCopy((dir) => {
    edit(dir, '.agents/plugins/marketplace.json', (text) => {
      const market = JSON.parse(text);
      change(market);
      return JSON.stringify(market);
    });
    const result = validate(dir);
    assert.equal(result.ok, false);
    assert.deepEqual(codes(result), [expected]);
  }));
}

test('CLI validates an explicit repository root and defaults to the working directory', () => withCopy((dir) => {
  const script = path.join(root, 'scripts', 'validate.mjs');
  for (const args of [[script, dir], [script]]) {
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.equal(result.stdout, `OK: ${dir} passed all plugin checks.\n`);
  }
}));

test('CLI exits unsuccessfully and prints every validation diagnostic to stderr', () => withCopy((dir) => {
  edit(dir, 'VERSION', () => '9.9.9\n');
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'validate.mjs'), dir], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  const expected = validate(dir).errors;
  assert.equal(result.stderr, [
    `FAILED: ${expected.length} problem(s) in ${dir}`,
    ...expected.map((error) => `  [${error.code}] ${error.message}`),
    '',
  ].join('\n'));
}));
