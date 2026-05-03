import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// Routes that must NEVER force sign-in. Everything else under the middleware matcher requires auth.
// Keep this list in sync with the public surface area of the product.
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/pricing",
  "/try",
  "/status",
  "/security",
  "/privacy-policy",
  "/terms-of-service",
  "/roadmap",
  "/changelog(.*)",
  "/docs(.*)",
  "/compare(.*)",
  "/oauth/authorize",
  "/shared/(.*)",
  "/llms.txt",
  "/robots.txt",
  "/sitemap.xml",
  "/favicon.ico",
  "/opengraph-image(.*)",
  // Public API surfaces — these hand-check their own auth (or are fully public).
  "/api/webhooks/(.*)",
  "/api/try-screenshot(.*)",
  "/api/shared/(.*)",
  "/api/docs-markdown(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
