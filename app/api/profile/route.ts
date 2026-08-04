import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<DbUser>(
    "SELECT name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done FROM users WHERE email = $1",
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
  };

  // Name is only required when it's being explicitly updated (not during onboarding-only saves)
  const isOnboardingOnly = body.onboardingDone === true && !body.name;
  if (!isOnboardingOnly) {
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  // DOB must be a valid past date if provided
  if (body.dateOfBirth) {
    const d = new Date(body.dateOfBirth);
    if (isNaN(d.getTime()) || d >= new Date()) {
      return NextResponse.json({ error: "Date of birth must be a valid past date." }, { status: 400 });
    }
  }

  if (isOnboardingOnly) {
    // Onboarding-only: update qualification, learning_goal, date_of_birth, onboarding_done without touching name
    const { rows } = await db.query<DbUser>(
      `UPDATE users
       SET qualification = COALESCE($1, qualification),
           learning_goal = COALESCE($2, learning_goal),
           date_of_birth = COALESCE($3, date_of_birth),
           onboarding_done = TRUE
       WHERE email = $4
       RETURNING name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done`,
      [
        body.qualification?.trim() || null,
        body.learningGoal?.trim() || null,
        body.dateOfBirth || null,
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
         onboarding_done = COALESCE($8, onboarding_done)
     WHERE email = $9
     RETURNING name, email, role, employment_type, position, date_of_birth, gender, qualification, learning_goal, onboarding_done`,
    [
      body.name!.trim(),
      body.employmentType?.trim() || null,
      body.position?.trim() || null,
      body.dateOfBirth || null,
      body.gender?.trim() || null,
      body.qualification?.trim() || null,
      body.learningGoal?.trim() || null,
      body.onboardingDone ?? null,
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
  });
}
