import { createHash } from "crypto";
import { NextResponse } from "next/server";

import {
  commitRateLimit,
  getRateLimitEntry,
  getRateLimitError,
  pruneRateLimitEntries,
  type RateLimitEntry,
} from "@/lib/rate-limit";
import { getSupabaseAdmin } from "@/lib/supabase";

const EMAIL_MAX = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_SUBMISSIONS_PER_DAY = 10;
const COOLDOWN_MS = 15 * 1000;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_SUBMIT_MS = 600;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const WAITLIST_IP_SCOPE = "waitlist-ip";
const WAITLIST_FINGERPRINT_SCOPE = "waitlist-fingerprint";

type WaitlistPayload = {
  email?: string;
  timezone?: string;
  honeypot?: string;
  clientTimeMs?: number | null;
};

const getClientIp = (request: Request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "";
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    ""
  );
};

const hashValue = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const getFingerprint = (ip: string, userAgent: string, timezone: string) =>
  hashValue(`${ip}|${userAgent}|${timezone}`);

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as WaitlistPayload | null;
  const honeypot = payload?.honeypot?.trim();
  const clientTimeMs = payload?.clientTimeMs;
  const timezone = payload?.timezone ?? "";

  if (honeypot) {
    return NextResponse.json(
      { error: "Invalid submission." },
      { status: 400 },
    );
  }

  if (typeof clientTimeMs === "number" && clientTimeMs < MIN_SUBMIT_MS) {
    return NextResponse.json(
      { error: "Submission was too fast." },
      { status: 400 },
    );
  }

  const email = payload?.email?.trim().toLowerCase();
  if (!email || email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const ipHash = hashValue(ip || "unknown");
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = getFingerprint(ip || "unknown", userAgent, timezone);

  let ipEntry: RateLimitEntry;
  let fingerprintEntry: RateLimitEntry;
  try {
    await Promise.all([
      pruneRateLimitEntries(
        WAITLIST_IP_SCOPE,
        RATE_WINDOW_MS,
        now,
        CLEANUP_INTERVAL_MS,
      ),
      pruneRateLimitEntries(
        WAITLIST_FINGERPRINT_SCOPE,
        RATE_WINDOW_MS,
        now,
        CLEANUP_INTERVAL_MS,
      ),
    ]);
    ipEntry = await getRateLimitEntry(
      WAITLIST_IP_SCOPE,
      ipHash,
      now,
      RATE_WINDOW_MS,
    );
    fingerprintEntry = await getRateLimitEntry(
      WAITLIST_FINGERPRINT_SCOPE,
      fingerprint,
      now,
      RATE_WINDOW_MS,
    );
  } catch (error) {
    console.error("[waitlist] rate limit error", error);
    return NextResponse.json(
      { error: "Unable to process your request right now." },
      { status: 503 },
    );
  }

  const rateError =
    getRateLimitError(ipEntry, now, {
      cooldownMs: COOLDOWN_MS,
      maxCount: MAX_SUBMISSIONS_PER_DAY,
      cooldownMessage: "Please wait a moment before trying again.",
      maxMessage: "Daily waitlist limit reached. Please try again later.",
    }) ??
    getRateLimitError(fingerprintEntry, now, {
      cooldownMs: COOLDOWN_MS,
      maxCount: MAX_SUBMISSIONS_PER_DAY,
      cooldownMessage: "Please wait a moment before trying again.",
      maxMessage: "Daily waitlist limit reached. Please try again later.",
    });

  if (rateError) {
    return NextResponse.json({ error: rateError }, { status: 429 });
  }

  const { error } = await getSupabaseAdmin().from("Emails").insert({
    emails: email,
  });

  if (error) {
    const errorCode = (error as { code?: string }).code;
    if (errorCode === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json(
      { error: "Failed to save email." },
      { status: 500 },
    );
  }

  ipEntry.count += 1;
  ipEntry.lastSeen = now;
  fingerprintEntry.count += 1;
  fingerprintEntry.lastSeen = now;
  try {
    await Promise.all([
      commitRateLimit(WAITLIST_IP_SCOPE, ipHash, ipEntry),
      commitRateLimit(
        WAITLIST_FINGERPRINT_SCOPE,
        fingerprint,
        fingerprintEntry,
      ),
    ]);
  } catch {
    // Ignore rate-limit persistence failures after a successful insert.
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
