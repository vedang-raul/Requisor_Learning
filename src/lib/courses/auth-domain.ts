/**
 * OAuth state/PKCE cookies belong to the host that starts sign-in. Move public
 * login navigation to the configured callback origin before any cookies are
 * created. Never forward credential POSTs or OAuth callbacks between hosts.
 */
export function canonicalLoginRedirect(
  request: { pathname: string; search: string; host: string; method: string },
  authUrl: string | undefined,
  isProduction: boolean,
): URL | null {
  if (
    !isProduction ||
    !authUrl ||
    !["GET", "HEAD"].includes(request.method) ||
    !/^\/login(?:\/|$)/.test(request.pathname)
  ) return null;

  try {
    const configured = new URL(authUrl);
    const incoming = new URL(`https://${request.host}`);
    if (
      configured.protocol !== "https:" ||
      configured.username || configured.password ||
      incoming.username || incoming.password ||
      incoming.pathname !== "/" || incoming.search || incoming.hash ||
      configured.host.toLowerCase() === incoming.host.toLowerCase()
    ) return null;

    // The destination comes only from server configuration, never query input
    // or forwarded headers. Retain the learner/tutor page and its query.
    return new URL(request.pathname + request.search, configured.origin);
  } catch {
    return null;
  }
}
