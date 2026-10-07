import { notFound } from "next/navigation";
import { Icon, navItems } from "@/components/ui";

// ponytail: one placeholder route for every section; split into real pages as each gets built
export const dynamicParams = false;
export const generateStaticParams = () => navItems.filter((n) => !["", "network", "jobs", "companies", "notifications", "me"].includes(n.slug)).map((n) => ({ section: n.slug }));

export default async function SectionPage({ params }: PageProps<"/dashboard/[section]">) {
  const { section } = await params;
  const item = navItems.find((n) => n.slug === section);
  if (!item) notFound();

  return (
    <>
      <header className="sticky top-0 z-10 flex h-14 items-center border-b border-border bg-background/80 px-4 backdrop-blur">
        <h1 className="text-sm font-medium">{item.label}</h1>
      </header>
      <div className="flex flex-col items-center px-4 py-24 text-center">
        <Icon d={item.icon} size={28} className="text-muted" />
        <p className="mt-4 text-sm font-medium">Coming soon</p>
        <p className="mt-1 text-sm text-muted">This section is under construction.</p>
      </div>
    </>
  );
}
