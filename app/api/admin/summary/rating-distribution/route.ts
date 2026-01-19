import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSession(sessionCookie)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const featureId = url.searchParams.get("featureId");
  if (!featureId) {
    return NextResponse.json(
      { error: "featureId is required." },
      { status: 400 },
    );
  }

  const { data, error } = await getSupabaseAdmin()
    .from("Opinions")
    .select("score")
    .eq("feature_id", featureId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load distribution." },
      { status: 500 },
    );
  }

  const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  (data ?? []).forEach((row) => {
    if (row.score === 1) counts[1] += 1;
    if (row.score === 2) counts[2] += 1;
    if (row.score === 3) counts[3] += 1;
  });

  const distribution = [
    { score: 1, label: "No", count: counts[1] },
    { score: 2, label: "Maybe", count: counts[2] },
    { score: 3, label: "Yes", count: counts[3] },
  ];

  return NextResponse.json({ distribution });
}
