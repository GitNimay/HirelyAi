"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the page every minute (the server re-checks at most that often) and shows when it last checked, with date and timezone. */
export function Refresh({ at }: { at: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(id);
  }, [router]);
  return (
    <span suppressHydrationWarning className="tabular-nums">
      Updated{" "}
      {new Date(at).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })}
    </span>
  );
}
