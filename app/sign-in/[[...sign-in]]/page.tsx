import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  // Signed in already (e.g. the refresh Clerk runs right after a sign-in completes): go to the app, or back to the
  // shared report that sent them here
  if ((await auth()).userId) {
    const { next } = await searchParams;
    redirect(next && /^\/r\/[0-9a-f]{32}$/.test(next) ? next : "/dashboard");
  }
  return <SignInForm />;
}
