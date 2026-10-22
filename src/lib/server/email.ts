import { getBaseUrl } from "./base-url";

/**
 * Outgoing email. Transports, picked in this order:
 *  1. Brevo (https://www.brevo.com) when BREVO_API_KEY is set.
 *  2. Resend (https://resend.com) when RESEND_API_KEY is set.
 *     Either works on any host. EMAIL_FROM must be a sender that service has
 *     verified, written as "Name <address>" or just the address.
 *  3. The Gmail connector, inside a Repl.
 *  4. Local development: nothing is sent; the email's links are logged.
 */
const FROM = process.env.EMAIL_FROM || `Alma 41 <support@requisor.io>`;

function base64Url(input: string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The Gmail connector only works inside a Repl, which provides one of these tokens. */
// Read when sending, not at import, so the environment in effect at that moment decides.
const hasReplitIdentity = () => Boolean(process.env.REPL_IDENTITY || process.env.WEB_REPL_RENEWAL);

/**
 * Testing switch: with SKIP_EMAIL_VERIFICATION=on, new accounts can log in
 * straight away with their email and password, and no verification email is
 * sent. Anyone can then register with an address they don't own, so remove it
 * before real users arrive.
 */
export const skipEmailVerification = () => (process.env.SKIP_EMAIL_VERIFICATION ?? "").toLowerCase() === "on";

/** "Alma 41 <support@requisor.io>" → its name and address. */
export function parseSender(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*"?([^"<]*?)"?\s*<\s*([^<>\s]+)\s*>\s*$/);
  if (!match) return { email: from.trim() };
  return { ...(match[1].trim() ? { name: match[1].trim() } : {}), email: match[2] };
}

async function sendWithBrevo(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY ?? "", "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: parseSender(FROM), to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Brevo send failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

async function sendWithResend(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

/** Send an HTML email (see the transports above). */
export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (process.env.BREVO_API_KEY) return sendWithBrevo(to, subject, html);
  if (process.env.RESEND_API_KEY) return sendWithResend(to, subject, html);

  // Local development outside Replit: there is no mail transport, so print the
  // email (and its links, e.g. verification/reset) to the server console instead.
  if (process.env.NODE_ENV !== "production" && !hasReplitIdentity()) {
    const links = Array.from(html.matchAll(/href="([^"]+)"/g), (m) => m[1]);
    console.info(`[email:dev] To: ${to} | Subject: ${subject}${links.length ? `\n  ${links.join("\n  ")}` : ""}`);
    return;
  }

  if (!hasReplitIdentity()) {
    throw new Error("No email transport is configured: set BREVO_API_KEY or RESEND_API_KEY (and EMAIL_FROM).");
  }
  // Loaded on demand so hosts other than Replit never touch the connector SDK.
  const { ReplitConnectors } = await import("@replit/connectors-sdk");
  const connectors = new ReplitConnectors();
  const mime = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "",
    html,
  ].join("\r\n");

  const res = await connectors.proxy("google-mail", "/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64Url(mime) }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gmail send failed (${res.status}): ${text.slice(0, 500)}`);
  }
}

/* ---------- Templates ---------- */

function shell(title: string, body: string, cta?: { label: string; href: string }): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;padding:36px;text-align:left;">
        <tr><td style="padding-bottom:20px;">
          <span style="font-size:20px;font-weight:bold;color:#14b8a6;">Alma 41</span>
          <span style="font-size:13px;font-weight:600;color:#6b7280;"> by Requisor.<span style="font-weight:800;color:#0f766e;letter-spacing:0.04em;">AI</span></span>
        </td></tr>
        <tr><td style="font-size:18px;font-weight:bold;color:#111827;padding-bottom:12px;">${title}</td></tr>
        <tr><td style="font-size:14px;line-height:1.6;color:#374151;padding-bottom:24px;">${body}</td></tr>
        ${cta ? `<tr><td><a href="${cta.href}" style="display:inline-block;background:#14b8a6;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 28px;border-radius:10px;">${cta.label}</a></td></tr>` : ""}
        <tr><td style="font-size:11px;color:#9ca3af;padding-top:28px;">Alma 41 by Requisor.io · Citrus Innovations<br/>Sent from support@requisor.io</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const url = `${getBaseUrl()}/api/verify?token=${token}`;
  await sendEmail(
    to,
    "Verify your email — Alma 41",
    shell(
      `Hi ${name || "there"}, verify your email`,
      "Thanks for creating your Alma 41 account. Please confirm this email address to activate your account. The link expires in 24 hours.",
      { label: "Verify my email", href: url }
    )
  );
}

