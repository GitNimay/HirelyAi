import { CommentsSkeleton, Loading, PageHeader, PostSkeleton, Skeleton } from "@/components/skeleton";

/** A shared post, comments open. */
export default function PostLoading() {
  return (
    <>
      <PageHeader title="Post" back />
      <Loading label="Loading post…">
        <PostSkeleton i={2}>
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 w-16" />
            </div>
            <CommentsSkeleton n={3} />
          </div>
        </PostSkeleton>
      </Loading>
    </>
  );
}
