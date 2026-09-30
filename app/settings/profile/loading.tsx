import { FieldSkeleton, Loading, PageHeader, Skeleton } from "@/components/skeleton";

/** components/profile.tsx ProfileForm: cover, 88px avatar, then the fields. */
export default function EditProfileLoading() {
  return (
    <div className="space-y-4 pb-8">
      <PageHeader title="Edit profile" back className="gap-4 px-4" action={<Skeleton className="h-8 w-14" />} />
      <Loading label="Loading your profile…" className="space-y-4">
        <Skeleton className="aspect-[3/1] rounded-none" />
        <div className="px-5">
          <div className="-mt-14 w-fit rounded-full border-4 border-background bg-background">
            <Skeleton className="size-[88px] rounded-full" />
          </div>
        </div>
        <div className="space-y-4 px-5">
          <FieldSkeleton w="10%" />
          <FieldSkeleton w="45%" />
          <FieldSkeleton w="12%" h="h-[98px]" />
          <div className="grid gap-4 sm:grid-cols-2"><FieldSkeleton w="45%" /><FieldSkeleton w="45%" /></div>
          <FieldSkeleton w="40%" />
        </div>
      </Loading>
    </div>
  );
}
