import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { AiInterview } from "@/components/ai-interview/candidate";
import { Interview } from "@/components/screening/interview";
import { mobileRequest } from "@/lib/ai-interview/workspace";
import { ACTION } from "@/lib/human";
import { candidateView } from "@/lib/screening/interview";

export const metadata = { title: "Assessment | Hirely AI" };

export default async function InterviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const view = await candidateView(slug, (await cookies()).get("iv")?.value);
  if (!view) notFound();
  const turnstile = { sitekey: env.TURNSTILE_SITEKEY, action: ACTION };
  if (view.kind === "ai") {
    // Decided on the server too, so a phone gets the "use a laptop" screen on first paint, not after hydration
    const h = await headers();
    const phone = mobileRequest(h.get("user-agent"), h.get("sec-ch-ua-mobile"));
    return <AiInterview view={view} turnstile={turnstile} phone={phone} />;
  }
  return <Interview view={view} turnstile={turnstile} />;
}
