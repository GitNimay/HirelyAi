"use server";

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

