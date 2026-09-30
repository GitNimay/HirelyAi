import type { ReactNode } from "react";

/** Centered feed column. Pages outside this group can use the full width. */
export default function RailLayout({ children }: { children: ReactNode }) {
  return <main id="main" className="min-w-0 flex-1 pb-[calc(4rem+env(safe-area-inset-bottom))] sm:max-w-[640px] sm:border-r sm:border-border sm:pb-0">{children}</main>;
}
