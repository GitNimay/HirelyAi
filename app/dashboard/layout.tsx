import { SignOutButton } from "@clerk/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { Logo } from "@/components/auth";
import { Nav } from "@/components/nav";
import { Avatar, Icon, icons } from "@/components/ui";
import { viewerOf } from "@/lib/profile";
import { unseenCount } from "@/lib/notifications";

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  await auth.protect();
  const user = await currentUser();
  // Name and photo come from D1 (editable on the profile), not Clerk
  const me = user ? await viewerOf(user) : null;
  const name = me?.name ?? "You";
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const unseen = user ? await unseenCount(user.id) : 0;

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-1 justify-center">
      {/* Vertical navbar */}
      <aside className="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border px-3 py-4 sm:flex sm:w-[72px] xl:w-[240px]">
        <Link href="/dashboard" className="mb-6 flex h-10 items-center justify-center gap-2 px-1 xl:justify-start">
          <Logo size={28} />
          <span className="hidden text-sm font-semibold tracking-tight xl:inline">Hire Excellence</span>
        </Link>
        <Nav unseen={unseen} me={me?.handle ?? ""} />
        <div className="mt-auto flex items-center justify-center gap-3 xl:justify-start xl:px-2">
          <Avatar name={name} src={me?.imageUrl} size={32} />
          <div className="hidden min-w-0 flex-1 xl:block">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          <SignOutButton>
            <button type="button" title="Sign out" className="hidden rounded-md p-1.5 text-muted transition-colors hover:bg-surface hover:text-foreground xl:block">
              <Icon d={icons.logout} size={16} />
            </button>
          </SignOutButton>
        </div>
      </aside>
      {/* Phone: bottom tab bar (the aside is hidden) */}
      <div className="sm:hidden"><Nav unseen={unseen} me={me?.handle ?? ""} /></div>

      {children}
    </div>
  );
}
