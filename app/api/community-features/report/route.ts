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

const REPORT_THRESHOLD = 1;
const REPORT_MAX_PER_DAY = 10;
const REPORT_COOLDOWN_MS = 15 * 1000;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPORT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REPORT_IP_SCOPE = "community-report-ip";
const REPORT_FINGERPRINT_SCOPE = "community-report-fingerprint";
const REPORT_DEDUPE_SCOPE = "community-report-dedupe";
const REPORT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPORT_DUPLICATE_MESSAGE = "You've already reported this feature.";

type ReportPayload = {
  featureId?: string;
  timezone?: string;
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
  const payload = (await request.json().catch(() => null)) as
    | ReportPayload
    | null;
  const featureId = payload?.featureId?.trim();
  const timezone = payload?.timezone ?? "";

  if (!featureId) {
    return NextResponse.json(
      { error: "Invalid report payload." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const ip = getClientIp(request);
  const ipHash = hashValue(ip || "unknown");
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = getFingerprint(ip || "unknown", userAgent, timezone);
  const reportKey = hashValue(`${fingerprint}|${featureId}`);

  let ipEntry: RateLimitEntry;
  let fingerprintEntry: RateLimitEntry;
  let dedupeEntry: RateLimitEntry;
  try {
    await Promise.all([
      pruneRateLimitEntries(
        REPORT_IP_SCOPE,
        REPORT_WINDOW_MS,
        now,
        REPORT_CLEANUP_INTERVAL_MS,
      ),
      pruneRateLimitEntries(
        REPORT_FINGERPRINT_SCOPE,
        REPORT_WINDOW_MS,
        now,
        REPORT_CLEANUP_INTERVAL_MS,
      ),
      pruneRateLimitEntries(
        REPORT_DEDUPE_SCOPE,
        REPORT_DEDUPE_WINDOW_MS,
        now,
        REPORT_CLEANUP_INTERVAL_MS,
      ),
    ]);
    ipEntry = await getRateLimitEntry(
      REPORT_IP_SCOPE,
      ipHash,
      now,
      REPORT_WINDOW_MS,
    );
    fingerprintEntry = await getRateLimitEntry(
      REPORT_FINGERPRINT_SCOPE,
      fingerprint,
      now,
      REPORT_WINDOW_MS,
    );
    dedupeEntry = await getRateLimitEntry(
      REPORT_DEDUPE_SCOPE,
      reportKey,
      now,
      REPORT_DEDUPE_WINDOW_MS,
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to process report right now." },
      { status: 503 },
    );
  }

  const rateError =
    getRateLimitError(ipEntry, now, {
      cooldownMs: REPORT_COOLDOWN_MS,
      maxCount: REPORT_MAX_PER_DAY,
      cooldownMessage: "Too many reports. Please wait a moment.",
      maxMessage: "Report limit reached. Please try again tomorrow.",
    }) ??
    getRateLimitError(fingerprintEntry, now, {
      cooldownMs: REPORT_COOLDOWN_MS,
      maxCount: REPORT_MAX_PER_DAY,
      cooldownMessage: "Too many reports. Please wait a moment.",
      maxMessage: "Report limit reached. Please try again tomorrow.",
    });
  if (rateError) {
    return NextResponse.json({ error: rateError }, { status: 429 });
  }

  if (dedupeEntry.count >= 1) {
    return NextResponse.json(
      { error: REPORT_DUPLICATE_MESSAGE },
      { status: 409 },
    );
  }

  const { data: feature, error: featureError } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .select("reported_count")
    .eq("id", featureId)
    .maybeSingle();

  if (featureError || !feature) {
    return NextResponse.json({ error: "Feature not found." }, { status: 404 });
  }

  const currentCount = feature.reported_count ?? 0;
  const nextCount = currentCount + 1;

  const updatePayload =
    nextCount >= REPORT_THRESHOLD
      ? { reported_count: nextCount, allowed: false }
      : { reported_count: nextCount };
  const { error: updateError } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .update(updatePayload)
    .eq("id", featureId);

  if (updateError) {
    return NextResponse.json(
      { error: "Failed to process report." },
      { status: 500 },
    );
  }

  ipEntry.count += 1;
  ipEntry.lastSeen = now;
  fingerprintEntry.count += 1;
  fingerprintEntry.lastSeen = now;
  dedupeEntry.count += 1;
  dedupeEntry.lastSeen = now;
  try {
    await Promise.all([
      commitRateLimit(REPORT_IP_SCOPE, ipHash, ipEntry),
      commitRateLimit(REPORT_FINGERPRINT_SCOPE, fingerprint, fingerprintEntry),
      commitRateLimit(REPORT_DEDUPE_SCOPE, reportKey, dedupeEntry),
    ]);
  } catch {
    // Ignore rate-limit persistence failures after a successful report update.
  }

  return NextResponse.json({
    ok: true,
    removed: nextCount >= REPORT_THRESHOLD,
    reportedCount: nextCount,
  });
}
