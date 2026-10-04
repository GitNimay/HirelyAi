import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { PostJobForm } from "@/components/jobs";
import { getJob, jobQuestions } from "@/lib/jobs";

export const metadata = { title: "Edit job | Hire Excellence" };

/** The post form, filled in, for the job's poster only. */
export default async function EditJobPage({ params }: PageProps<"/dashboard/jobs/[id]/edit">) {
  const { userId } = await auth.protect();
  const { id } = await params;
  const [job, questions] = await Promise.all([getJob(userId, id), jobQuestions(userId, id)]);
  if (!job || job.poster.id !== userId) notFound();
  return <PostJobForm companies={[]} job={{ ...job, questions }} />;
}
