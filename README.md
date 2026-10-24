# Repository Onboarding

> Evidence-based tours for unfamiliar codebases.

Current version: **1.0.5**.

## Install in Codex

Add this repository as a plugin marketplace, then install the plugin:

    codex plugin marketplace add GhosTnever-lkm/repo-onboarding@v1.0.5
    codex plugin add repo-onboarding --marketplace repo-onboarding

To inspect configured marketplaces, run `codex plugin marketplace list`. To confirm that the plugin is installed, run `codex plugin list`. Codex may ask you to restart or reload plugins before the skill becomes available.

## Use it

Start a Codex task that matches the skill's purpose. For example:

> Give me an evidence-based tour of this repository. Show the main entry points, how to run its checks, and where a small change to the settings screen belongs. Do not modify files.

The plugin instructions live in `skills/` and are included in the marketplace source for inspection.

## Scope

This focused Codex plugin is read-only: it maps repository structure and documentation without changing files or running project code. It has no external service, background process, or credential requirement. See the skill file for its workflow and limits.

## ☕ Support / Pro Version

The plugin is free and open source under MIT. No separate Pro version is currently offered. If it is useful, support GhosTnever on [Boosty](https://boosty.to/azizazimov), [Buy Me a Coffee](https://buymeacoffee.com/azizazimov8), or [Gumroad](https://azimovian22.gumroad.com/).

## License

MIT. See [LICENSE](LICENSE).

## Development

The repository includes a dependency-free consistency check (Node.js 20 or newer):

```sh
node scripts/validate.mjs   # VERSION, manifest, skills, marketplace, README pin, CHANGELOG, LICENSE
node --test                 # validator tests (auto-discovers test/*.test.mjs)
```

CI runs both commands on Ubuntu and Windows for every push, tag, and pull request.
