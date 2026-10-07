import { Logo } from "@/components/auth";
import { FieldSkeleton, Line, Loading, Skeleton } from "@/components/skeleton";

const STEPS = ["Your details", "Choose a method", "Review profile", "All set"];

/** components/onboarding.tsx: title | card | steps, with the details card as placeholders. */
export default function OnboardingLoading() {
  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <span className="flex items-center gap-2.5">
          <Logo size={28} />
          <span className="text-sm font-medium tracking-tight">Hire Excellence</span>
        </span>
        <Skeleton className="h-8 w-[72px]" />
      </header>
      <div className="grid flex-1 border-t border-dashed border-border lg:grid-cols-[1fr_minmax(0,680px)_1fr]">
        <aside className="hidden justify-end px-8 pt-10 lg:flex">
          <p className="text-sm font-medium">Set up your profile</p>
        </aside>
        <main className="border-dashed border-border px-4 py-8 sm:py-10 lg:border-x lg:px-6">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            {STEPS.map((s, i) => <span key={s} className={`h-1 flex-1 rounded-full ${i === 0 ? "bg-foreground" : "bg-border"}`} />)}
          </div>
          <Loading className="space-y-5 border border-border bg-background px-6 pt-6 pb-6 sm:px-8 sm:pt-8">
            <div>
              <Line className="text-xl" w="45%" />
              <Line className="mt-1 text-sm" w="85%" />
            </div>
            <FieldSkeleton w="18%" label="text-sm" h="h-10" />
            <div className="grid gap-5 sm:grid-cols-2">
              <FieldSkeleton w="35%" label="text-sm" h="h-10" />
              <FieldSkeleton w="30%" label="text-sm" h="h-10" />
            </div>
            <FieldSkeleton w="35%" label="text-sm" h="h-10" />
            <div className="flex justify-end border-t border-border pt-5"><Skeleton className="h-10 w-28" /></div>
          </Loading>
        </main>
        <aside className="hidden px-8 pt-10 lg:block">
          <ol className="space-y-3 text-sm">
            {STEPS.map((s, i) => (
              <li key={s} className={`flex items-center gap-2.5 ${i === 0 ? "font-medium text-foreground" : "text-muted"}`}>
                <span className={`mx-[4px] size-1.5 rounded-full ${i === 0 ? "bg-foreground" : "bg-border"}`} />
                {s}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
