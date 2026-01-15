import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const allowedCategories = new Set([
  "Learning",
  "Community",
  "Prayer",
  "Content",
  "Other",
]);

type CommunityFeaturePayload = {
  name?: string;
  description?: string;
  category?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 20;

  const { data, error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .select("id, name, description, category, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load community features." },
      { status: 500 },
    );
  }

  return NextResponse.json({ features: data ?? [] });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | CommunityFeaturePayload
    | null;
  const name = payload?.name?.trim();
  const description = payload?.description?.trim();
  const category = payload?.category?.trim();

  if (!name || !description || !category || !allowedCategories.has(category)) {
    return NextResponse.json(
      { error: "Invalid submission payload." },
      { status: 400 },
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .insert({
      name,
      description,
      category,
    });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save submission." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
