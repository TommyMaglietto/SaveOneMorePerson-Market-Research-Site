import { resolveMx } from "dns/promises";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MX_LOOKUP_TIMEOUT_MS = 2500;
const DOMAIN_SUGGESTIONS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmaol.com": "gmail.com",
  "gmal.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yahho.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "icloud.con": "icloud.com",
  "aol.con": "aol.com",
};

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

const getEmailValidationError = (email: string) => {
  if (!email) return "Please enter an email address.";
  if (/\s/.test(email)) return "Email addresses cannot contain spaces.";

  const parts = email.split("@");
  if (parts.length !== 2) return "Email addresses must include one @ symbol.";

  const [local, domain] = parts;
  if (!local) return "Email addresses need text before the @ symbol.";
  if (!domain) return "Email addresses need a domain after the @ symbol.";

  if (email.includes("..")) return "Email addresses cannot contain double dots.";
  if (local.endsWith(".") || domain.startsWith(".")) {
    return "Email addresses cannot have dots next to the @ symbol.";
  }

  if (!domain.includes(".")) {
    return "Email addresses need a domain with a dot (example.com).";
  }

  const tld = domain.split(".").pop() ?? "";
  if (!/^[a-z]{2,}$/i.test(tld)) {
    return "Email addresses must end with a valid domain extension.";
  }

  const suggestion = DOMAIN_SUGGESTIONS[domain];
  if (suggestion) {
    return `Please double-check the email domain. Did you mean ${suggestion}?`;
  }

  return null;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((result) => resolve(result))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timeoutId));
  });

const hasMxRecord = async (domain: string) => {
  const records = await withTimeout(resolveMx(domain), MX_LOOKUP_TIMEOUT_MS);
  return Array.isArray(records) && records.length > 0;
};


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
  if (!email || email.length > 320) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const validationError = getEmailValidationError(email);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
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

  const domain = email.split("@")[1] ?? "";
  try {
    const mxValid = await hasMxRecord(domain);
    if (!mxValid) {
      return NextResponse.json(
        { error: "Please use an email domain that can receive mail." },
        { status: 400 },
      );
    }
  } catch (error) {
    console.error("[waitlist-submit] MX lookup failed", error);
    return NextResponse.json(
      { error: "Unable to verify the email domain. Please try again." },
      { status: 502 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from("Emails")
    .select("email")
    .eq("email", email)
    .limit(1);
  if (lookupError) {
    console.error("[waitlist-submit] Supabase lookup failed", lookupError);
    return NextResponse.json(
      { error: "Unable to save right now. Please try again." },
      { status: 500 },
    );
  }

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, alreadySubscribed: true }, { status: 200 });
  }

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
