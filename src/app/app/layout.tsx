import { AppShell } from "./app-shell";
import "./university-layout.css";
import { currentAccess } from "@/lib/server/access";
import { universityLook, type UploadedFont } from "@/lib/server/universities";
import { themeFontFamily } from "@/lib/theme/fonts";
import { themeCss, type UniversityTheme } from "@/lib/theme/university-theme";

/**
 * Every signed-in page. A member of a university with its own theme gets that
 * theme's colours and font, written into the page before it is shown, so
 * Requisor's teal never flashes first. Super admins, people without a
 * university, and everyone on the public pages keep Requisor's look.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let theme: UniversityTheme | null = null;
  let font: UploadedFont | null = null;
  let universityId = 0;
  try {
    const who = await currentAccess();
    if (who && !who.superAdmin && who.universityId) {
      universityId = who.universityId;
      ({ theme, font } = await universityLook(universityId));
    }
  } catch {
    // The look is never worth failing a page for: Requisor's own is shown.
  }
  return (
    <>
      {/* Only checked #RRGGBB colours and a font family from our own list (see themeCss). */}
      {theme && <style id="university-theme" dangerouslySetInnerHTML={{ __html: themeCss(theme, themeFontFamily(theme.font), font ? { universityId, version: font.version, format: font.format } : undefined) }} />}
      <AppShell layout={theme?.layout ?? null}>{children}</AppShell>
    </>
  );
}
