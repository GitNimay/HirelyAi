import { auth } from "@clerk/nextjs/server";
import { Landing } from "@/components/landing";

export default async function Home() {
  // Everyone gets the landing page; signed-in visitors see "Dashboard" in place of the sign-up prompts
  const { userId } = await auth();
  return <Landing signedIn={!!userId} />;
}
