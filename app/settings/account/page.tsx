import { auth } from "@clerk/nextjs/server";
import { AccountSettings } from "@/components/account";

export const metadata = { title: "Account settings | Hire Excellence" };

export default async function AccountSettingsPage() {
  await auth.protect();
  return <AccountSettings />;
}
