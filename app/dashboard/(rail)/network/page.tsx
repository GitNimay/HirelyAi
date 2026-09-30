import { auth } from "@clerk/nextjs/server";
import { Network, type NetworkTab } from "@/components/network";
import { getNetwork } from "@/lib/network";

export const metadata = { title: "My Network | Hire Excellence" };

const TABS: NetworkTab[] = ["grow", "connections", "sent"];

export default async function NetworkPage({ searchParams }: PageProps<"/dashboard/network">) {
  const { userId } = await auth.protect();
  const { tab } = await searchParams;
  return <Network initial={await getNetwork(userId)} initialTab={TABS.find((t) => t === tab)} />;
}
