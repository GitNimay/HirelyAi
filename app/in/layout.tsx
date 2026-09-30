import type { ReactNode } from "react";
import RailLayout from "@/app/dashboard/(rail)/layout";
import DashboardLayout from "@/app/dashboard/layout";

/** Profiles live at /in/<handle> instead of under /dashboard, but keep the same nav rail and centered column. */
export default function InLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardLayout params={Promise.resolve({})}>
      <RailLayout>{children}</RailLayout>
    </DashboardLayout>
  );
}
