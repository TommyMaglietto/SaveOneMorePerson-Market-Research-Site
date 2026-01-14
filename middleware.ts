import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_COOKIE_NAME = "somp_admin";
const ADMIN_SESSION_MESSAGE = "somp-admin-session";

async function getExpectedSessionValue() {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return null;
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(adminPassword),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(ADMIN_SESSION_MESSAGE),
  );
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isAdminApiLogin =
    pathname.startsWith("/api/admin/login") ||
    pathname.startsWith("/api/admin/logout");
  const isAdminLogin = pathname.startsWith("/admin/login");
  if (isAdminLogin || isAdminApiLogin) {
    return NextResponse.next();
  }

  const expected = await getExpectedSessionValue();
  const sessionCookie = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  const isAuthorized = expected && sessionCookie === expected;

  if (!isAuthorized) {
    if (pathname.startsWith("/api/admin/")) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/summary/:path*",
    "/api/admin/comments/:path*",
  ],
};
