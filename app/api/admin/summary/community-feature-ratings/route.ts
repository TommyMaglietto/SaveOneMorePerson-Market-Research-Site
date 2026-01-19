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

  const { data: communityFeatures, error: featureError } =
    await getSupabaseAdmin()
      .from("CommunityFeatures")
      .select("id, name, category, created_at")
      .order("created_at", { ascending: false });

  if (featureError) {
    return NextResponse.json(
      { error: "Failed to load summary." },
      { status: 500 },
    );
  }

  const featureIds = communityFeatures?.map((feature) => feature.id) ?? [];
  if (featureIds.length === 0) {
    return NextResponse.json({ summary: [] });
  }

  const { data: opinions, error: opinionsError } = await getSupabaseAdmin()
    .from("Opinions")
    .select("feature_id, score, comment")
    .in("feature_id", featureIds);

  if (opinionsError) {
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
        commentCount: 0,
      };
    current.total += 1;
    current.sum += score;
    if (score === 1) current.no += 1;
    if (score === 2) current.maybe += 1;
    if (score === 3) current.yes += 1;
    if (
      typeof opinion.comment === "string" &&
      opinion.comment.trim().length > 0
    ) {
      current.commentCount += 1;
    }
    countsByFeature.set(opinion.feature_id, current);
  });

  const summary =
    communityFeatures?.map((feature) => {
      const stats =
        countsByFeature.get(feature.id) ?? {
          total: 0,
          sum: 0,
          yes: 0,
          maybe: 0,
          no: 0,
          commentCount: 0,
        };
      const averageScore = stats.total ? stats.sum / stats.total : 0;

      return {
        featureId: feature.id,
        name: feature.name,
        category: feature.category,
        createdAt: feature.created_at,
        count: stats.total,
        averageScore: Number(averageScore.toFixed(2)),
        yesCount: stats.yes,
        maybeCount: stats.maybe,
        noCount: stats.no,
        commentCount: stats.commentCount,
      };
    }) ?? [];

  return NextResponse.json({ summary });
}
