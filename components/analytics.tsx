"use client";

import { useUser } from "@clerk/nextjs";
import posthog from "posthog-js";
import { useEffect } from "react";

// Same cookie the server reads (lib/analytics.ts OPT_OUT_COOKIE); "off" = the member turned usage analytics off
const optedOut = () => /(?:^|; )analytics=off(?:;|$)/.test(document.cookie);

// Emails and phone numbers anywhere in recorded page text (applicant lists, profiles) become asterisks
const PRIVATE = /[^\s@]+@[^\s@]+\.[a-z]{2,}|\+?\d[\d\s().-]{7,}\d/gi;

function start() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || posthog.__loaded) return;
  posthog.init(key, {
    api_host: "/relay", // worker/index.ts proxies it to PostHog
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only", // anonymous landing visitors stay cheap events, not people
    capture_exceptions: true,
    // Which pages record is set in PostHog (URL triggers): dashboard, jobs, companies, posts. Never sign-in, onboarding, interviews.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "*",
      maskTextFn: (text) => text.replace(PRIVATE, (m) => "*".repeat(m.length)),
      recordHeaders: false,
      recordBody: false,
    },
  });
  // Only called with the cookie on: clear an opt-out PostHog kept in storage from an earlier "off"
  if (posthog.has_opted_out_capturing()) posthog.opt_in_capturing();
}

/** Turn usage analytics on or off for this browser (Settings → Account). Server events check the same cookie. */
export function setAnalytics(on: boolean) {
  document.cookie = `analytics=${on ? "on" : "off"}; path=/; max-age=31536000; samesite=lax`;
  if (!posthog.__loaded) return on && start();
  if (on) posthog.opt_in_capturing();
  else posthog.opt_out_capturing();
}

export const analyticsOn = () => !optedOut();

/** Starts PostHog once, and ties it to the Clerk user: their id is the distinct id, nothing else about them is sent. */
export function Analytics() {
  const { isLoaded, user } = useUser();
  useEffect(() => {
    if (!optedOut()) start();
  }, []);
  useEffect(() => {
    if (!isLoaded || !posthog.__loaded) return;
    if (user && posthog.get_distinct_id() !== user.id) posthog.identify(user.id);
    // Signed out after being someone (any sign-out button): the next person on this browser starts fresh
    else if (!user && posthog.get_distinct_id().startsWith("user_")) posthog.reset();
  }, [isLoaded, user]);
  return null;
}
