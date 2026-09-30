import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { signedIn } from "@/lib/profile";

export const metadata = { title: "Set up your profile | Hire Excellence" };

export default async function OnboardingPage() {
  const session = await signedIn();
  if (!session) redirect("/sign-in");
  const { user, me } = session;
  if (me.onboarded) redirect("/dashboard");
  return (
    <Onboarding
      initial={{
        name: me.name === "Member" ? "" : me.name,
        email: user.primaryEmailAddress?.emailAddress ?? "",
        phone: (user.unsafeMetadata.phone as string | undefined) || user.primaryPhoneNumber?.phoneNumber || "",
      }}
    />
  );
}
