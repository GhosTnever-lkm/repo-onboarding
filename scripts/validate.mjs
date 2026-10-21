#!/usr/bin/env node
// Dependency-free consistency check for a single-plugin Codex repository.
// Node.js >= 20. Usage: node scripts/validate.mjs [repoRoot]
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const REQUIRED = ['VERSION', 'README.md', 'CHANGELOG.md', 'LICENSE', '.codex-plugin/plugin.json', '.agents/plugins/marketplace.json'];

function read(root, rel) {
  return readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '');
}

function json(root, rel, errors) {
  try {
    return JSON.parse(read(root, rel));
  } catch (err) {
    errors.push({ code: 'INVALID_JSON', message: `${rel}: ${err.message}` });
    return null;
  }
}

export function parseFrontmatter(text) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.findIndex((line, i) => i > 0 && /^---[ \t]*$/.test(line));
  if (end === -1) return null;
  const data = {};
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    data[m[1]] = value;
  }
  return data;
}

function inside(root, rel) {
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  return !path.isAbsolute(rel) && r !== '..' && !r.startsWith(`..${path.sep}`) ? abs : null;
}

export function validate(rootArg = process.cwd()) {
  const root = path.resolve(rootArg);
  const errors = [];
  for (const rel of REQUIRED) {
    if (!existsSync(path.join(root, rel))) errors.push({ code: 'MISSING_FILE', message: `Missing required file: ${rel}` });
  }
  if (errors.length) return { root, ok: false, errors };

  const version = read(root, 'VERSION').trim();
  if (!SEMVER.test(version)) errors.push({ code: 'VERSION_FORMAT', message: `VERSION is not semver: ${JSON.stringify(version)}` });

  const manifest = json(root, '.codex-plugin/plugin.json', errors);
  const market = json(root, '.agents/plugins/marketplace.json', errors);
  const name = manifest && typeof manifest.name === 'string' ? manifest.name : null;

  if (manifest) {
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) errors.push({ code: 'PLUGIN_NAME', message: `plugin.json name must be kebab-case, got ${JSON.stringify(manifest.name)}` });
    if (manifest.version !== version) errors.push({ code: 'VERSION_MISMATCH', message: `plugin.json version (${manifest.version}) != VERSION (${version})` });
    if (manifest.license !== 'MIT') errors.push({ code: 'PLUGIN_LICENSE', message: 'plugin.json license must be "MIT" to match LICENSE' });
    const caps = manifest.interface && manifest.interface.capabilities;
    if (!Array.isArray(caps) || caps.length === 0) errors.push({ code: 'PLUGIN_CAPABILITIES', message: 'interface.capabilities must be a non-empty array' });
    if (!Array.isArray(manifest.skills) || manifest.skills.length === 0) {
      errors.push({ code: 'PLUGIN_SKILLS', message: 'plugin.json skills must be a non-empty array' });
    } else {
      for (const rel of manifest.skills) {
        const abs = typeof rel === 'string' && rel ? inside(root, rel) : null;
        if (!abs) { errors.push({ code: 'SKILL_PATH', message: `Skill path must be a relative path inside the repository: ${JSON.stringify(rel)}` }); continue; }
        const skillMd = path.join(abs, 'SKILL.md');
        if (!existsSync(abs) || !statSync(abs).isDirectory() || !existsSync(skillMd)) { errors.push({ code: 'SKILL_MISSING', message: `Skill directory or SKILL.md not found: ${rel}` }); continue; }
        const fm = parseFrontmatter(readFileSync(skillMd, 'utf8'));
        if (!fm) { errors.push({ code: 'SKILL_FRONTMATTER', message: `${rel}/SKILL.md has no valid YAML frontmatter` }); continue; }
        for (const field of ['name', 'description']) {
          if (!fm[field]) errors.push({ code: 'SKILL_FIELD', message: `${rel}/SKILL.md frontmatter is missing ${field}` });
        }
        if (fm.name && fm.name !== path.basename(abs)) errors.push({ code: 'SKILL_NAME_MISMATCH', message: `${rel}/SKILL.md name (${fm.name}) != directory (${path.basename(abs)})` });
      }
    }
  }

  if (market) {
    const entries = Array.isArray(market.plugins) ? market.plugins.filter((p) => p && p.name === name) : [];
    if (entries.length !== 1) errors.push({ code: 'MARKETPLACE_ENTRY', message: `marketplace.json must list plugin "${name}" exactly once (found ${entries.length})` });
    for (const p of entries) {
      const src = p.source && p.source.path;
      if (typeof src !== 'string' || src.replace(/^\.\/?/, '').replace(/\/+$/, '') !== '') errors.push({ code: 'MARKETPLACE_SOURCE', message: `marketplace source.path must be "./", got ${JSON.stringify(src)}` });
    }
  }

  const readme = read(root, 'README.md');
  const pins = [...readme.matchAll(/marketplace add [\w.-]+\/[\w.-]+@v?(\d+\.\d+\.\d+[^\s`]*)/g)].map((m) => m[1]);
  if (pins.length === 0) errors.push({ code: 'README_INSTALL', message: 'README.md has no pinned "codex plugin marketplace add owner/repo@vX.Y.Z" command' });
  for (const pin of pins) if (pin !== version) errors.push({ code: 'README_PIN_MISMATCH', message: `README install pin v${pin} != VERSION ${version}` });

  const changelog = read(root, 'CHANGELOG.md');
  const escaped = version.replace(/[.+]/g, '\\$&');
  if (!new RegExp(`^##\\s+\\[?v?${escaped}\\]?(\\s|$)`, 'm').test(changelog)) errors.push({ code: 'CHANGELOG_ENTRY', message: `CHANGELOG.md has no "## ${version}" section` });

  const license = read(root, 'LICENSE');
  if (!/MIT License/.test(license) || !/LIABILITY/.test(license)) errors.push({ code: 'LICENSE_TEXT', message: 'LICENSE must contain the complete MIT license text' });

  return { root, ok: errors.length === 0, errors };
}

function main() {
  const result = validate(process.argv[2] || process.cwd());
  if (result.ok) { console.log(`OK: ${result.root} passed all plugin checks.`); return 0; }
  console.error(`FAILED: ${result.errors.length} problem(s) in ${result.root}`);
  for (const e of result.errors) console.error(`  [${e.code}] ${e.message}`);
  return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
