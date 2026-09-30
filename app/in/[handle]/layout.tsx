import { auth } from "@clerk/nextjs/server";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ProfileHeader } from "@/components/profile";
import { profileFor, refOf } from "./data";

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  const { userId } = await auth();
  const p = userId ? await profileFor(userId, await refOf(params)) : null;
  return { title: p ? `${p.name} | Hire Excellence` : "Hire Excellence" };
}

export default async function ProfileLayout({ children, params }: { children: ReactNode; params: Promise<{ handle: string }> }) {
  const { userId } = await auth.protect();
  const ref = await refOf(params);
  const profile = await profileFor(userId, ref);
  if (!profile) notFound();
  // Older links and fallbacks use the user id; show the clean URL
  if (profile.handle && ref !== profile.handle) redirect(`/in/${profile.handle}`);

  return (
    <>
      <ProfileHeader profile={profile} own={profile.id === userId} />
      {children}
    </>
  );
}
