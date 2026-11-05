jest.mock("@/lib/server/access", () => ({ requireAccess: jest.fn() }));
jest.mock("@/lib/server/universities", () => ({ setUniversityTheme: jest.fn() }));

import { PUT } from "@/app/api/admin/universities/theme/route";
import { requireAccess } from "@/lib/server/access";
import { setUniversityTheme } from "@/lib/server/universities";

const mockAccess = requireAccess as jest.Mock;
const mockSet = setUniversityTheme as jest.Mock;
const put = (body: unknown) => PUT(new Request("http://localhost/api/admin/universities/theme", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const theme = { primary: "#7A0019", secondary: "#B8860B", background: "#F7F7F7", sidebar: "#FFFFFF", font: "lora" };

describe("PUT /api/admin/universities/theme", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ userId: 1, superAdmin: true });
    mockSet.mockResolvedValue(true);
  });

  it("is for super admins only", async () => {
    mockAccess.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    expect((await put({ id: 1, theme })).status).toBe(403);
    expect(mockAccess).toHaveBeenCalledWith("super");
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("saves a checked theme, and resets with null", async () => {
    const res = await put({ id: 3, theme });
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(3, theme);
    await put({ id: 3, theme: null });
    expect(mockSet).toHaveBeenLastCalledWith(3, null);
  });

  it("refuses a bad theme or an unknown university without saving", async () => {
    expect((await put({ id: 3, theme: { ...theme, primary: "url(x)" } })).status).toBe(400);
    expect((await put({ id: 3, theme: { ...theme, font: "Papyrus" } })).status).toBe(400);
    expect((await put({ id: "x", theme })).status).toBe(404);
    expect(mockSet).not.toHaveBeenCalled();
    mockSet.mockResolvedValue(false);
    expect((await put({ id: 99, theme })).status).toBe(404);
  });
});
