import { auth } from "@clerk/nextjs/server";
import { Notifications, type NotificationTab } from "@/components/notifications";
import { listNotifications } from "@/lib/notifications";

export const metadata = { title: "Notifications | Hire Excellence" };

const TABS: NotificationTab[] = ["all", "posts", "network", "jobs"];

export default async function NotificationsPage({ searchParams }: PageProps<"/dashboard/notifications">) {
  const { userId } = await auth.protect();
  const { tab } = await searchParams;
  return <Notifications initial={await listNotifications(userId)} initialTab={TABS.find((t) => t === tab)} />;
}
