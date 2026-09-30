import { env } from "cloudflare:workers";
import { HumanCheck } from "@/components/human-check";
import { ACTION, safeNext } from "@/lib/human";

export const metadata = { title: "Verify you are human | Hire Excellence", robots: { index: false } };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { next } = await searchParams;
  return <HumanCheck sitekey={env.TURNSTILE_SITEKEY} action={ACTION} next={safeNext(typeof next === "string" ? next : null)} />;
}
