import { Loading, PageHeader, Skeleton } from "@/components/skeleton";

export default function SectionLoading() {
  return (
    <>
      <PageHeader />
      <Loading className="flex flex-col items-center px-4 py-24">
        <Skeleton className="size-7 rounded-full" />
        <Skeleton className="mt-4 h-4 w-28" />
        <Skeleton className="mt-2 h-4 w-52" />
      </Loading>
    </>
  );
}
