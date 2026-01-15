import { createHash } from "crypto";
import { NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabase";

const allowedCategories = new Set([
  "Learning",
  "Community",
  "Prayer",
  "Content",
  "Other",
]);

const MAX_SUBMISSIONS_PER_DAY = 5;
const COOLDOWN_MS = 30 * 1000;
const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_SUBMIT_MS = 1500;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
const NAME_MIN = 3;
const NAME_MAX = 80;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 500;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

type RateLimitEntry = {
  count: number;
  firstSeen: number;
  lastSeen: number;
};

const rateLimitByIp = new Map<string, RateLimitEntry>();
const rateLimitByFingerprint = new Map<string, RateLimitEntry>();
const recentContent = new Map<string, number>();
let lastCleanupAt = 0;

type CommunityFeaturePayload = {
  name?: string;
  description?: string;
  category?: string;
  honeypot?: string;
  clientTimeMs?: number | null;
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

const normalizeContent = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

const hasLinkSpam = (value: string) => {
  const urlPattern = /(https?:\/\/|www\.)/i;
  const domainPattern =
    /\b[a-z0-9-]+\.(com|net|org|io|co|ai|gg|app|dev|info|biz|link)\b/i;
  return urlPattern.test(value) || domainPattern.test(value);
};

const getRateEntry = (
  store: Map<string, RateLimitEntry>,
  key: string,
  now: number,
) => {
  const existing = store.get(key);
  if (!existing || now - existing.firstSeen > RATE_WINDOW_MS) {
    const entry = { count: 0, firstSeen: now, lastSeen: 0 };
    store.set(key, entry);
    return entry;
  }
  return existing;
};

const getRateLimitError = (entry: RateLimitEntry, now: number) => {
  if (entry.lastSeen && now - entry.lastSeen < COOLDOWN_MS) {
    return "Too many submissions. Please wait a moment and try again.";
  }
  if (entry.count >= MAX_SUBMISSIONS_PER_DAY) {
    return "Daily submission limit reached. Please try again tomorrow.";
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
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, entry] of rateLimitByIp.entries()) {
    if (now - entry.firstSeen > RATE_WINDOW_MS) {
      rateLimitByIp.delete(key);
    }
  }
  for (const [key, entry] of rateLimitByFingerprint.entries()) {
    if (now - entry.firstSeen > RATE_WINDOW_MS) {
      rateLimitByFingerprint.delete(key);
    }
  }
  for (const [key, timestamp] of recentContent.entries()) {
    if (now - timestamp > DUPLICATE_WINDOW_MS) {
      recentContent.delete(key);
    }
  }
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get("limit") ?? "20");
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 50)
    : 20;

  const { data, error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .select("id, name, description, category, created_at, reported_count")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json(
      { error: "Failed to load community features." },
      { status: 500 },
    );
  }

  return NextResponse.json({ features: data ?? [] });
}

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as
    | CommunityFeaturePayload
    | null;
  const name = payload?.name?.trim();
  const description = payload?.description?.trim();
  const category = payload?.category?.trim();
  const honeypot = payload?.honeypot?.trim();
  const clientTimeMs = payload?.clientTimeMs;
  const timezone = payload?.timezone ?? "";

  if (honeypot) {
    return NextResponse.json(
      { error: "Invalid submission." },
      { status: 400 },
    );
  }

  if (!name || !description || !category || !allowedCategories.has(category)) {
    return NextResponse.json(
      { error: "Invalid submission payload." },
      { status: 400 },
    );
  }

  if (
    name.length < NAME_MIN ||
    name.length > NAME_MAX ||
    description.length < DESCRIPTION_MIN ||
    description.length > DESCRIPTION_MAX
  ) {
    return NextResponse.json(
      { error: "Submission length is invalid." },
      { status: 400 },
    );
  }

  if (hasLinkSpam(name) || hasLinkSpam(description)) {
    return NextResponse.json(
      { error: "Links are not allowed in submissions." },
      { status: 400 },
    );
  }

  if (typeof clientTimeMs !== "number" || clientTimeMs < MIN_SUBMIT_MS) {
    return NextResponse.json(
      { error: "Submission was too fast." },
      { status: 400 },
    );
  }

  const now = Date.now();
  pruneStores(now);
  const ip = getClientIp(request);
  const ipHash = hashValue(ip || "unknown");
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = getFingerprint(ip || "unknown", userAgent, timezone);

  const ipEntry = getRateEntry(rateLimitByIp, ipHash, now);
  const fingerprintEntry = getRateEntry(
    rateLimitByFingerprint,
    fingerprint,
    now,
  );

  const rateError =
    getRateLimitError(ipEntry, now) ??
    getRateLimitError(fingerprintEntry, now);
  if (rateError) {
    return NextResponse.json({ error: rateError }, { status: 429 });
  }

  const normalizedName = normalizeContent(name);
  const normalizedDescription = normalizeContent(description);
  const contentHash = hashValue(
    `${normalizedName}|${normalizedDescription}|${category.toLowerCase()}`,
  );
  const contentKey = `${fingerprint}:${contentHash}`;
  const lastSubmittedAt = recentContent.get(contentKey);
  if (lastSubmittedAt && now - lastSubmittedAt < DUPLICATE_WINDOW_MS) {
    return NextResponse.json(
      { error: "Duplicate submission detected." },
      { status: 409 },
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("CommunityFeatures")
    .insert({
      name,
      description,
      category,
    });

  if (error) {
    return NextResponse.json(
      { error: "Failed to save submission." },
      { status: 500 },
    );
  }

  commitRateLimit(rateLimitByIp, ipHash, ipEntry, now);
  commitRateLimit(rateLimitByFingerprint, fingerprint, fingerprintEntry, now);
  recentContent.set(contentKey, now);

  return NextResponse.json({ ok: true }, { status: 201 });
}
