#!/usr/bin/env node
/**
 * Sets the password of an existing account, e.g. the super admin
 * (support@requisor.io), so it can sign in with email and password.
 *
 *   npm run set-password
 *
 * Asks for the email and the new password in the terminal; the password is
 * never echoed, logged or written anywhere except as a bcrypt hash. Uses
 * DATABASE_URL (from .env.local when not set), so it changes the database
 * that variable points at. On the live site, use "Forgot password?" instead.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const envFile = path.join(__dirname, '..', '.env.local');
if (!process.env.DATABASE_URL && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }

function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Print the prompt, then swallow every echoed keystroke.
      rl._writeToOutput = (text) => { if (text.includes(question)) process.stdout.write(question); };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer);
    });
  });
}

(async () => {
  const email = (await ask('Account email: ')).trim().toLowerCase();
  if (!email.includes('@')) { console.error('That is not an email address.'); process.exit(1); }
  const password = await ask('New password (hidden): ', true);
  if (password.length < 12) { console.error('Use at least 12 characters.'); process.exit(1); }
  if ((await ask('Repeat it (hidden): ', true)) !== password) { console.error('The passwords do not match.'); process.exit(1); }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const hash = await bcrypt.hash(password, 12);
    // Existing accounts only. Bumping session_version signs out any other session of this account.
    const { rowCount } = await pool.query(
      `UPDATE users SET password_hash = $1, email_verified = TRUE, session_version = session_version + 1
        WHERE email = $2`,
      [hash, email]
    );
    console.log(rowCount ? `Password set for ${email}.` : `No account with the email ${email}. Nothing changed.`);
  } finally {
    await pool.end();
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
