import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSession(sessionCookie)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .select("id, name, description, category, created_at, reported_count")
    .eq("allowed", false)
    .is("greenlit", null)
    .order("reported_count", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load flagged features." },
      { status: 500 },
    );
  }

  return NextResponse.json({ features: data ?? [] });
}
