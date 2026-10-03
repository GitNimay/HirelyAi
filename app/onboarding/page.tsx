import { redirect } from "next/navigation";
import { Onboarding } from "@/components/onboarding";
import { signedIn } from "@/lib/profile";

export const metadata = { title: "Set up your profile | Hire Excellence" };

export default async function OnboardingPage() {
  const session = await signedIn();
  if (!session) redirect("/sign-in");
  const { account, me } = session;
  if (me.onboarded) redirect("/dashboard");
  return (
    <Onboarding
      initial={{
        name: me.name === "Member" ? "" : me.name,
        email: account.email,
        phone: account.phone,
      }}
    />
  );
}
