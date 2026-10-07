"use client";

import { useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

// Clerk's <AuthenticateWithRedirectCallback> navigates with router.push, which vinext cancels when setActive
// refreshes the router; full loads can't be cancelled. The ref keeps StrictMode from running it twice.
export function SSOCallback() {
  const clerk = useClerk();
  const { isLoaded } = useAuth();
  const started = useRef(false);
  useEffect(() => {
    if (!isLoaded || started.current) return;
    started.current = true;
    clerk
      .handleRedirectCallback(
        { signInUrl: "/sign-in", signUpUrl: "/sign-up", signInFallbackRedirectUrl: "/dashboard", signUpFallbackRedirectUrl: "/dashboard" },
        async (to) => window.location.assign(to),
      )
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full load on purpose, see above
      .catch(() => window.location.assign("/sign-in"));
  }, [clerk, isLoaded]);
  return null;
}
