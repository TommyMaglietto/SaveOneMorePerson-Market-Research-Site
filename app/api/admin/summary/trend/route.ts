import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase";

type Bucket = "day" | "week" | "month";

function formatBucket(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date: Date) {
  const normalized = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = normalized.getUTCDay();
  const diff = (day + 6) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - diff);
  return normalized;
}

function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSession(sessionCookie)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(request.url);
  const featureId = url.searchParams.get("featureId");
  const bucketParam = (url.searchParams.get("bucket") ?? "day") as Bucket;

  if (!featureId) {
    return NextResponse.json(
      { error: "featureId is required." },
      { status: 400 },
    );
  }

  const bucket: Bucket = ["day", "week", "month"].includes(bucketParam)
    ? bucketParam
    : "day";

  const { data, error } = await supabaseAdmin
    .from("Opinions")
    .select("created_at, rating")
    .eq("feature_id", featureId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load trend data." },
      { status: 500 },
    );
  }

  const buckets = new Map<
    string,
    { count: number; ratingSum: number; ratingCount: number }
  >();
  (data ?? []).forEach((row) => {
    if (!row.created_at) return;
    const createdAt = new Date(row.created_at);
    let bucketDate = createdAt;
    if (bucket === "week") {
      bucketDate = startOfUtcWeek(createdAt);
    }
    if (bucket === "month") {
      bucketDate = startOfUtcMonth(createdAt);
    }
    const key = formatBucket(bucketDate);
    const current = buckets.get(key) ?? { count: 0, ratingSum: 0, ratingCount: 0 };
    current.count += 1;
    if (typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5) {
      current.ratingCount += 1;
      current.ratingSum += row.rating;
    }
    buckets.set(key, current);
  });

  const trend = Array.from(buckets.entries())
    .map(([key, value]) => ({
      bucket: key,
      count: value.count,
      ratingAverage: value.ratingCount
        ? Number((value.ratingSum / value.ratingCount).toFixed(2))
        : 0,
      ratingCount: value.ratingCount,
    }))
    .sort((a, b) => (a.bucket > b.bucket ? 1 : -1));

  return NextResponse.json({ bucket, trend });
}
