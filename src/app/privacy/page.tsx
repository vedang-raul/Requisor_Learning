import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Alma 41 by Requisor",
  description: "How Alma 41 collects, uses, and protects personal data.",
  robots: { index: false, follow: false },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-14 text-zinc-800">
      <h1 className="mb-2 text-3xl font-bold text-zinc-900">Privacy Policy</h1>
      <p className="mb-10 text-sm text-zinc-500">Last updated: November 2026</p>

      <Section id="who-we-are" title="1. Who we are">
        <p>
          This platform, <strong>Alma 41</strong>, is operated by <strong>Requisor</strong>. If you have
          questions about this policy or want to exercise your data rights, contact us at{" "}
          <a href="mailto:support@requisor.io" className="text-blue-600 underline">
            support@requisor.io
          </a>
          .
        </p>
      </Section>

      <Section id="what-we-collect" title="2. What we collect">
        <p className="mb-3">
          Alma 41 collects data in two ways: data you give us when you create an account, and data
          generated automatically as you use the platform.
        </p>

        <h3 className="mb-1 mt-4 font-semibold text-zinc-900">Account information</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Name and email address</li>
          <li>Your role (student or tutor) and the university you belong to</li>
          <li>Optional profile fields: position, qualification, learning goal</li>
          <li>Accessibility preferences and preferred language</li>
          <li>Whether your email address has been verified</li>
          <li>Which sign-in methods you have linked (email/password, Google)</li>
        </ul>

        <h3 className="mb-1 mt-4 font-semibold text-zinc-900">Sign-in events</h3>
        <p className="mb-2 text-sm">
          Each time you sign in, we record:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>The sign-in method used (email, Google, etc.)</li>
          <li>Your IP address at the time of sign-in</li>
          <li>Your browser, operating system, and device type (derived from your User-Agent string)</li>
          <li>An approximate location (country, region, city) derived from your IP address</li>
          <li>The date and time of the sign-in</li>
        </ul>

        <h3 className="mb-1 mt-4 font-semibold text-zinc-900">Page visits and time on page</h3>
        <p className="text-sm">
          While you use the platform, we record which pages you visit, how long you spend on each
          one (measured only while the browser tab is active), and which course or lesson you are
          viewing. We do not record the content of anything you type or read.
        </p>

        <h3 className="mb-1 mt-4 font-semibold text-zinc-900">Learning and teaching activity</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Lessons you have completed and quiz attempts</li>
          <li>Assignment submissions (file name, submission date, grade)</li>
          <li>XP points and login streak count</li>
          <li>For tutors: courses created, learner enrolments, grades given</li>
        </ul>

        <h3 className="mb-1 mt-4 font-semibold text-zinc-900">AI assistant usage</h3>
        <p className="text-sm">
          We record aggregated counts of requests made to the AI assistant (feature name, number of
          requests, token volume). We do not store the content of your conversations with the
          assistant beyond what is needed to serve your current session.
        </p>
      </Section>

      <Section id="why-we-collect" title="3. Why we collect it">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>To provide the service</strong> — your account data, progress, and submissions
            are essential to running your courses and tracking your learning.
          </li>
          <li>
            <strong>Security and fraud prevention</strong> — sign-in events including IP address help
            us detect and investigate unauthorised access.
          </li>
          <li>
            <strong>Platform health and support</strong> — usage data (page views, time on page,
            sign-in history) lets us understand how the platform is used, diagnose problems, and
            support universities in managing their members.
          </li>
          <li>
            <strong>University administration</strong> — university administrators and Requisor
            super-administrators use the Activity tab to monitor engagement and support their users.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          Our lawful basis for processing is <strong>legitimate interests</strong> (security, platform
          health, support) and <strong>contractual necessity</strong> (delivering the learning service
          you or your university has agreed to).
        </p>
      </Section>

      <Section id="who-sees-it" title="4. Who can see your data">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>You</strong> — you can see your own profile, progress, and submissions at any
            time within the platform.
          </li>
          <li>
            <strong>Your tutors</strong> — tutors can see submissions you hand in to their courses
            and the marks they assign.
          </li>
          <li>
            <strong>Your university administrator</strong> — can see your name, email, role, and
            enrolment status within their university.
          </li>
          <li>
            <strong>Requisor super-administrators</strong> — can see the full activity profile
            described in Section 2, across all universities, in order to support the platform.
          </li>
        </ul>
        <p className="mt-3 text-sm">
          We do not sell personal data. We do not share it with third parties for marketing.
        </p>
      </Section>

      <Section id="retention" title="5. How long we keep it">
        <p className="text-sm">
          We are reviewing retention periods and will update this section with specific timeframes.
          In the meantime, we keep data only as long as it is needed to provide the service or
          meet legal obligations. You may request deletion at any time (see Section 7).
        </p>
      </Section>

      <Section id="third-parties" title="6. Third-party services">
        <ul className="list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>ipapi.co</strong> — when our hosting provider does not supply location data in
            request headers (for example on Replit), we look up your IP address with ipapi.co to
            derive an approximate country, region, and city. Your IP is sent to ipapi.co for this
            purpose and is subject to{" "}
            <a href="https://ipapi.co/privacy/" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">
              their privacy policy
            </a>
            .
          </li>
          <li>
            <strong>Hosting provider (Vercel / Replit)</strong> — your requests pass through our
            hosting provider's infrastructure, which may supply geo-location headers derived from
            your IP. We do not receive raw IP data from them beyond what is in the request itself.
          </li>
          <li>
            <strong>Google (OAuth)</strong> — if you sign in with Google, your sign-in is handled
            by Google's OAuth service. We receive only your name, email, and a Google account
            identifier; we do not receive your Google password.
          </li>
          <li>
            <strong>ElevenLabs / HeyGen / YouTube / Auphonic</strong> — optional integrations for
            AI-generated lesson content. These are enabled per-university and are only active when
            configured by an administrator.
          </li>
        </ul>
      </Section>

      <Section id="your-rights" title="7. Your rights">
        <p className="mb-2 text-sm">
          You have the right to:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Access the personal data we hold about you</li>
          <li>Request correction of inaccurate data</li>
          <li>Request deletion of your account and associated data</li>
          <li>Object to processing based on legitimate interests</li>
          <li>Request a copy of your data in a portable format</li>
        </ul>
        <p className="mt-3 text-sm">
          To exercise any of these rights, email{" "}
          <a href="mailto:support@requisor.io" className="text-blue-600 underline">
            support@requisor.io
          </a>{" "}
          with your request. We will respond within 30 days.
        </p>
      </Section>

      <Section id="cookies" title="8. Cookies and sessions">
        <p className="text-sm">
          We use a single session cookie (<code className="rounded bg-zinc-100 px-1 text-xs">next-auth.session-token</code>{" "}
          in development, <code className="rounded bg-zinc-100 px-1 text-xs">__Secure-next-auth.session-token</code> in
          production) to keep you signed in. It is a JSON Web Token, stored in your browser, and is
          deleted when you sign out. We do not use third-party advertising cookies.
        </p>
      </Section>

      <Section id="changes" title="9. Changes to this policy">
        <p className="text-sm">
          We may update this policy as the platform evolves. Material changes will be noted in the
          platform changelog. Continued use of the platform after a change constitutes acceptance of
          the revised policy.
        </p>
      </Section>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10">
      <h2 className="mb-3 text-xl font-semibold text-zinc-900">{title}</h2>
      {children}
    </section>
  );
}
