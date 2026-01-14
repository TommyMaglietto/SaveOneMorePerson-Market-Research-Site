import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 20;

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

  const limitParam = url.searchParams.get("limit");
  const pageParam = url.searchParams.get("page");
  const rawLimit = limitParam ? Number(limitParam) : NaN;
  const rawPage = pageParam ? Number(pageParam) : NaN;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 0;
  const from = page * limit;
  const to = from + limit;

  const { data, error } = await getSupabaseAdmin()
    .from("Opinions")
    .select("id, comment, score, rating, created_at")
    .eq("feature_id", featureId)
    .not("comment", "is", null)
    .neq("comment", "")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load comments." },
      { status: 500 },
    );
  }

  const trimmed = data ?? [];
  const hasMore = trimmed.length > limit;
  const comments = trimmed.slice(0, limit);

  return NextResponse.json({ comments, hasMore, page });
}
