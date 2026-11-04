import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AiReportView } from "@/components/ai-interview/report";
import { sharedReport } from "@/lib/ai-interview/session";

export const metadata = { title: "Interview report | Hire Excellence", robots: { index: false } };

/** A shared report: no sign-in for the scores and work; the recording and transcript ask for one. */
export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { userId } = await auth();
  const { token } = await params;
  const data = await sharedReport(token, !!userId);
  if (!data) notFound();
  return <AiReportView data={data} shareKey={token} />;
}
