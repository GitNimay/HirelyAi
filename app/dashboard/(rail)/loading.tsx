import { Loading, Line, PostsSkeleton, Skeleton } from "@/components/skeleton";

/** Home: For you / Following tabs, composer, then posts. */
export default function HomeLoading() {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 border-b border-border bg-background/80 backdrop-blur">
        <span className="relative flex flex-1 items-center justify-center text-sm font-medium">
          For you
          <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-12 rounded-full bg-link" />
        </span>
        <span className="flex flex-1 items-center justify-center text-sm text-muted">Following</span>
      </header>
      <Loading label="Loading your feed…">
        <div className="flex gap-3 border-b border-border p-4">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <div className="h-[53px] pt-2 text-sm"><Line w="55%" /></div>
            <div className="mt-2 flex h-8 items-center justify-between">
              <Skeleton className="h-8 w-40 rounded-lg" />
              <Skeleton className="h-8 w-16 rounded-lg" />
            </div>
          </div>
        </div>
      </Loading>
      <PostsSkeleton n={4} />
    </>
  );
}
