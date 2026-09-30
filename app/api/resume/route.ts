import { auth } from "@clerk/nextjs/server";
import { getResume } from "@/lib/resume";
import { resumePdf } from "@/lib/resume-pdf";

/** Download your resume as a formatted PDF, generated from your current details. */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const r = await getResume(userId);
  if (!r) return new Response("Not found", { status: 404 });
  const file = `${r.name.replace(/[^\w -]/g, "").trim() || "Resume"} - Resume.pdf`;
  return new Response((await resumePdf(r)) as Uint8Array<ArrayBuffer>, {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file}"`, "Cache-Control": "private, no-store" },
  });
}
