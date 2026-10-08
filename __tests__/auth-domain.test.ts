import { canonicalLoginRedirect } from "@/lib/auth-domain";

const authUrl = "https://learning.requisor.io";
const request = {
  pathname: "/login/learners-login/",
  search: "?callbackUrl=%2Fapp%2Fdashboard%2F",
  host: "alma.requisor.io",
  method: "GET",
};

describe("canonical OAuth login origin", () => {
  it.each(["/login", "/login/", "/login/learners-login/", "/login/tutors-login/"])(
    "moves %s to the callback host before sign-in",
    pathname => {
      expect(canonicalLoginRedirect({ ...request, pathname }, authUrl, true)?.href)
        .toBe(`${authUrl}${pathname}${request.search}`);
    },
  );

  it("does not loop on the configured host, including its default HTTPS port", () => {
    for (const host of ["learning.requisor.io", "learning.requisor.io:443"]) {
      expect(canonicalLoginRedirect({ ...request, host }, authUrl, true)).toBeNull();
    }
  });

  it.each(["/", "/app/dashboard/", "/api/auth/callback/google/", "/api/auth/signin/google/", "/login-elsewhere/"])(
    "does not redirect unrelated pages or OAuth endpoints: %s",
    pathname => expect(canonicalLoginRedirect({ ...request, pathname }, authUrl, true)).toBeNull(),
  );

  it("never forwards a credential POST, and leaves preview login unchanged", () => {
    expect(canonicalLoginRedirect({ ...request, method: "POST" }, authUrl, true)).toBeNull();
    expect(canonicalLoginRedirect(request, authUrl, false)).toBeNull();
    expect(canonicalLoginRedirect({ ...request, method: "HEAD" }, authUrl, true)?.origin).toBe(authUrl);
  });

  it.each([undefined, "broken", "http://learning.requisor.io", "https://user:password@learning.requisor.io"])(
    "fails closed for missing, insecure or credential-bearing configuration",
    configured => expect(canonicalLoginRedirect(request, configured, true)).toBeNull(),
  );

  it("does not allow request headers or callback parameters to choose the redirect host", () => {
    const result = canonicalLoginRedirect({
      ...request,
      host: "attacker.example",
      search: "?callbackUrl=https%3A%2F%2Fattacker.example%2F",
    }, authUrl, true);
    expect(result?.origin).toBe(authUrl);
    expect(result?.pathname).toBe(request.pathname);
  });
});
