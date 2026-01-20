import { NextResponse } from "next/server";

import {
  containsProfanity,
  createProfanityFilter,
  hasLinkSpam,
} from "@/lib/moderation";
import { RESPONSE_EVENT, responseEvents } from "@/lib/response-events";
import { getSupabaseAdmin } from "@/lib/supabase";

const COMMENT_MAX = 500;
const PROFANITY_ERROR = "Let's keep it constructive - please rephrase and try again.";
const profanityFilter = createProfanityFilter();

type OpinionPayload = {
  featureId?: string;
  score?: number;
  comment?: string | null;
};

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as OpinionPayload | null;
  const featureId = payload?.featureId;
  const score = payload?.score;
  const comment = payload?.comment?.trim() ?? null;

  if (!featureId || typeof featureId !== "string" || !score || ![1, 2, 3].includes(score)) {
    return NextResponse.json(
      { error: "Invalid opinion payload." },
      { status: 400 },
    );
  }
  if (comment && comment.length > COMMENT_MAX) {
    return NextResponse.json(
      { error: `Comment should be under ${COMMENT_MAX} characters.` },
      { status: 400 },
    );
  }

  if (comment && hasLinkSpam(comment)) {
    return NextResponse.json(
      { error: "Links are not allowed in comments." },
      { status: 400 },
    );
  }

  if (comment && containsProfanity(comment, profanityFilter)) {
    return NextResponse.json({ error: PROFANITY_ERROR }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: officialFeature, error: officialError } = await supabase
    .from("Features")
    .select("id")
    .eq("id", featureId)
    .maybeSingle();

  if (officialError) {
    return NextResponse.json(
      { error: "Failed to validate feature." },
      { status: 500 },
    );
  }

  if (!officialFeature) {
    const { data: communityFeature, error: communityError } = await supabase
      .from("CommunityFeatures")
      .select("id")
      .eq("id", featureId)
      .maybeSingle();

    if (communityError) {
      return NextResponse.json(
        { error: "Failed to validate feature." },
        { status: 500 },
      );
    }
    if (!communityFeature) {
      return NextResponse.json(
        { error: "Unknown feature." },
        { status: 400 },
      );
    }
  }

  const { error } = await supabase.from("Opinions").insert({
    feature_id: featureId,
    score,
    comment: comment || null,
  });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save opinion." },
      { status: 500 },
    );
  }

  const { count, error: countError } = await supabase
    .from("Opinions")
    .select("id", { count: "exact", head: true });

  if (countError) {
    responseEvents.emit(RESPONSE_EVENT, { delta: 1 });
  } else {
    responseEvents.emit(RESPONSE_EVENT, { total: count ?? 0 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
