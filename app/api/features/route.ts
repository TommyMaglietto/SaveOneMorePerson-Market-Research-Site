import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await getSupabaseAdmin()
    .from("Features")
    .select("id, name, description, category")
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load features." },
      { status: 500 },
    );
  }

  return NextResponse.json({ features: data ?? [] });
}
