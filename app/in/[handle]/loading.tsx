import { PostsSkeleton } from "@/components/skeleton";

/** Switching to Posts or Likes: the header stays, only the tab body loads. */
export default function TabLoading() {
  return <PostsSkeleton />;
}
