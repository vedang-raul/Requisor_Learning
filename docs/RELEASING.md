# Releasing

How a version of Alma 41 goes from `main` to learning.requisor.io, and how it
is recorded. The history of releases is in [CHANGELOG.md](../CHANGELOG.md).

## Version numbers

`MAJOR.MINOR.PATCH` ([Semantic Versioning](https://semver.org)):

- **PATCH** (1.1.0 → 1.1.1): fixes only.
- **MINOR** (1.1.0 → 1.2.0): new features; nothing existing breaks.
- **MAJOR** (1.x → 2.0.0): something people or other systems rely on changes
  incompatibly (a removed feature, a changed API, a migration that needs
  planning).

The version lives in three places that must agree: `package.json` (`"version"`),
the newest heading in `CHANGELOG.md`, and the git tag `vMAJOR.MINOR.PATCH` on the
commit that is live.

## Cutting a release

1. **Collect the changes.** `git log --oneline vLAST..main` lists what's new
   since the last release.
2. **Write the notes.** Add a section at the top of `CHANGELOG.md` under
   Added / Changed / Fixed (and Removed / Security when needed), in plain
   language for the people using the app. Say whether the release needs
   database changes.
3. **Set the version** in `package.json` and `package-lock.json` (the two
   top-level `"version"` fields) to match, commit, and push to `main`.
4. **Publish on Replit** with the strict pull-and-publish prompt, targeting
   that commit.
5. **Tag it once it is live**, so the tag always means "this exact code was
   released":

   ```bash
   git tag -a v1.1.0 <commit> -m "Alma 41 1.1.0"
   git push personal v1.1.0
   ```

   Then change the CHANGELOG heading from "not yet published" to the date, and
   create a GitHub release from the tag with the same notes if you want them on
   GitHub.

## Rolling back

Every release is a tag, so going back means publishing an earlier tag: give
Replit the previous version's tag as the target. A rollback across a database
change needs checking first: an older version may not expect a newer schema.
