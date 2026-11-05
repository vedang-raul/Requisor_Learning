jest.mock("@/lib/server/access", () => ({ requireAccess: jest.fn() }));
jest.mock("@/lib/server/universities", () => ({ setUniversityFont: jest.fn() }));

import { DELETE, PUT } from "@/app/api/admin/universities/font/route";
import { requireAccess } from "@/lib/server/access";
import { setUniversityFont } from "@/lib/server/universities";
import { MAX_FONT_BYTES, readFontUpload, sniffFont } from "@/lib/theme/font-upload";
import { readTheme, themeCss } from "@/lib/theme/university-theme";

const mockAccess = requireAccess as jest.Mock;
const mockSet = setUniversityFont as jest.Mock;
const file = (bytes: number[], name = "Brand.woff2") => ({ name, data: `data:font/woff2;base64,${Buffer.from([...bytes, 1, 2, 3, 4]).toString("base64")}` });
const WOFF2 = [0x77, 0x4f, 0x46, 0x32];
const call = (method: "PUT" | "DELETE", body: unknown) =>
  (method === "PUT" ? PUT : DELETE)(new Request("http://localhost/api/admin/universities/font", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

describe("uploaded university fonts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAccess.mockResolvedValue({ userId: 1, superAdmin: true });
    mockSet.mockResolvedValue(true);
  });

  it("knows a font by its first bytes, whatever the file is called", () => {
    expect(sniffFont(Uint8Array.from(WOFF2))).toBe("woff2");
    expect(sniffFont(Uint8Array.from([0x77, 0x4f, 0x46, 0x46]))).toBe("woff");
    expect(sniffFont(Uint8Array.from([0, 1, 0, 0]))).toBe("ttf");
    expect(sniffFont(Uint8Array.from([0x4f, 0x54, 0x54, 0x4f]))).toBe("otf");
    expect(sniffFont(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(readFontUpload(file([0x3c, 0x73, 0x76, 0x67], "evil.woff2"))).toEqual({ error: expect.stringContaining("isn't a font") });
  });

  it("keeps a tidy name for showing, and refuses empty or oversized files", () => {
    const font = readFontUpload(file(WOFF2, 'Brand <script>"Sans".woff2'));
    expect(font).toMatchObject({ format: "woff2", name: "Brand scriptSans.woff2" });
    expect(readFontUpload({ name: "x", data: "data:font/woff2;base64," })).toHaveProperty("error");
    expect(readFontUpload({ name: "x", data: "not a data url" })).toHaveProperty("error");
    const big = { name: "big.woff2", data: `data:font/woff2;base64,${Buffer.concat([Buffer.from(WOFF2), Buffer.alloc(MAX_FONT_BYTES)]).toString("base64")}` };
    expect(readFontUpload(big)).toEqual({ error: expect.stringContaining("too large") });
  });

  it("puts the font in the page under a fixed name, from this site only", () => {
    const theme = readTheme({ primary: "#7A0019", secondary: "#9C6B00", background: "#F7F3EE", sidebar: "#FFFFFF", font: "custom" })!;
    const css = themeCss(theme, null, { universityId: 4, version: 1700000000000, format: "woff2" });
    expect(css).toContain('@font-face{font-family:"UniversityFont";src:url("/api/universities/4/font/?v=1700000000000") format("woff2")');
    expect(css).toContain('--font-brand:"UniversityFont", ui-sans-serif');
    expect(themeCss(theme, null, { universityId: 4, version: 1, format: 'woff2") ; }body{' })).not.toContain("@font-face");
    expect(themeCss(theme, null)).not.toContain("--font-brand");
  });

  it("lets only super admins upload or remove one", async () => {
    mockAccess.mockResolvedValue(Response.json({ error: "Forbidden" }, { status: 403 }));
    expect((await call("PUT", { id: 4, file: file(WOFF2) })).status).toBe(403);
    expect((await call("DELETE", { id: 4 })).status).toBe(403);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("saves a real font, refuses anything else, and removes", async () => {
    expect((await call("PUT", { id: 4, file: file(WOFF2) })).status).toBe(200);
    expect(mockSet).toHaveBeenCalledWith(4, expect.objectContaining({ format: "woff2" }));
    expect((await call("PUT", { id: 4, file: file([1, 2, 3, 4]) })).status).toBe(400);
    expect((await call("DELETE", { id: 4 })).status).toBe(200);
    expect(mockSet).toHaveBeenLastCalledWith(4, null);
    mockSet.mockResolvedValue(false);
    expect((await call("DELETE", { id: 99 })).status).toBe(404);
  });
});
