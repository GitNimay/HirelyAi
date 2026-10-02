import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileVisibility } from "@/components/profile";
import { ResumeSections } from "@/components/resume-view";
import { btnOutline, btnPrimary, Icon, icons } from "@/components/ui";
import { companiesByIds } from "@/lib/companies";
import { getResume } from "@/lib/resume";
import { profileFor, refOf } from "../data";

const download = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3";

/** Your full resume (only you see contact details); jobs you apply to get it as a PDF. Visibility settings live here. */
export default async function ResumeTab({ params }: { params: Promise<{ handle: string }> }) {
  const { userId } = await auth.protect();
  const [profile, r] = await Promise.all([profileFor(userId, await refOf(params)), getResume(userId)]);
  if (!profile || profile.id !== userId || !r) notFound();
  const companies = await companiesByIds(r.experience.flatMap((e) => e.companyId ?? []));

  return (
    <div className="space-y-6 px-4 py-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Jobs you apply to get this as a PDF. Contact details are always private.</p>
        <div className="flex gap-2">
          <a href="/api/resume" download className={btnOutline}><Icon d={download} size={14} />Download PDF</a>
          <Link href="/settings/resume" className={btnPrimary}><Icon d={icons.edit} size={14} />Edit resume</Link>
        </div>
      </div>
      <ProfileVisibility resumePublic={profile.resumePublic} openToWork={profile.openToWork} />
      <ResumeSections r={r} own companies={companies} />
    </div>
  );
}
