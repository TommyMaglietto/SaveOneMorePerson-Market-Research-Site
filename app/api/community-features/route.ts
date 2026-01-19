import { createHash } from "crypto";
import { NextResponse } from "next/server";

import {
  containsProfanity,
  createProfanityFilter,
  hasLinkSpam,
} from "@/lib/moderation";
import {
  commitRateLimit,
  getRateLimitEntry,
  getRateLimitError,
  pruneRateLimitEntries,
  type RateLimitEntry,
} from "@/lib/rate-limit";
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
const SUBMISSION_IP_SCOPE = "community-submission-ip";
const SUBMISSION_FINGERPRINT_SCOPE = "community-submission-fingerprint";
const PROFANITY_ERROR = "Let's keep it constructive - please rephrase and try again.";

const recentContent = new Map<string, number>();
let lastCleanupAt = 0;
const profanityFilter = createProfanityFilter();

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

const pruneRecentContent = (now: number) => {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
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
    .or("and(allowed.eq.true,greenlit.is.null),greenlit.eq.true")
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

  if (
    containsProfanity(name, profanityFilter) ||
    containsProfanity(description, profanityFilter)
  ) {
    return NextResponse.json({ error: PROFANITY_ERROR }, { status: 400 });
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
  pruneRecentContent(now);
  const ip = getClientIp(request);
  const ipHash = hashValue(ip || "unknown");
  const userAgent = request.headers.get("user-agent") ?? "";
  const fingerprint = getFingerprint(ip || "unknown", userAgent, timezone);

  let ipEntry: RateLimitEntry;
  let fingerprintEntry: RateLimitEntry;
  try {
    await Promise.all([
      pruneRateLimitEntries(
        SUBMISSION_IP_SCOPE,
        RATE_WINDOW_MS,
        now,
        CLEANUP_INTERVAL_MS,
      ),
      pruneRateLimitEntries(
        SUBMISSION_FINGERPRINT_SCOPE,
        RATE_WINDOW_MS,
        now,
        CLEANUP_INTERVAL_MS,
      ),
    ]);
    ipEntry = await getRateLimitEntry(
      SUBMISSION_IP_SCOPE,
      ipHash,
      now,
      RATE_WINDOW_MS,
    );
    fingerprintEntry = await getRateLimitEntry(
      SUBMISSION_FINGERPRINT_SCOPE,
      fingerprint,
      now,
      RATE_WINDOW_MS,
    );
  } catch (error) {
    console.error("[community-features] rate limit error", error);
    return NextResponse.json(
      { error: "Unable to process submission right now." },
      { status: 503 },
    );
  }

  const rateError =
    getRateLimitError(ipEntry, now, {
      cooldownMs: COOLDOWN_MS,
      maxCount: MAX_SUBMISSIONS_PER_DAY,
      cooldownMessage: "Too many submissions. Please wait a moment and try again.",
      maxMessage: "Daily submission limit reached. Please try again tomorrow.",
    }) ??
    getRateLimitError(fingerprintEntry, now, {
      cooldownMs: COOLDOWN_MS,
      maxCount: MAX_SUBMISSIONS_PER_DAY,
      cooldownMessage: "Too many submissions. Please wait a moment and try again.",
      maxMessage: "Daily submission limit reached. Please try again tomorrow.",
    });
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

  ipEntry.count += 1;
  ipEntry.lastSeen = now;
  fingerprintEntry.count += 1;
  fingerprintEntry.lastSeen = now;
  try {
    await Promise.all([
      commitRateLimit(SUBMISSION_IP_SCOPE, ipHash, ipEntry),
      commitRateLimit(SUBMISSION_FINGERPRINT_SCOPE, fingerprint, fingerprintEntry),
    ]);
  } catch {
    // Ignore rate-limit persistence failures after a successful insert.
  }
  recentContent.set(contentKey, now);

  return NextResponse.json({ ok: true }, { status: 201 });
}
