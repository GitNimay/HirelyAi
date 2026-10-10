import Link from "next/link";
import { Clause, LEGAL_EMAIL, LegalPage } from "@/components/public-shell";

export const metadata = {
  title: "Privacy Policy | Hire Excellence",
  description: "What Hire Excellence collects, why, and the choices you have.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="October 11, 2026"
      other={["Terms of Service", "/terms"]}
      lead={<div className="space-y-3"><p>This policy explains what Hire Excellence collects when you use it, how we use that information, and the choices you have.</p><p>We collect only what we need to run the service. <strong>We never sell your data</strong>, and you can see, export or delete it at any time.</p></div>}
    >
      <Clause title="What we collect">
        <ul>
        <li><strong>Account details</strong>: your name, email and profile photo, from sign-up or the social account you sign in with.</li>
        <li><strong>Profile and resume</strong>: the experience, skills and files you add or upload.</li>
        <li><strong>Interview answers</strong>: the transcript of a voice interview, or your picks in a timed assessment, and the result.</li>
        <li><strong>Usage data</strong>: pages visited and features used, tied to an account ID, never to your name.</li>
        </ul>
      </Clause>
      <Clause title="How we use AI">
        <p>An AI model <strong>reads your resume to fill in your profile</strong>, and <strong>grades interview answers against the job description</strong>.</p>
        <p>A score is a guide for the recruiter, <strong>not a hiring decision</strong>. The employer decides, and you can ask them for a human review. <strong>Your data is not used to train AI models.</strong></p>
      </Clause>
      <Clause title="Who sees it">
        <p>Your public profile is visible to anyone with the link. When you apply for a job, <strong>that employer sees your application, resume and interview result</strong>.</p>
        <p>We also rely on a small set of providers for hosting, sign-in, email and analytics. They process data only on our behalf.</p>
      </Clause>
      <Clause title="Cookies and analytics"><p>We use <strong>essential cookies</strong> to keep you signed in, and product analytics to see what works. You can <strong>turn analytics off</strong> in <Link href="/settings/account">Settings → Account</Link> at any time.</p></Clause>
      <Clause title="How long we keep it"><p>We keep your data <strong>while your account is open</strong>. When you delete your account, your profile and content are removed. Employers may keep copies of applications you sent them, under their own policies.</p></Clause>
      <Clause title="Your rights">
        <p>You can <strong>access, correct, export or delete</strong> your data, and withdraw consent. Most of this is in your settings; for anything else, email <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a> and we will reply within 30 days.</p>
      </Clause>
      <Clause title="Security"><p>Data is <strong>encrypted in transit and at rest</strong>, and access is limited to what each part of the service needs. No system is perfect; if a breach affects you, we will tell you promptly.</p></Clause>
      <Clause title="Changes"><p>If we change this policy in a meaningful way, we will <strong>let you know before it takes effect</strong>. Questions? Write to <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.</p></Clause>
    </LegalPage>
  );
}
