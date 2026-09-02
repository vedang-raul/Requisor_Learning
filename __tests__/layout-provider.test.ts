import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPLAY_TOUR_KEY } from "@/lib/utils";

describe("application layout providers", () => {
  it("keeps the replay-tour key in the shared utility module", () => {
    expect(REPLAY_TOUR_KEY).toBe("requisor-replay-onboarding-tour");
  });

  it("wraps every route in one root store provider", () => {
    const rootLayout = readFileSync(join(process.cwd(), "app/layout.tsx"), "utf8");
    const appLayout = readFileSync(join(process.cwd(), "app/app/layout.tsx"), "utf8");

    expect(rootLayout).toContain('import { Providers } from "@/components/providers"');
    expect(rootLayout).toContain('import { StoreProvider } from "@/lib/store"');
    expect(rootLayout).toMatch(/<Providers>\s*<StoreProvider>\{children\}<\/StoreProvider>\s*<\/Providers>/);
    expect(rootLayout.match(/<StoreProvider>/g)).toHaveLength(1);
    expect(appLayout).not.toContain("<StoreProvider>");
  });
});