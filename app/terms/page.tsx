import { Clause, LEGAL_EMAIL, LegalPage } from "@/components/public-shell";

export const metadata = {
  title: "Terms of Service | Hire Excellence",
  description: "The rules for using Hire Excellence, in plain language.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="October 11, 2026"
      other={["Privacy Policy", "/privacy"]}
      toc
      lead={<>These terms cover your use of Hire Excellence. <strong>By creating an account or using the service, you agree to them.</strong> We have kept them short.</>}
    >
      <Clause title="Your account"><p>You must be <strong>at least 18</strong> and give <strong>accurate information</strong>. One person per account. You are responsible for what happens under it, so keep your sign-in safe.</p></Clause>
      <Clause title="Fair use">
        <p>Use Hire Excellence to connect, hire and grow. Do not:</p>
        <ul>
          <li><strong>Impersonate</strong> anyone or post a fake profile, resume or job.</li>
          <li><strong>Cheat in an interview</strong>, by having someone else answer or sharing the questions.</li>
          <li><strong>Harass, spam or scrape</strong> other members, or charge candidates to apply.</li>
        </ul>
      </Clause>
      <Clause title="Your content"><p><strong>You own what you post.</strong> You give us permission to host and display it, and to process it to run the service, such as reading your resume or grading an interview. That permission ends when you delete it.</p></Clause>
      <Clause title="AI assessments"><p>Interview scores are produced by AI and <strong>can be wrong</strong>. They help recruiters review applicants; they are <strong>not a hiring decision</strong> and do not guarantee an offer.</p></Clause>
      <Clause title="For employers"><p>Company pages need a <strong>verified work email</strong> for the company domain. Jobs must be <strong>real and lawful</strong>. You make your own hiring decisions and are responsible for treating candidates fairly and handling their data lawfully.</p></Clause>
      <Clause title="Ending your account"><p>You can <strong>delete your account at any time</strong> from settings. We may suspend accounts that break these terms.</p></Clause>
      <Clause title="Disclaimer"><p>The service is provided <strong>as is</strong>. We do not guarantee jobs, hires or uninterrupted availability, and to the extent the law allows, we are not liable for indirect losses.</p></Clause>
      <Clause title="Changes and contact"><p>If we change these terms in a meaningful way, we will <strong>tell you before they take effect</strong>. Questions? Write to <a href={`mailto:${LEGAL_EMAIL}`}>{LEGAL_EMAIL}</a>.</p></Clause>
    </LegalPage>
  );
}
