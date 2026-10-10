import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Interview } from "@/components/interview";
import { ACTION } from "@/lib/human";
import { candidateView } from "@/lib/interview";

export const metadata = { title: "Assessment | Hire Excellence" };

export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await candidateView(slug, (await cookies()).get("iv")?.value);
  if (!view) notFound();
  return <Interview view={view} turnstile={{ sitekey: env.TURNSTILE_SITEKEY, action: ACTION }} />;
}
