# Changelog

## 1.0.5 - 2026-10-25

- Reject skill directories and `SKILL.md` files whose resolved symlink targets escape the repository.
- Add a regression test for an external skill-directory symlink.

## 1.0.4 — 2026-10-21

- Add a dependency-free `scripts/validate.mjs` check for VERSION, plugin manifest, skill frontmatter, marketplace entry, README install pin, CHANGELOG entry, and full MIT license text.
- Add 7 Node.js tests for the validator, including version drift, missing or escaping skill paths, invalid JSON, and truncated licenses.
- Add CI on Ubuntu and Windows (Node.js 22) for pushes, tags, and pull requests, using `node --test` auto-discovery so it works on Node.js 20 and 22.
- Pin the marketplace installation instructions to v1.0.4.

## 1.0.3 — 2026-10-15

- Restrict the plugin's declared capability to Read, matching its inspection-only repository tour workflow.
- Align the README, plugin manifest, and VERSION with the 1.0.3 release.

## 1.0.2 — 2026-10-13

- Pin the documented marketplace install to the matching release tag.
- Correct marketplace listing guidance and add a copyable example prompt.

## 1.0.1 — 2026-10-09

- Complete the standard MIT license text so GitHub can identify the license.
- Add version and release history metadata.
