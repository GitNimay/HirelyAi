import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import { ResumeSections } from "@/components/resume-view";
import { profileHref } from "@/lib/profile-fields";
import { getResume } from "@/lib/resume";
import { profileFor, refOf } from "../data";

/** A member's experience, education, projects and skills, when they chose to show them. Never contact details. */
export default async function AboutTab({ params }: { params: Promise<{ handle: string }> }) {
  const { userId } = await auth.protect();
  const profile = await profileFor(userId, await refOf(params));
  if (!profile) notFound();
  if (profile.id === userId) redirect(`${profileHref(profile)}/resume`);
  const r = profile.resumePublic ? await getResume(profile.id) : null;
  if (!r) notFound();

  return (
    <div className="space-y-6 px-4 py-5">
      <ResumeSections r={r} />
    </div>
  );
}
