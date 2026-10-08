import { auth } from "@clerk/nextjs/server";
import { env } from "cloudflare:workers";
import { completedApplicants, toCsv, toDocx, toPdf } from "@/lib/applicant-export";
import { EXPORT_FORMATS, type ExportFormat as Format } from "@/lib/job-fields";

const TYPES: Record<Format, string> = {
  csv: "text/csv; charset=utf-8",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

/** The job's poster downloads applicants who completed screening: profile + verdict, as CSV, PDF or Word. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") ?? "";
  if (!Object.hasOwn(EXPORT_FORMATS, format)) return new Response("Unknown format", { status: 400 });
  const f = format as Format;

  const data = await completedApplicants(userId, (await params).id);
  if (!data) return new Response("Not found", { status: 404 });
  const name = `${`${data.title} - ${data.company}`.replace(/[^\w -]/g, "").trim() || "Applicants"} - Completed applicants.${f}`;
  const body = f === "csv" ? toCsv(data.list, env.APP_URL) : f === "pdf" ? await toPdf(data.list, name) : toDocx(data.list);
  return new Response(body as BodyInit, {
    headers: { "Content-Type": TYPES[f], "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
