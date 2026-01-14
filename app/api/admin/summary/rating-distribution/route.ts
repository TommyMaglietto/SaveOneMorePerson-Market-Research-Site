import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

type RatingValue = 1 | 2 | 3 | 4 | 5;

const isRatingValue = (value: unknown): value is RatingValue =>
  typeof value === "number" && value >= 1 && value <= 5;

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
    .select("score, rating")
    .eq("feature_id", featureId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load distribution." },
      { status: 500 },
    );
  }

  const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  const ratingCounts: Record<RatingValue, number> = {
    1: 0,
    2: 0,
    3: 0,
    4: 0,
    5: 0,
  };
  let ratingSum = 0;
  let ratingTotal = 0;
  (data ?? []).forEach((row) => {
    if (row.score === 1) counts[1] += 1;
    if (row.score === 2) counts[2] += 1;
    if (row.score === 3) counts[3] += 1;
    if (isRatingValue(row.rating)) {
      ratingCounts[row.rating] += 1;
      ratingSum += row.rating;
      ratingTotal += 1;
    }
  });

  const distribution = [
    { score: 1, label: "No", count: counts[1] },
    { score: 2, label: "Maybe", count: counts[2] },
    { score: 3, label: "Yes", count: counts[3] },
  ];

  const ratingDistribution = [
    { rating: 1, label: "1", count: ratingCounts[1] },
    { rating: 2, label: "2", count: ratingCounts[2] },
    { rating: 3, label: "3", count: ratingCounts[3] },
    { rating: 4, label: "4", count: ratingCounts[4] },
    { rating: 5, label: "5", count: ratingCounts[5] },
  ];

  const ratingAverage = ratingTotal ? ratingSum / ratingTotal : 0;

  return NextResponse.json({
    distribution,
    ratingDistribution,
    ratingAverage: Number(ratingAverage.toFixed(2)),
  });
}
