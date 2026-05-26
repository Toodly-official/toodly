# Release

## Desktop app versioning

Toodly desktop releases use `apps/desktop/package.json` as the version source of truth.

Use semantic versioning:

- Patch: `0.1.1` for bug fixes and small polish
- Minor: `0.2.0` for user-facing features
- Major: `1.0.0` for breaking changes or a major product milestone

## Release flow

1. Update `apps/desktop/package.json` version.

   ```sh
   pnpm --filter @toodly/desktop version patch --no-git-tag-version
   ```

2. Commit the version bump.

   ```sh
   git add apps/desktop/package.json
   git commit -m "chore: release desktop v0.1.1"
   ```

3. Create and push a matching tag.

   ```sh
   git tag v0.1.1
   git push origin main
   git push origin v0.1.1
   ```

4. GitHub Actions builds macOS and Windows packages and uploads them to a draft GitHub Release.

5. Install-test the release assets from the draft release.

6. Publish the draft release manually in GitHub.

The tag must match the desktop package version without the `v` prefix. For example, tag `v0.1.1` requires `apps/desktop/package.json` version `0.1.1`.
