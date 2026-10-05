import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountMenu } from "@/components/account-menu";
import { Logo } from "@/components/auth";
import { Nav } from "@/components/nav";
import { PostButton } from "@/components/post-button";
import { QuickNotifications } from "@/components/notifications";
import { ProfileCard } from "@/components/profile-card";
import { getSummary, signedIn } from "@/lib/profile";
import { latestNotifications, unseenCount } from "@/lib/notifications";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const { userId } = await auth.protect();
  // Name and photo come from D1 (editable on the profile), not Clerk
  const [session, unseen, summary, latest] = await Promise.all([signedIn(), unseenCount(userId), getSummary(userId), latestNotifications(userId)]);
  const me = session?.me;
  // New members set up their profile first
  if (me && !me.onboarded) redirect("/onboarding");
  const name = me?.name ?? "You";
  const email = session?.account.email ?? "";

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 justify-center">
      <a href="#main" className="sr-only rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50">
        Skip to content
      </a>
      {/* Vertical navbar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border px-3 py-4 sm:flex sm:w-[72px] xl:w-[240px]">
        <Link href="/dashboard" className="mb-6 flex h-10 items-center justify-center gap-2 px-1 xl:justify-start">
          <Logo size={28} faint={false} />
          <span className="hidden text-sm font-semibold tracking-tight xl:inline">Hire Excellence</span>
        </Link>
        <Nav unseen={unseen} me={me?.handle ?? ""} />
        <div className="mt-auto space-y-4 border-t border-border pt-4">
          <PostButton viewer={{ id: userId, name, imageUrl: me?.imageUrl }} />
          <AccountMenu name={name} email={email} imageUrl={me?.imageUrl} />
        </div>
      </aside>
      {/* Phone: bottom tab bar (the aside is hidden) */}
      <div className="sm:hidden"><Nav unseen={unseen} me={me?.handle ?? ""} /></div>

      {children}

      {/* Right rail: your profile summary, on every dashboard screen (wide screens only) */}
      {me && summary && (
        <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 space-y-4 overflow-y-auto px-5 py-4 lg:block">
          <ProfileCard me={me} summary={summary} />
          <QuickNotifications initial={latest} />
        </aside>
      )}
    </div>
  );
}
