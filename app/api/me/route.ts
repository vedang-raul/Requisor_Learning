import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<DbUser>(
    "SELECT id, date_of_birth, qualification, learning_goal, onboarding_done FROM users WHERE email = $1",
    [session.user.email.toLowerCase()]
  );
  if (!rows[0]) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const r = rows[0];
  const dob = r.date_of_birth ? new Date(r.date_of_birth) : null;
  const ageYears = dob
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000))
    : null;

  return NextResponse.json({
    onboardingDone: r.onboarding_done ?? false,
    dateOfBirth: dob ? dob.toISOString().slice(0, 10) : null,
    ageYears,
    qualification: r.qualification ?? null,
    learningGoal: r.learning_goal ?? null,
  });
}
