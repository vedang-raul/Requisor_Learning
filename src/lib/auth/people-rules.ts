import { assignableRoles, type SessionRole } from "./roles";

/**
 * The rules for managing people, separate from the database so they can be
 * tested on their own.
 *
 *   super admin       anyone except other super admins: any role, any university
 *   university admin  tutors and students of their own university: approve them,
 *                     make them tutor or student, take them out of the university
 *   nobody            changes themselves, or a super admin
 */
export type Manager = { userId: number; superAdmin: boolean; universityId: number | null };
export type Person = {
  id: number;
  role: SessionRole;
  superAdmin: boolean;
  universityId: number | null;
  status: "active" | "pending" | null;
  requestedRole: string | null;
};
export type PeopleAction =
  | { kind: "approve" }
  | { kind: "approve-tutor" }
  | { kind: "decline-tutor" }
  | { kind: "set-role"; role: SessionRole }
  | { kind: "move"; universityId: number | null }
  | { kind: "remove" };

/** The change to make to the person's account. */
export type PeopleUpdate = { role?: SessionRole; universityId?: number | null; status?: "active" | "pending" | null; requestedRole?: null };

export function readPeopleAction(raw: Record<string, unknown>): PeopleAction | null {
  switch (raw.action) {
    case "approve": return { kind: "approve" };
    case "approve-tutor": return { kind: "approve-tutor" };
    case "decline-tutor": return { kind: "decline-tutor" };
    case "remove": return { kind: "remove" };
    case "set-role":
      return raw.role === "employee" || raw.role === "tutor" || raw.role === "admin" ? { kind: "set-role", role: raw.role } : null;
    case "move": {
      if (raw.universityId === null) return { kind: "move", universityId: null };
      const id = Number(raw.universityId);
      return Number.isSafeInteger(id) && id > 0 ? { kind: "move", universityId: id } : null;
    }
    default: return null;
  }
}

/** Whether the manager may act on this person at all. */
export function canManage(manager: Manager, person: Person): boolean {
  if (person.id === manager.userId || person.superAdmin) return false;
  if (manager.superAdmin) return true;
  // A university admin manages only their own university's tutors and students.
  return Boolean(manager.universityId) && person.universityId === manager.universityId && person.role !== "admin";
}

export function planPeopleChange(manager: Manager, person: Person, action: PeopleAction): PeopleUpdate | { error: string } {
  if (person.id === manager.userId) return { error: "You can't change your own access." };
  if (person.superAdmin) return { error: "Super admins are set on the server and can't be changed here." };
  if (!canManage(manager, person)) return { error: "You can only manage tutors and students in your own university." };

  switch (action.kind) {
    case "approve":
      if (person.status !== "pending") return { error: "This person isn't waiting to join." };
      return { status: "active" };
    case "approve-tutor":
      if (person.status !== "active") return { error: "Approve them as a member of the university first." };
      return { role: "tutor", requestedRole: null };
    case "decline-tutor":
      return { requestedRole: null };
    case "set-role": {
      if (!assignableRoles(manager).includes(action.role)) return { error: "Only a super admin can make someone a university admin." };
      if (action.role !== "employee" && person.status !== "active") return { error: "They need to be an approved member of a university first." };
      return { role: action.role, requestedRole: null };
    }
    case "move":
      if (!manager.superAdmin) return { error: "Only a super admin can move people between universities." };
      // An admin moved to another university, or out of all of them, stops being an admin.
      return {
        universityId: action.universityId,
        status: action.universityId ? "active" : null,
        ...(person.role === "admin" ? { role: "employee" as const } : {}),
      };
    case "remove":
      if (!person.universityId) return { error: "This person isn't in a university." };
      return { universityId: null, status: null, role: "employee", requestedRole: null };
  }
}
