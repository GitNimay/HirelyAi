import { NotificationRowsSkeleton, PageHeader } from "@/components/skeleton";

export default function NotificationsLoading() {
  return (
    <>
      <PageHeader title="Notifications" tabs={["All", "Posts", "Network", "Jobs"]} />
      <NotificationRowsSkeleton />
    </>
  );
}
