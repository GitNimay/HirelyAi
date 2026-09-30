import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ResumeForm } from "@/components/resume-editor";
import { getResume } from "@/lib/resume";

export const metadata = { title: "Edit resume | Hire Excellence" };

export default async function EditResumePage() {
  const { userId } = await auth.protect();
  const resume = await getResume(userId);
  if (!resume) redirect("/onboarding");
  return <ResumeForm initial={resume} />;
}
