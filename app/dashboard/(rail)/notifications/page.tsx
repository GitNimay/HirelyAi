import { auth } from "@clerk/nextjs/server";
import { Notifications } from "@/components/notifications";
import { listNotifications } from "@/lib/notifications";

export default async function NotificationsPage() {
  const { userId } = await auth.protect();
  return <Notifications initial={await listNotifications(userId)} />;
}
