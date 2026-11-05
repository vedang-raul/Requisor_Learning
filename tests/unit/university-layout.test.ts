import { arrangeNav, DEFAULT_LAYOUT, NAV_ENTRIES, navHidden, navName, readLayout } from "@/lib/theme/university-layout";
import { readTheme, sameTheme } from "@/lib/theme/university-theme";

describe("university layouts", () => {
  it("cleans a submitted layout: unknown values fall back, unknown and repeated entries go, missing ones are added", () => {
    const layout = readLayout({
      sidebarSide: "top",
      sidebarStyle: "dark",
      sidebarStart: "collapsed",
      nav: [
        { key: "profile", label: "  My   <b>account</b>  " },
        { key: "nope" },
        { key: "profile", label: "Again" },
        { key: "dashboard", hidden: true },
        { key: "badges", hidden: true, label: "Badges" },
      ],
      topbar: { search: false, xp: "no", compact: true },
    })!;
    expect(layout.sidebarSide).toBe("left");
    expect(layout.sidebarStyle).toBe("dark");
    expect(layout.sidebarStart).toBe("collapsed");
    expect(layout.nav.slice(0, 3)).toEqual([
      { key: "profile", label: "My baccount/b" },
      { key: "dashboard" }, // the dashboard can't be hidden
      { key: "badges", hidden: true }, // a name equal to the default isn't stored
    ]);
    expect(layout.nav.map((n) => n.key).sort()).toEqual(NAV_ENTRIES.map((e) => e.key).sort());
    expect(layout.topbar).toEqual({ search: false, xp: true, mode: true, logo: false, compact: true });
    expect(readLayout(null)).toBeNull();
    expect(readLayout([])).toBeNull();
    expect(readLayout({})).toEqual(DEFAULT_LAYOUT);
  });

  it("keeps names to the length limit", () => {
    expect(readLayout({ nav: [{ key: "paths", label: "x".repeat(60) }] })!.nav[0].label).toHaveLength(28);
  });

  it("arranges a person's menu in the university's order and words, without hidden items", () => {
    const layout = readLayout({ nav: [{ key: "profile", label: "Account" }, { key: "submissions", hidden: true }, { key: "dashboard", label: "Home" }] })!;
    const items = [
      { href: "/app/dashboard/", label: "Dashboard" },
      { href: "/app/submissions/", label: "Submissions" },
      { href: "/app/badges/", label: "Badges" },
      { href: "/app/settings/", label: "Profile" },
      { href: "/app/elsewhere/", label: "Other" },
    ];
    expect(arrangeNav(items, layout).map((i) => i.label)).toEqual(["Account", "Home", "Badges", "Other"]);
    expect(arrangeNav(items, DEFAULT_LAYOUT).map((i) => i.label)).toEqual(["Dashboard", "Badges", "Submissions", "Profile", "Other"]);
    expect(navName(layout, "profile")).toBe("Account");
    expect(navName(layout, "paths")).toBe("Learning Paths");
    expect(navHidden(layout, "submissions")).toBe(true);
    expect(navHidden(layout, "badges")).toBe(false);
  });

  it("is part of a theme, and a changed layout is a changed theme", () => {
    const colours = { primary: "#7a0019", secondary: "#ffcc33", background: "#f7f7f7", sidebar: "#ffffff", font: "lora" };
    const withLayout = readTheme({ ...colours, layout: { sidebarSide: "right" } })!;
    expect(withLayout.layout?.sidebarSide).toBe("right");
    expect(readTheme(colours)!.layout).toBeUndefined();
    expect(sameTheme(readTheme(colours)!, withLayout)).toBe(false);
    expect(sameTheme(withLayout, readTheme({ ...colours, layout: { sidebarSide: "right" } })!)).toBe(true);
  });
});
