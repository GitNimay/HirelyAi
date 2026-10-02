import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { AdminList, CompanyForm } from "@/components/company";
import { listAdmins } from "@/lib/companies";
import { companyFor, slugOf } from "../data";

export const metadata = { title: "Edit page | Hire Excellence" };

export default async function EditCompanyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { userId } = await auth.protect();
  const c = await companyFor(userId, await slugOf(params));
  if (!c?.me.role) notFound();
  return (
    <>
      <CompanyForm company={c} />
      <AdminList company={c} admins={await listAdmins(c.id)} viewerId={userId} />
    </>
  );
}
