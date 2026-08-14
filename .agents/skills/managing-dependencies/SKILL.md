---
name: managing-dependencies
description: 'Use when dependencies are added, removed, or upgraded, or when package.json, package-lock.json, or dependency-related CI/dependabot configuration changes.'
---

# Manage Dependencies

Keep `package.json`, `package-lock.json`, and `.github/dependabot.yml` in sync. CI installs from the
lockfile (`npm ci`), so the lockfile must always accompany range changes.

## Add, Remove, or Upgrade

- Install through npm so the lockfile and ranges stay consistent: `npm install <pkg>` for runtime
  dependencies, `npm install -D <pkg>` for dev dependencies, `npm uninstall <pkg>` to remove.
- Do not hand-edit version ranges in `package.json` and leave the lockfile stale.
- Keep the repo's `^` range convention.
- Prefer the existing visual system and Lucide icons over adding renderer dependencies.
- Commit `package-lock.json` together with `package.json` in the same change.

## Keep Dependabot Configuration in Sync

Dependabot reads `.github/dependabot.yml`, not `package.json`, so the two can drift:

- When adding a dependency, add its pattern to an existing group in the npm ecosystem block, or
  accept a standalone PR when the dependency does not fit any group.
- When removing a dependency, remove its pattern from groups and ignore rules.
- When a range or peer constraint changes, update the matching `ignore` rule in the same change.

Example: `@electron/fuses` must stay on 1.x while the repo uses Electron Forge 7:

```yaml
ignore:
  # @electron-forge/plugin-fuses@7.x declares a peerDependency on
  # @electron/fuses@^1.0.0; v2 is incompatible until we move to Forge 8.
  - dependency-name: '@electron/fuses'
    update-types:
      - 'version-update:semver-major'
```

Use `update-types: version-update:semver-major` to block major versions while keeping patch and
minor updates flowing. Use a `versions` list only when a dependency must be frozen entirely.
Remove the ignore rule when the constraint no longer applies.

## Keep Workflows Consistent

- CI and release workflows install with plain `npm ci` — no `--legacy-peer-deps`. Resolve peer
  conflicts with range pins in `package.json`, never by reintroducing the flag.
- Keep the `node-version` in `.github/workflows/` aligned with `engines` in `package.json`.
- Keep `.github/dependabot.yml` valid YAML; a parse error silently disables updates.

## Verify

1. Run `npm run check`.
2. Prove clean resolution without flags: `npm install --dry-run --ignore-scripts --no-audit --no-fund`.
3. If Electron, Forge, or packaging dependencies changed, run `npm run package` and confirm the
   app starts. For packaging changes, run a platform package build.
