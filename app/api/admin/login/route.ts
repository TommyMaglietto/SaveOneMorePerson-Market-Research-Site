import { NextResponse } from "next/server";

import { ADMIN_COOKIE_NAME, getAdminSessionValue } from "@/lib/admin";

type LoginPayload = {
  password?: string;
};

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json(
      { error: "Admin password not configured." },
      { status: 500 },
    );
  }

  const payload = (await request.json().catch(() => null)) as LoginPayload | null;
  if (!payload?.password || payload.password !== adminPassword) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401 },
    );
  }

  const sessionValue = getAdminSessionValue();
  if (!sessionValue) {
    return NextResponse.json(
      { error: "Admin session unavailable." },
      { status: 500 },
    );
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, sessionValue, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return response;
}
