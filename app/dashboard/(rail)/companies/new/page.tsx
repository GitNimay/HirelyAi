import { auth } from "@clerk/nextjs/server";
import { CompanyForm } from "@/components/company";

export const metadata = { title: "Create a company page | Hire Excellence" };

export default async function NewCompanyPage() {
  await auth.protect();
  return <CompanyForm />;
}
