import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";
import { PERSONAS, LANGUAGES, COUNTRIES } from "@/lib/personas";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<DbUser>(
    "SELECT name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done, assistant_persona, preferred_language, preferred_country FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const r = rows[0];
  return NextResponse.json({
    name: r.name ?? "",
    email: r.email,
    role: r.role,
    employmentType: r.employment_type ?? "",
    position: r.position ?? "",
    dateOfBirth: r.date_of_birth ? new Date(r.date_of_birth).toISOString().slice(0, 10) : "",
    gender: r.gender ?? "",
    qualification: r.qualification ?? "",
    learningGoal: r.learning_goal ?? "",
    onboardingDone: r.onboarding_done ?? false,
    assistantPersona: r.assistant_persona ?? "",
    preferredLanguage: r.preferred_language ?? "",
    preferredCountry: r.preferred_country ?? "",
  });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as {
    name?: string;
    employmentType?: string;
    position?: string;
    dateOfBirth?: string;
    gender?: string;
    qualification?: string;
    learningGoal?: string;
    onboardingDone?: boolean;
    notificationSettings?: {
      courses: boolean;
      assignments: boolean;
      badges: boolean;
      announcements: boolean;
    };
    assistantPersona?: string;
    preferredLanguage?: string;
    preferredCountry?: string;
  };

  const isAssistantOnly =
    (body.assistantPersona !== undefined || body.preferredLanguage !== undefined || body.preferredCountry !== undefined) &&
    !body.name && !body.onboardingDone && body.notificationSettings === undefined;

  // Name is only required when it's being explicitly updated (not during onboarding-only, notif-only, or assistant-only saves)
  const isOnboardingOnly = body.onboardingDone === true && !body.name;
  const isNotifOnly = body.notificationSettings !== undefined && !body.name && !body.onboardingDone;
  if (!isOnboardingOnly && !isNotifOnly && !isAssistantOnly) {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  // Notifications-only fast path
  if (isNotifOnly) {
    await db.query(
      `UPDATE users SET notification_settings = $1 WHERE email = $2`,
      [JSON.stringify(body.notificationSettings), session.user.email.toLowerCase()]
    );
    return NextResponse.json({ notificationSettings: body.notificationSettings });
  }

  // AI guide preferences-only fast path — validate against known option lists so
  // only vetted values ever reach the chat system prompt.
  if (isAssistantOnly) {
    const persona = body.assistantPersona !== undefined
      ? (PERSONAS.some((p) => p.id === body.assistantPersona) ? body.assistantPersona : null)
      : undefined;
    const language = body.preferredLanguage !== undefined
      ? (LANGUAGES.some((l) => l.code === body.preferredLanguage) ? body.preferredLanguage : null)
      : undefined;
    const country = body.preferredCountry !== undefined
      ? (COUNTRIES.includes(body.preferredCountry ?? "") ? body.preferredCountry : null)
      : undefined;

    const { rows } = await db.query<DbUser>(
      `UPDATE users
       SET assistant_persona = COALESCE($1, assistant_persona),
           preferred_language = COALESCE($2, preferred_language),
           preferred_country = COALESCE($3, preferred_country)
       WHERE email = $4
       RETURNING assistant_persona, preferred_language, preferred_country`,
      [persona ?? null, language ?? null, country ?? null, session.user.email.toLowerCase()]
    );
    if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      assistantPersona: r.assistant_persona ?? "",
      preferredLanguage: r.preferred_language ?? "",
      preferredCountry: r.preferred_country ?? "",
    });
  }

  // DOB must be a valid past date if provided
  if (body.dateOfBirth) {
    const d = new Date(body.dateOfBirth);
    if (isNaN(d.getTime()) || d >= new Date()) {
      return NextResponse.json({ error: "Date of birth must be a valid past date." }, { status: 400 });
    }
  }

  const defaultNotif = { courses: true, assignments: true, badges: true, announcements: true };

  if (isOnboardingOnly) {
    const persona = body.assistantPersona !== undefined
      ? (PERSONAS.some((p) => p.id === body.assistantPersona) ? body.assistantPersona : null)
      : undefined;
    const language = body.preferredLanguage !== undefined
      ? (LANGUAGES.some((l) => l.code === body.preferredLanguage) ? body.preferredLanguage : null)
      : undefined;
    const country = body.preferredCountry !== undefined
      ? (COUNTRIES.includes(body.preferredCountry ?? "") ? body.preferredCountry : null)
      : undefined;

    // Save onboarding answers and AI guide preferences atomically without touching the user's name.
    const { rows } = await db.query<DbUser>(
      `UPDATE users
       SET qualification = COALESCE($1, qualification),
           learning_goal = COALESCE($2, learning_goal),
           date_of_birth = COALESCE($3, date_of_birth),
           onboarding_done = TRUE,
           notification_settings = COALESCE($4, notification_settings),
           assistant_persona = COALESCE($5, assistant_persona),
           preferred_language = COALESCE($6, preferred_language),
           preferred_country = COALESCE($7, preferred_country)
       WHERE email = $8
       RETURNING name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done, notification_settings, assistant_persona, preferred_language, preferred_country`,
      [
        body.qualification?.trim() || null,
        body.learningGoal?.trim() || null,
        body.dateOfBirth || null,
        body.notificationSettings ? JSON.stringify(body.notificationSettings) : null,
        persona ?? null,
        language ?? null,
        country ?? null,
        session.user.email.toLowerCase(),
      ]
    );
    if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const r = rows[0];
    return NextResponse.json({
      name: r.name ?? "",
      email: r.email,
      role: r.role,
      employmentType: r.employment_type ?? "",
      position: r.position ?? "",
      dateOfBirth: r.date_of_birth ? new Date(r.date_of_birth).toISOString().slice(0, 10) : "",
      gender: r.gender ?? "",
      qualification: r.qualification ?? "",
      learningGoal: r.learning_goal ?? "",
      onboardingDone: r.onboarding_done ?? false,
      notificationSettings: r.notification_settings ?? defaultNotif,
      assistantPersona: r.assistant_persona ?? "",
      preferredLanguage: r.preferred_language ?? "",
      preferredCountry: r.preferred_country ?? "",
    });
  }

  const { rows } = await db.query<DbUser>(
    `UPDATE users
     SET name = $1,
         employment_type = $2,
         position = $3,
         date_of_birth = $4,
         gender = $5,
         qualification = $6,
         learning_goal = $7,
         onboarding_done = COALESCE($8, onboarding_done),
         notification_settings = COALESCE($9, notification_settings)
     WHERE email = $10
     RETURNING name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done, notification_settings`,
    [
      body.name!.trim(),
      body.employmentType?.trim() || null,
      body.position?.trim() || null,
      body.dateOfBirth || null,
      body.gender?.trim() || null,
      body.qualification?.trim() || null,
      body.learningGoal?.trim() || null,
      body.onboardingDone ?? null,
      body.notificationSettings ? JSON.stringify(body.notificationSettings) : null,
      session.user.email.toLowerCase(),
    ]
  );

  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const r = rows[0];
  return NextResponse.json({
    name: r.name ?? "",
    email: r.email,
    role: r.role,
    employmentType: r.employment_type ?? "",
    position: r.position ?? "",
    dateOfBirth: r.date_of_birth ? new Date(r.date_of_birth).toISOString().slice(0, 10) : "",
    gender: r.gender ?? "",
    qualification: r.qualification ?? "",
    learningGoal: r.learning_goal ?? "",
    onboardingDone: r.onboarding_done ?? false,
    notificationSettings: r.notification_settings ?? defaultNotif,
  });
}
