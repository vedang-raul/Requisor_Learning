# Plan: university themes on the home page

Status: not started. The in-app theme shipped first (Admin → Universities →
Theme); this is what it would take to extend it to the dark Alma home page.

## Where things stand

- A university's theme (`universities.theme`, see
  `src/lib/theme/university-theme.ts`) sets `--brand-primary`,
  `--brand-secondary`, `--brand-background`, `--brand-sidebar` and
  `--font-brand`. Tailwind's `primary`, `secondary`, `background`, `sidebar`,
  `font-sans` and `font-display` read them, with Requisor's values as
  fallbacks.
- Only signed-in members of that university get it, from
  `src/app/app/layout.tsx`. The home page (`src/app/page.tsx`,
  `src/components/landing/AlmaLanding.jsx`) never does.
- The home page is a separate dark design. Its colours live in
  `src/components/landing/alma-landing.module.css` and
  `src/components/landing/index.css`, and in Tailwind tokens reserved for it
  (`void`, `alma-surface`, `pulse`, `pulse-deep` …), not in `primary`.

## Decisions to make first

1. **Whose theme.** Visitors on the home page aren't signed in. The likely
   choice is the public partner super admins already pick ("In association
   with"), so pitching to a university shows its colours too. Alternatives: a
   `?u=<university>` link per university, or a separate setting.
2. **How much changes.** Recommended: only the accent (`pulse` and
   `pulse-deep`: the glow, the buttons and the highlights), keeping the dark
   background and Requisor's wordmark. A light background on the home page is a
   redesign, not a theme.
3. **Font.** Headings only, or nothing: the display face is part of the page's
   look.

## Work

1. Add `--brand-accent` (and a darker `--brand-accent-deep`) to `themeCss`,
   worked out from `primary`, lightened until it reads on `#060708` (the
   reverse of `darkenUntil`: aim for a contrast of 4.5 against the dark
   background).
2. Point `pulse` and `pulse-deep` in `tailwind.config.ts` at those variables,
   with the current colours as fallbacks, like `primary`.
3. Replace the hard-coded accent colours in the landing CSS files with the
   variables. Search: `#7DF3D8`, `#17A78C`, `#23AE97`, `rgba(125, 243, 216`.
4. In `src/app/page.tsx` (a server component), read the public partner's
   theme with `partnerFor(null)` and `universityTheme(id)`, and write the
   `<style>` the same way `src/app/app/layout.tsx` does.
5. Admin: a switch in the theme editor, "Also use the main colour on the home
   page when this university is the public partner", stored as
   `theme.homePage: boolean` (add it to `readTheme`).
6. Tests: the accent stays readable on the dark background; the home page uses
   Requisor's colours when there is no partner, or the partner has no theme or
   has the switch off.

## Risks

- Replit has its own changes to the landing files (fonts, accessibility,
  contrast). Merge them in first, or this will clash.
- The landing page's contrast fixes (`tests/unit/landing-accessibility.test.ts`
  on Replit) must still pass with any partner colour: hence lightening the
  accent automatically rather than taking it as given.
- Caching: the home page is public, so the theme in it must not be cached
  across partners for long. The 60-second theme cache is fine; check any CDN
  in front of the site.

Estimate: about a day, plus testing on phones.
