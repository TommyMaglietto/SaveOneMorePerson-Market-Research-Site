import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const { count, error } = await getSupabaseAdmin()
    .from("Opinions")
    .select("id", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { error: "Failed to load total responses." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { total: count ?? 0 },
    { headers: { "Cache-Control": "no-store" } },
  );
}
