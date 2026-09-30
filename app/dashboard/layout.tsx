import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/account-menu";
import { Logo } from "@/components/auth";
import { Nav } from "@/components/nav";
import { viewerOf } from "@/lib/profile";
import { unseenCount } from "@/lib/notifications";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await auth.protect();
  const user = await currentUser();
  // Name and photo come from D1 (editable on the profile), not Clerk
  const [me, unseen] = user ? await Promise.all([viewerOf(user), unseenCount(user.id)]) : [null, 0];
  // New members set up their profile first
  if (me && !me.onboarded) redirect("/onboarding");
  const name = me?.name ?? "You";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 justify-center">
      {/* Vertical navbar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border px-3 py-4 sm:flex sm:w-[72px] xl:w-[240px]">
        <Link href="/dashboard" className="mb-6 flex h-10 items-center justify-center gap-2 px-1 xl:justify-start">
          <Logo size={28} />
          <span className="hidden text-sm font-semibold tracking-tight xl:inline">Hire Excellence</span>
        </Link>
        <Nav unseen={unseen} me={me?.handle ?? ""} />
        <AccountMenu name={name} email={email} imageUrl={me?.imageUrl} />
      </aside>
      {/* Phone: bottom tab bar (the aside is hidden) */}
      <div className="sm:hidden"><Nav unseen={unseen} me={me?.handle ?? ""} /></div>

      {children}
    </div>
  );
}
