import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const getClientIp = (request: Request) => {
  const cfConnectingIp = request.headers.get("cf-connecting-ip");
  if (cfConnectingIp) return cfConnectingIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? null;

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return null;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const isValidEmail = (email: string) => /^\S+@\S+\.\S+$/.test(email);

export async function POST(request: Request) {
  const formData = await request.formData();

  const emailValue = formData.get("email");
  const honeypotValue = formData.get("_honeypot");
  const turnstileToken = formData.get("cf-turnstile-response");

  if (typeof honeypotValue === "string" && honeypotValue.length > 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (typeof emailValue !== "string") {
    return NextResponse.json({ error: "Please enter an email address." }, { status: 400 });
  }

  const email = normalizeEmail(emailValue);
  if (!email || email.length > 320 || !isValidEmail(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  if (typeof turnstileToken !== "string" || !turnstileToken) {
    return NextResponse.json({ error: "Verification required." }, { status: 400 });
  }

  const turnstileSecret = process.env.TURNSTILE_SECRET_KEY;
  if (!turnstileSecret) {
    console.error("[waitlist-submit] Missing TURNSTILE_SECRET_KEY");
    return NextResponse.json(
      { error: "Server configuration missing. Please try again later." },
      { status: 500 },
    );
  }

  const verifyBody = new URLSearchParams();
  verifyBody.set("secret", turnstileSecret);
  verifyBody.set("response", turnstileToken);
  const clientIp = getClientIp(request);
  if (clientIp) {
    verifyBody.set("remoteip", clientIp);
  }

  let verifyResponse: Response;
  try {
    verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: verifyBody.toString(),
    });
  } catch (error) {
    console.error("[waitlist-submit] Turnstile verify failed", error);
    return NextResponse.json(
      { error: "Unable to verify right now. Please try again." },
      { status: 502 },
    );
  }

  const verifyPayload = (await verifyResponse.json().catch(() => null)) as
    | { success?: boolean }
    | null;

  if (!verifyResponse.ok || !verifyPayload?.success) {
    return NextResponse.json(
      { error: "Verification failed. Please try again." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("Emails").insert({ email });
  if (error) {
    console.error("[waitlist-submit] Supabase insert failed", error);
    return NextResponse.json(
      { error: "Unable to save right now. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
