import { Shell } from "@/components/auth";
import { SSOCallback } from "./callback";

export default function SSOCallbackPage() {
  return (
    <Shell title="Signing you in" subtitle="This only takes a moment" busy="Signing you in…">
      <div id="clerk-captcha" />
      <SSOCallback />
    </Shell>
  );
}
