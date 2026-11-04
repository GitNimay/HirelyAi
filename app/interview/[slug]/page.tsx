import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AiInterview } from "@/components/ai-interview/candidate";
import { Interview } from "@/components/screening/interview";
import { ACTION } from "@/lib/human";
import { candidateView } from "@/lib/screening/interview";

export const metadata = { title: "Assessment | Hire Excellence" };

export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await candidateView(slug, (await cookies()).get("iv")?.value);
  if (!view) notFound();
  const turnstile = { sitekey: env.TURNSTILE_SITEKEY, action: ACTION };
  if (view.kind === "ai") return <AiInterview view={view} turnstile={turnstile} />;
  return <Interview view={view} turnstile={turnstile} />;
}
