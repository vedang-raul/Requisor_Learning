#!/bin/bash
set -e

# Install dependencies
npm install --ignore-scripts

# Fix bin permissions (common after zip imports / npm installs on this repl)
chmod -R +x node_modules/.bin/ 2>/dev/null || true

# Run schema migrations (scripts/migrate.js — also `npm run db:migrate`).
node scripts/migrate.js

echo "Post-merge setup complete."
