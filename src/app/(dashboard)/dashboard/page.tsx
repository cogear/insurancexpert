import { redirect } from "next/navigation";

// Dashboard redirects to upload page - document-first flow
export default function DashboardPage() {
  redirect("/upload");
}
