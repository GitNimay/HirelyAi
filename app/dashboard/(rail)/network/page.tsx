import { auth } from "@clerk/nextjs/server";
import { Network } from "@/components/network";
import { getNetwork, syncDirectory } from "@/lib/network";

export default async function NetworkPage() {
  const { userId } = await auth.protect();
  await syncDirectory();
  return <Network initial={await getNetwork(userId)} />;
}
