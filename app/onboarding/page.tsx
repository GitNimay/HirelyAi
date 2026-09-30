import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { viewerOf } from "@/lib/profile";

export const metadata = { title: "Set up your profile | Hire Excellence" };

export default async function OnboardingPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const me = await viewerOf(user);
  if (me.onboarded) redirect("/dashboard");
  return (
    <Onboarding
      initial={{
        name: me.name === "Member" ? "" : me.name,
        email: user.primaryEmailAddress?.emailAddress ?? "",
        phone: user.primaryPhoneNumber?.phoneNumber ?? "",
      }}
    />
  );
}
