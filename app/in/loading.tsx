import { PostsSkeleton, ProfileHeaderSkeleton } from "@/components/skeleton";

/** Opening a profile: the header and the first tab load together. */
export default function ProfileLoading() {
  return (
    <>
      <ProfileHeaderSkeleton />
      <PostsSkeleton label="Loading profile…" />
    </>
  );
}
