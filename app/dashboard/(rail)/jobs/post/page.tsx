import { auth } from "@clerk/nextjs/server";
import { PostJobForm } from "@/components/jobs";

export default async function PostJobPage() {
  await auth.protect();
  return <PostJobForm />;
}
