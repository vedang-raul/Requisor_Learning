---
name: AI provider — xAI Grok
description: Chat and quiz AI routes switched from Anthropic to xAI Grok; covers secret name, base URL, model, and why no SDK is needed.
---

# AI provider — xAI Grok

The chatbot (`/api/chat`) and quiz generator (`/api/quiz`) both use xAI's Grok API.

**Secret:** `XAI_API_KEY` (set in Replit Secrets; starts with `xai-`)  
**Base URL:** `https://api.x.ai/v1`  
**Default model:** `grok-3-mini` — overridable via `XAI_MODEL` env var  
**SDK:** none — plain `fetch` against the OpenAI-compatible REST API is sufficient

**Why:** xAI's API is OpenAI-compatible (same `/chat/completions` endpoint, same SSE streaming format), so no extra package is needed. The `@anthropic-ai/sdk` import was removed from both routes.

**How to apply:** If the model needs changing, set `XAI_MODEL` env var. If the key is rotated, update `XAI_API_KEY` in Replit Secrets and restart the workflow.
