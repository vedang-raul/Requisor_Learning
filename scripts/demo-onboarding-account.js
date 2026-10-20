#!/usr/bin/env node
/**
 * Creates — or resets — a demo learner who hasn't done onboarding yet, for
 * trying the onboarding walkthrough (including its accessibility step) again
 * and again. Development databases only.
 *
 *   npm run demo:onboarding
 *
 * Signs in with email + password on the normal login page. The password is
 * DEMO_ONBOARDING_PASSWORD in .env.local; if it isn't set, a random one is
 * generated and saved there. Running it again resets the account: onboarding,
 * answers and accessibility choices are cleared.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const EMAIL = 'student.onboarding@demo.msoe.test';
const NAME = 'Onboarding Demo';
const envFile = path.join(__dirname, '..', '.env.local');

if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].trim();
  }
}
if (process.env.NODE_ENV === 'production') { console.error('Refusing to create a demo account in production.'); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set.'); process.exit(1); }

let password = process.env.DEMO_ONBOARDING_PASSWORD;
if (!password) {
  password = crypto.randomBytes(9).toString('base64url');
  fs.appendFileSync(envFile, `\n# Demo learner for trying onboarding (scripts/demo-onboarding-account.js)\nDEMO_ONBOARDING_PASSWORD=${password}\n`);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  // The demo university, when seeded (scripts/seed-msoe-demo.js), so its courses show up.
  const { rows: unis } = await pool.query("SELECT id FROM universities WHERE id IN (SELECT university_id FROM users WHERE email LIKE '%@demo.msoe.test') LIMIT 1").catch(() => ({ rows: [] }));
  const universityId = unis[0]?.id ?? null;
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (email, name, email_verified, role, password_hash, onboarding_done, university_id, university_status)
     VALUES ($1, $2, TRUE, 'employee', $3, FALSE, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name, email_verified = TRUE, role = 'employee', password_hash = EXCLUDED.password_hash,
       onboarding_done = FALSE, qualification = NULL, learning_goal = NULL, date_of_birth = NULL,
       assistant_persona = NULL, preferred_language = NULL, accessibility = '{}',
       university_id = EXCLUDED.university_id, university_status = EXCLUDED.university_status`,
    [EMAIL, NAME, hash, universityId, universityId ? 'active' : null]
  );
  console.log(`Demo learner ready: ${EMAIL} (password: DEMO_ONBOARDING_PASSWORD in .env.local).`);
  console.log('Onboarding starts on first sign-in. Run this again to reset it.');
  await pool.end();
})().catch(async (error) => {
  console.error(error.message);
  await pool.end();
  process.exit(1);
});
