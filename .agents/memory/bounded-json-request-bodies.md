---
name: Bounded JSON request bodies
description: Request-size limits for public and authenticated JSON API routes.
---

Apply a byte ceiling while reading a request stream, not after calling a framework JSON parser and not only from `Content-Length`.

**Why:** Callers can omit or understate `Content-Length`, or place large data in ignored fields. Once the framework buffers and parses an unbounded body, logical item and string limits cannot prevent application memory or CPU exhaustion.

**How to apply:** Give every JSON-writing endpoint an endpoint-appropriate byte ceiling before parsing, then apply field-level validation and cardinality limits as a second layer. Return 413 for byte-limit violations and 400 for malformed JSON.