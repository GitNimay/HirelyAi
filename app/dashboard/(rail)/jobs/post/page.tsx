import { auth } from "@clerk/nextjs/server";
import { PostJobForm } from "@/components/jobs";

export const metadata = { title: "Post a job | Hire Excellence" };

export default async function PostJobPage() {
  await auth.protect();
  return <PostJobForm />;
}
