import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AiReportView } from "@/components/ai-interview/report";
import { aiReport } from "@/lib/ai-interview/session";

export const metadata = { title: "Interview report | Hire Excellence" };

/** Full-width AI interview report for the job's poster (outside the feed rail: the replay needs the room). */
export default async function ReportPage({ params }: { params: Promise<{ jobId: string; applicantId: string }> }) {
  const { userId } = await auth.protect();
  const { jobId, applicantId } = await params;
  const data = await aiReport(userId, jobId, applicantId);
  if (!data) notFound();
  return (
    <main id="main" className="min-w-0 flex-1 pb-[calc(10rem+env(safe-area-inset-bottom))] sm:pb-10">
      <AiReportView data={data} />
    </main>
  );
}
