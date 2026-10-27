import "server-only";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getCurrentAdmin, hasAdmin } from "./admin-auth";

export async function requireAdminPage() {
  await connection();
  if (!hasAdmin()) redirect("/admin/setup");
  if (!(await getCurrentAdmin())) redirect("/admin/login");
}
