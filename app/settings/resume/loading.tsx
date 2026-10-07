import { PageHeader, ResumeEditorSkeleton, Skeleton } from "@/components/skeleton";

export default function EditResumeLoading() {
  return (
    <div className="pb-8">
      <PageHeader title="Edit resume" back className="gap-4 px-4" action={<Skeleton className="h-8 w-14 rounded-lg" />} />
      <div className="px-4 pt-5 sm:px-5"><ResumeEditorSkeleton /></div>
    </div>
  );
}
