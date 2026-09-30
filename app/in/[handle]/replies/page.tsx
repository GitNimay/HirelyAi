import { RepliesTab } from "../tab";

export default function RepliesPage({ params }: { params: Promise<{ handle: string }> }) {
  return <RepliesTab params={params} />;
}
