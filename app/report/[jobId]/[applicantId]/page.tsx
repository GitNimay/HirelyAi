import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AiReportView } from "@/components/ai-interview/report";
import { aiReport } from "@/lib/ai-interview/session";

export const metadata = { title: "Interview report | Hirely AI", robots: { index: false } };

/** The poster's AI interview report: full screen, outside the dashboard shell, like the interview room. */
export default async function ReportPage({ params }: { params: Promise<{ jobId: string; applicantId: string }> }) {
  const { userId } = await auth.protect();
  const { jobId, applicantId } = await params;
  const data = await aiReport(userId, jobId, applicantId);
  if (!data) notFound();
  return <AiReportView data={data} />;
}
