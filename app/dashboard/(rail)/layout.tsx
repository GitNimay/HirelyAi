import type { ReactNode } from "react";

/** Centered feed column. Pages outside this group can use the full width. */
export default function RailLayout({ children }: { children: ReactNode }) {
  return <main className="min-w-0 flex-1 pb-16 sm:max-w-[640px] sm:border-r sm:border-border sm:pb-0">{children}</main>;
}
