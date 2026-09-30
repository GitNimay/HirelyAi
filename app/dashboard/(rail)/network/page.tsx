import { auth } from "@clerk/nextjs/server";
import { Network } from "@/components/network";
import { getNetwork } from "@/lib/network";

export default async function NetworkPage() {
  const { userId } = await auth.protect();
  return <Network initial={await getNetwork(userId)} />;
}
