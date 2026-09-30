import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ProfileForm } from "@/components/profile";
import { getProfile } from "@/lib/profile";

export const metadata = { title: "Edit profile | Hire Excellence" };

export default async function EditProfilePage() {
  const { userId } = await auth.protect();
  const profile = await getProfile(userId, userId);
  if (!profile) notFound();
  return <ProfileForm profile={profile} />;
}
