import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { db, type DbUser } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { rows } = await db.query<DbUser>(
    "SELECT name, email, role, employment_type, position, date_of_birth, gender FROM users WHERE email = $1",
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
  };

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  // DOB must be a valid past date if provided
  if (body.dateOfBirth) {
    const d = new Date(body.dateOfBirth);
    if (isNaN(d.getTime()) || d >= new Date()) {
      return NextResponse.json({ error: "Date of birth must be a valid past date." }, { status: 400 });
    }
  }

  const { rows } = await db.query<DbUser>(
    `UPDATE users
     SET name = $1,
         employment_type = $2,
         position = $3,
         date_of_birth = $4,
         gender = $5
     WHERE email = $6
     RETURNING name, email, role, employment_type, position, date_of_birth, gender`,
    [
      name,
      body.employmentType?.trim() || null,
      body.position?.trim() || null,
      body.dateOfBirth || null,
      body.gender?.trim() || null,
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
  });
}
