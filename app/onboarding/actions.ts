"use server";

import { auth } from "@clerk/nextjs/server";
import { track } from "@/lib/analytics";
import { aiWriter, failed, Fail, writer } from "@/lib/guard";
import { extractResume, saveResume } from "@/lib/resume";

/** Turn the text of a resume PDF (extracted in the browser) into structured fields for the member to review. Nothing is stored. */
export async function extractFromText(text: string) {
  try {
    const me = await aiWriter();
    const resume = await extractResume(text);
    await track(me, "resume extracted");
    return { resume };
  } catch (e) {
    return failed(e);
  }
}

/** Onboarding's last step, and the resume editor's Save. */
export async function saveMyResume(input: unknown) {
  try {
    const me = await writer();
    await saveResume(me, input);
    await track(me, "resume saved");
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}


/** Onboarding's last step: only after the member verified the email code Clerk sent (a fresh first factor). */
export async function createMyProfile(input: unknown) {
  try {
    const { has } = await auth();
    if (!has({ reverification: { level: "first_factor", afterMinutes: 10 } })) throw new Fail("Verify your email to finish.");
    const me = await writer();
    await saveResume(me, input);
    await track(me, "profile created");
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}
