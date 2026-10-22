# Dependency security overrides

The manifest and lockfile must be updated together. The overrides keep the
current application and Tailwind 3 configuration compatible while addressing
the October 2026 dependency advisories.

| Dependency | Resolution | Reason |
| --- | --- | --- |
| Next.js | 16.4.2 or later compatible 16.x | Fixes all nine reported Next.js advisories. |
| ts-jest / Handlebars | ts-jest 29.4.15, Handlebars 4.7.10 | Updated parent requests the patched template compiler. |
| source-map-js | 1.2.2+ | Bounds indexed source-map offsets. |
| brace-expansion | 1.1.21+ and 2.1.7+ | Keeps each consumer's major version while fixing all three reported parsing/expansion issues. |
| sharp | 0.35.5+ | Includes the patched libheif and librsvg native dependencies. |
| postcss-selector-parser | 7.1.7+ | Tailwind 3 and postcss-nested otherwise request vulnerable 6.x; the selector API is covered by regression tests and the app build. |
| js-yaml under load-nyc-config | 4.3.2+ | Retains the parent's `load()` API, fixes merge-budget exhaustion, and removes argparse 1 / unpatched sprintf-js entirely. |
| uuid under vosk-browser | 11.1.1+ within 11.x | Latest Vosk still pins vulnerable uuid 9; 11 retains CommonJS and v4 compatibility and fixes buffer bounds. |
| braces | Official `braces` 3.0.3 from npm | The unofficial `@dieub/braces-depth-guard` alias was removed on 2026-10-22 (see below). |

## Braces

An earlier change aliased `braces` to `@dieub/braces-depth-guard`, a fork by a
single unknown publisher, to backport a depth limit for GHSA-vfj7-8cjw-p6xm.
On 2026-10-22 the team chose the official package instead: a build-time
dependency from an unvetted publisher is a larger supply-chain risk than the
advisory, which concerns denial of service from deeply nested brace patterns
in globs. Here, globs come from our own build configuration, never from users.
Switch to an official fixed release when upstream publishes one.

The lockfile is also generated against the public npm registry
(https://registry.npmjs.org), so `npm ci` works on any host, not only behind
Replit's package firewall.

## Verification

- `npm test -- --runTestsByPath tests/unit/dependency-security.test.ts` checks
  malicious nesting through string and AST APIs, normal glob matching, selector
  compatibility, YAML config loading/limits, UUID bounds, and native image
  processing.
- Run the complete unit suite and `npm run build` after dependency changes.
- Run a fresh dependency audit against the committed lockfile, including
  development dependencies. Do not omit packages or suppress these advisories.
