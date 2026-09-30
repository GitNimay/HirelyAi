"use server";

import { auth } from "@clerk/nextjs/server";
import { failed, Fail, writer } from "@/lib/guard";
import { extractResume, saveResume } from "@/lib/resume";
import { MAX_RESUME_PDF_BYTES } from "@/lib/resume-fields";

/** Read an uploaded PDF resume into structured fields for the member to review. Nothing is stored. */
export async function extractFromPdf(fd: FormData) {
  try {
    await writer();
    const file = fd.get("file");
    if (!(file instanceof File) || file.type !== "application/pdf") throw new Fail("Upload a PDF file");
    if (file.size > MAX_RESUME_PDF_BYTES) throw new Fail("Resume must be 5 MB or smaller");
    return { resume: await extractResume(await file.arrayBuffer()) };
  } catch (e) {
    return failed(e);
  }
}

/** Onboarding's last step, and the resume editor's Save. */
export async function saveMyResume(input: unknown) {
  try {
    await saveResume(await writer(), input);
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
    await saveResume(await writer(), input);
    return { ok: true as const };
  } catch (e) {
    return failed(e);
  }
}
