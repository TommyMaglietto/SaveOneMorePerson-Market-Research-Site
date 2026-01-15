import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { getSupabaseAdmin } from "@/lib/supabase";

type ModerationPayload = {
  featureId?: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!isAdminSession(sessionCookie)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = (await request.json().catch(() => null)) as
    | ModerationPayload
    | null;
  const featureId = payload?.featureId?.trim();
  if (!featureId) {
    return NextResponse.json(
      { error: "featureId is required." },
      { status: 400 },
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .update({ greenlit: false })
    .eq("id", featureId);

  if (error) {
    return NextResponse.json(
      { error: "Failed to reject feature." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
