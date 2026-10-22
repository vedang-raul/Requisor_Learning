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
| braces | Exact npm alias `@dieub/braces-depth-guard@3.0.3-pn.3` | Upstream 3.0.3 has no fix for GHSA-vfj7-8cjw-p6xm. |

## Braces backport

The brace parser replacement is a depth-guard backport, not an advisory
suppression or a package rename of unchanged vulnerable code. Its published
source was compared with upstream 3.0.3: changes bound parser nesting and the
compile/expand/stringify AST walkers, validate limit options, and detect parent
cycles. The maximum depth is capped at 100, including when options try to
disable it. Normal source-file globs remain supported.

Source: https://github.com/dieub/braces-depth-guard

Both chokidar and micromatch resolve the replacement. It is pinned exactly,
with integrity in the lockfile. This avoids an unrelated migration to Tailwind
4 and its styling changes. Revisit this alias when upstream ships a corrected
release; do not remove it merely because the replacement has no advisory.

## Verification

- `npm test -- --runTestsByPath tests/unit/dependency-security.test.ts` checks
  malicious nesting through string and AST APIs, normal glob matching, selector
  compatibility, YAML config loading/limits, UUID bounds, and native image
  processing.
- Run the complete unit suite and `npm run build` after dependency changes.
- Run a fresh dependency audit against the committed lockfile, including
  development dependencies. Do not omit packages or suppress these advisories.