export async function sendWelcomeEmail(to: string, name: string) {
  await sendEmail(
    to,
    "Welcome to Alma 41 🎉",
    shell(
      `Welcome aboard, ${name || "there"}!`,
      "Your account is verified and ready. Explore curated learning paths in Product Management, Data Analytics, Agentic AI and Cyber Security — your progress and XP are saved automatically.",
      { label: "Start learning", href: `${getBaseUrl()}/` }
    )
  );
}

/** Escapes text placed into email HTML (names are user-typed). */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c] as string);
}

/** A super admin made this tutor the tutor of a course. */
export async function sendCourseAssignedEmail(to: string, rawName: string, rawCourseTitle: string) {
  const name = escapeHtml(rawName);
  const courseTitle = escapeHtml(rawCourseTitle);
  await sendEmail(
    to,
    `You have been assigned to course ${rawCourseTitle.replace(/[\r\n]+/g, " ")}`,
    shell(
      `Hi ${name || "there"}`,
      `You have been assigned to course <b>${courseTitle}</b> on Alma 41. You can now edit its lessons, grade its assignments and see how its learners are doing.`,
      { label: "Open the tutor workspace", href: `${getBaseUrl()}/app/tutor/` }
    )
  );
}

/** A university admin approved someone's request to join. */
export async function sendJoinApprovedEmail(to: string, rawName: string, rawUniversity: string) {
  const name = escapeHtml(rawName);
  const universityName = escapeHtml(rawUniversity);
  await sendEmail(
    to,
    `You're in — ${rawUniversity} on Alma 41`,
    shell(
      `Welcome to ${universityName}, ${name || "there"}!`,
      `Your request to join ${universityName} has been approved. Sign in to see your courses.`,
      { label: "Go to my courses", href: `${getBaseUrl()}/app/dashboard/` }
    )
  );
}

/** A university admin declined someone's request to join. */
export async function sendJoinDeclinedEmail(to: string, rawName: string, rawUniversity: string) {
  const name = escapeHtml(rawName);
  const universityName = escapeHtml(rawUniversity);
  await sendEmail(
    to,
    `Your request to join ${rawUniversity}`,
    shell(
      `Hi ${name || "there"}`,
      `Your request to join ${universityName} on Alma 41 wasn't approved. If you study there, sign up again with your university email address, or contact your university admin.`,
    )
  );
}

export async function sendPasswordResetEmail(to: string, name: string, token: string) {
  const url = `${getBaseUrl()}/reset-password?token=${token}`;
  await sendEmail(
    to,
    "Reset your password — Alma 41",
    shell(
      `Hi ${name || "there"}, reset your password`,
      "We received a request to reset your Alma 41 password. If this wasn't you, you can safely ignore this email. The link expires in 1 hour.",
      { label: "Reset password", href: url }
    )
  );
}

export async function sendAssignmentSubmittedEmail(to: string, name: string, opts: { studentName: string; lessonTitle: string; courseTitle: string; link: string }) {
  await sendEmail(
    to,
    `New submission: ${opts.lessonTitle}`,
    shell(
      "A learner submitted an assignment 📄",
      `Hi ${name || "there"},<br/><br/><b>${opts.studentName}</b> just submitted their assignment for <b>${opts.lessonTitle}</b> in <b>${opts.courseTitle}</b>.`,
      { label: "Review submission", href: opts.link }
    )
  );
}
