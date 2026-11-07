import { auth } from "@clerk/nextjs/server";
import { AccountSettings } from "@/components/account";

export const metadata = { title: "Account settings | Hirely AI" };

export default async function AccountSettingsPage() {
  await auth.protect();
  return <AccountSettings />;
}
