import { clerkMiddleware } from "@clerk/nextjs/server";

// Middleware only attaches the session. Each page, route handler and server action checks auth
// itself (Clerk's recommendation; path-matched protection can drift from real routing).
export default clerkMiddleware();

export const config = {
  // Explicit app routes: vinext rejects Clerk's usual negative-lookahead matcher as ReDoS-prone,
  // and this keeps static and Vite dev assets out of middleware.
  matcher: ["/", "/dashboard/:path*", "/in/:path*", "/settings/:path*", "/onboarding", "/sign-in/:path*", "/sign-up/:path*", "/sso-callback", "/(api|trpc)(.*)", "/__clerk/:path*"],
};
