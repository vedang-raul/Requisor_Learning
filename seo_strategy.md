# SEO Strategy

## In scope
- Public homepage `/`: Alma 41 by Requisor.io, an AI-assisted learning platform for learners and tutors.
- Public homepage interactions and shared markup/styles, including source-detectable WCAG 2.2 A/AA accessibility.
- Crawl discovery, canonical metadata, social sharing and AI crawler access for the homepage.

## Out of scope
- Authenticated learning, tutor and admin workspaces under `/app/**` and private APIs.
- Account/login/sign-up and password-reset screens are intentionally excluded from search; do not propose indexing them.
- Archived content and generated build/export output are not current public routes.

## Target audience
- Learners seeking AI-assisted learning and multilingual lesson narration.
- Tutors creating and editing courses and lessons with AI tools.

## Primary topics
- AI learning assistant; multilingual narration; lesson transcripts; tutor course creation tools.

## Rendering and crawler assumptions
- Next.js App Router server renders the homepage, including client components on initial requests; a client directive alone is not a SPA visibility defect.
- Public canonical domain is https://alma.requisor.io as explicitly specified in source SEO configuration.
- Homepage is the only indexable page; existing robots and sitemap deliberately exclude account and private app routes.
- Search, social preview and AI retrieval visibility are in scope. Cloudflare Turnstile alone is not evidence of Cloudflare proxy bot blocking.

## Dismissed categories
- None yet.
