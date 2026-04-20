"use client";

/**
 * apiFetch wraps window.fetch for client components.
 *
 * - On HTTP 401, forces a full-page navigation to /sign-in with a ?returnTo so
 *   the user lands back on the current page after re-authenticating. This
 *   prevents the "toast hell" that happens when sessions silently expire and
 *   every mutation quietly fails.
 * - On HTTP 403, throws a typed ApiForbiddenError so pages can render a
 *   scoped "you don't have access" message.
 * - Otherwise behaves exactly like fetch().
 */

export class ApiUnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "ApiUnauthorizedError";
  }
}

export class ApiForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ApiForbiddenError";
  }
}

let redirecting = false;

function redirectToSignIn() {
  if (redirecting) return;
  if (typeof window === "undefined") return;
  redirecting = true;
  // Clerk's <SignIn /> reads `redirect_url` to route back after auth.
  const returnTo = `${window.location.pathname}${window.location.search}`;
  const url = `/sign-in?redirect_url=${encodeURIComponent(returnTo)}`;
  window.location.assign(url);
}

export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status === 401) {
    redirectToSignIn();
    throw new ApiUnauthorizedError();
  }
  if (res.status === 403) {
    throw new ApiForbiddenError();
  }
  return res;
}
