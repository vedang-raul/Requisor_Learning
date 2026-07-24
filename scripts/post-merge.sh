#!/bin/bash
set -e

# Install dependencies
npm install --ignore-scripts

# Fix bin permissions (common after zip imports / npm installs on this repl)
chmod -R +x node_modules/.bin/ 2>/dev/null || true

# Run any pending DB column additions idempotently
node -e "
const {Pool}=require('pg');
const p=new Pool({connectionString:process.env.DATABASE_URL});
p.query(\`
  ALTER TABLE users
    ADD COLUMN IF NOT EXISTS employment_type VARCHAR(20),
    ADD COLUMN IF NOT EXISTS position VARCHAR(100)
\`).then(()=>{console.log('DB schema up to date');process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)});
"

echo "Post-merge setup complete."
