import { TimelineTab } from "./tab";

export default function PostsPage({ params }: { params: Promise<{ handle: string }> }) {
  return <TimelineTab params={params} tab="posts" />;
}
