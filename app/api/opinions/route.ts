import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

type OpinionPayload = {
  featureId?: string;
  score?: number;
  comment?: string | null;
  rating?: number | null;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as OpinionPayload | null;
  const featureId = payload?.featureId;
  const score = payload?.score;
  const comment = payload?.comment?.trim() ?? null;
  const ratingRaw = payload?.rating;
  const rating =
    typeof ratingRaw === "number"
      ? ratingRaw
      : ratingRaw === null || ratingRaw === undefined
        ? null
        : Number(ratingRaw);

  if (!featureId || !score || ![1, 2, 3].includes(score)) {
    return NextResponse.json(
      { error: "Invalid opinion payload." },
      { status: 400 },
    );
  }
  if (
    rating !== null &&
    (!Number.isInteger(rating) || rating < 1 || rating > 5)
  ) {
    return NextResponse.json(
      { error: "Invalid rating payload." },
      { status: 400 },
    );
  }

  const { error } = await getSupabaseAdmin().from("Opinions").insert({
    feature_id: featureId,
    score,
    comment: comment || null,
    rating,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save opinion." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
