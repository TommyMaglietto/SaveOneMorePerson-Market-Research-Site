import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const REPORT_THRESHOLD = 1;
const REPORT_MAX_PER_DAY = 10;
const REPORT_COOLDOWN_MS = 15 * 1000;
const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPORT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type ReportPayload = {
  featureId?: string;
  timezone?: string;
};

type RateLimitEntry = {
  count: number;
  firstSeen: number;
  lastSeen: number;
};

const reportByIp = new Map<string, RateLimitEntry>();
const reportByFingerprint = new Map<string, RateLimitEntry>();
let lastCleanupAt = 0;

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

const getRateEntry = (
  store: Map<string, RateLimitEntry>,
  key: string,
  now: number,
) => {
  const existing = store.get(key);
  if (!existing || now - existing.firstSeen > REPORT_WINDOW_MS) {
    const entry = { count: 0, firstSeen: now, lastSeen: 0 };
    store.set(key, entry);
    return entry;
  }
  return existing;
};

const getRateLimitError = (entry: RateLimitEntry, now: number) => {
  if (entry.lastSeen && now - entry.lastSeen < REPORT_COOLDOWN_MS) {
    return "Too many reports. Please wait a moment.";
  }
  if (entry.count >= REPORT_MAX_PER_DAY) {
    return "Report limit reached. Please try again tomorrow.";
  }
  return null;
};

const commitRateLimit = (
  store: Map<string, RateLimitEntry>,
  key: string,
  entry: RateLimitEntry,
  now: number,
) => {
  entry.count += 1;
  entry.lastSeen = now;
  store.set(key, entry);
};

const pruneStores = (now: number) => {
  if (now - lastCleanupAt < REPORT_CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, entry] of reportByIp.entries()) {
    if (now - entry.firstSeen > REPORT_WINDOW_MS) {
      reportByIp.delete(key);
    }
  }
  for (const [key, entry] of reportByFingerprint.entries()) {
    if (now - entry.firstSeen > REPORT_WINDOW_MS) {
      reportByFingerprint.delete(key);
    }
  }
};

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
  pruneStores(now);
  const ip = getClientIp(request);
  const ipHash = hashValue(ip || "unknown");
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = getFingerprint(ip || "unknown", userAgent, timezone);

  const ipEntry = getRateEntry(reportByIp, ipHash, now);
  const fingerprintEntry = getRateEntry(reportByFingerprint, fingerprint, now);

  const rateError =
    getRateLimitError(ipEntry, now) ??
    getRateLimitError(fingerprintEntry, now);
  if (rateError) {
    return NextResponse.json({ error: rateError }, { status: 429 });
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

  commitRateLimit(reportByIp, ipHash, ipEntry, now);
  commitRateLimit(reportByFingerprint, fingerprint, fingerprintEntry, now);

  return NextResponse.json({
    ok: true,
    removed: nextCount >= REPORT_THRESHOLD,
    reportedCount: nextCount,
  });
}
