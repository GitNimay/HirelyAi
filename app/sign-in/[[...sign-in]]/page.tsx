import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth";

export default async function SignInPage() {
  // Signed in already (e.g. the refresh Clerk runs right after a sign-in completes): go to the app
  if ((await auth()).userId) redirect("/dashboard");
  return <SignInForm />;
}
