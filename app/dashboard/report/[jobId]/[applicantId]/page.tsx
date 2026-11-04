import { redirect } from "next/navigation";

/** Old address (inside the dashboard shell): the report now opens full screen at /report. */
export default async function OldReportPage({ params }: { params: Promise<{ jobId: string; applicantId: string }> }) {
  const { jobId, applicantId } = await params;
  redirect(`/report/${jobId}/${applicantId}`);
}
