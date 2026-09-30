import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Shell } from "@/components/auth";

export default function SSOCallbackPage() {
  return (
    <Shell title="Signing you in" subtitle="This only takes a moment" busy="Signing you in…">
      <div id="clerk-captcha" />
      <AuthenticateWithRedirectCallback signInUrl="/sign-in" signUpUrl="/sign-up" signInFallbackRedirectUrl="/dashboard" signUpFallbackRedirectUrl="/dashboard" />
    </Shell>
  );
}
