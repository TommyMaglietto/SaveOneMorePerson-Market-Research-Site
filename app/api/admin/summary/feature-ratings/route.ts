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

  const [{ data: features, error: featureError }, { data: opinions, error: opinionsError }] =
    await Promise.all([
      getSupabaseAdmin().from("Features").select("id, name, category").order("name"),
      getSupabaseAdmin()
        .from("Opinions")
        .select("feature_id, score, rating, comment"),
    ]);

  if (featureError || opinionsError) {
    return NextResponse.json(
      { error: "Failed to load summary." },
      { status: 500 },
    );
  }

  const countsByFeature = new Map<
    string,
    {
      total: number;
      sum: number;
      yes: number;
      maybe: number;
      no: number;
      ratingCount: number;
      ratingSum: number;
      commentCount: number;
    }
  >();
  (opinions ?? []).forEach((opinion) => {
    if (!opinion.feature_id) return;
    const score = opinion.score ?? 0;
    const current =
      countsByFeature.get(opinion.feature_id) ?? {
        total: 0,
        sum: 0,
        yes: 0,
        maybe: 0,
        no: 0,
        ratingCount: 0,
        ratingSum: 0,
        commentCount: 0,
      };
    current.total += 1;
    current.sum += score;
    if (score === 1) current.no += 1;
    if (score === 2) current.maybe += 1;
    if (score === 3) current.yes += 1;
    if (typeof opinion.rating === "number") {
      current.ratingCount += 1;
      current.ratingSum += opinion.rating;
    }
    if (
      typeof opinion.comment === "string" &&
      opinion.comment.trim().length > 0
    ) {
      current.commentCount += 1;
    }
    countsByFeature.set(opinion.feature_id, current);
  });

  const summary =
    features?.map((feature) => {
      const stats =
        countsByFeature.get(feature.id) ?? {
          total: 0,
          sum: 0,
          yes: 0,
          maybe: 0,
          no: 0,
          ratingCount: 0,
          ratingSum: 0,
          commentCount: 0,
        };
      const averageScore = stats.total ? stats.sum / stats.total : 0;
      const averageRating = stats.ratingCount
        ? stats.ratingSum / stats.ratingCount
        : 0;

      return {
        featureId: feature.id,
        name: feature.name,
        category: feature.category,
        count: stats.total,
        averageScore: Number(averageScore.toFixed(2)),
        yesCount: stats.yes,
        maybeCount: stats.maybe,
        noCount: stats.no,
        ratingCount: stats.ratingCount,
        averageRating: Number(averageRating.toFixed(2)),
        commentCount: stats.commentCount,
      };
    }) ?? [];

  return NextResponse.json({ summary });
}
