import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ProfileVisibility } from "@/components/profile";
import { ExperienceManager } from "@/components/resume-editor";
import { ResumeSections } from "@/components/resume-view";
import { companiesByIds } from "@/lib/companies";
import { getResume } from "@/lib/resume";
import { profileFor, refOf } from "../data";

/**
 * A member's summary, experience, education, projects and skills. Never contact details.
 * Others see it only when the member chose to show it; on your own profile you edit experience right here,
 * and it's the same resume your Resume tab and PDF use.
 */
export default async function AboutTab({ params }: { params: Promise<{ handle: string }> }) {
  const { userId } = await auth.protect();
  const profile = await profileFor(userId, await refOf(params));
  if (!profile) notFound();
  const own = profile.id === userId;
  const r = own || profile.resumePublic ? await getResume(profile.id) : null;
  if (!r) notFound();
  const companies = await companiesByIds(r.experience.flatMap((e) => e.companyId ?? []));

  return (
    <div className="space-y-6 px-4 py-5">
      {own && !profile.resumePublic && <ProfileVisibility resumePublic={false} openToWork={profile.openToWork} />}
      <ResumeSections r={r} companies={companies} experience={own ? <ExperienceManager resume={r} companies={companies} /> : undefined} />
    </div>
  );
}
