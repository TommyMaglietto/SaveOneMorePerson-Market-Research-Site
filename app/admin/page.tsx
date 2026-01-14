import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import AdminDashboard from "@/components/admin/AdminDashboard";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSession(sessionCookie)) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-app px-4 pb-16 pt-10">
      <AdminDashboard />
    </div>
  );
}
