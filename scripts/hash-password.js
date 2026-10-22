#!/usr/bin/env node
/**
 * Makes the bcrypt hash for SUPER_ADMIN_LOGIN_PASSWORD_HASH
 * (see src/lib/auth/env-super-admin.ts).
 *
 *   npm run hash-password
 *
 * Asks for the password in the terminal without echoing it, and prints only
 * the hash: once as-is for Replit Secrets / a host's environment settings,
 * once with each $ escaped for .env.local (Next.js expands $ there).
 * Nothing is saved, sent or logged.
 */
const readline = require('readline');
const bcrypt = require('bcryptjs');

function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    rl.question(question, (answer) => { rl.close(); process.stdout.write('\n'); resolve(answer); });
  });
}

(async () => {
  const password = await askHidden('Super admin password (hidden): ');
  if (password.length < 12) { console.error('Use at least 12 characters.'); process.exit(1); }
  if ((await askHidden('Repeat it (hidden): ')) !== password) { console.error('The passwords do not match.'); process.exit(1); }
  const hash = await bcrypt.hash(password, 12);
  console.log('\nFor Replit Secrets (or any host\'s environment settings):');
  console.log(`SUPER_ADMIN_LOGIN_PASSWORD_HASH=${hash}`);
  console.log('\nFor .env.local (each $ escaped):');
  console.log(`SUPER_ADMIN_LOGIN_PASSWORD_HASH=${hash.replace(/\$/g, '\$')}`);
})().catch((error) => { console.error(error.message); process.exit(1); });
