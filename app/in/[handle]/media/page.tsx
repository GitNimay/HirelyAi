import { TimelineTab } from "../tab";

export default function Page({ params }: { params: Promise<{ handle: string }> }) {
  return <TimelineTab params={params} tab="media" />;
}
