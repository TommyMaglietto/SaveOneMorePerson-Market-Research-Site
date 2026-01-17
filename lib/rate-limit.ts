import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";

export type RateLimitEntry = {
  count: number;
  firstSeen: number;
  lastSeen: number | null;
};

type RateLimitRow = {
  count: number | null;
  first_seen: string | null;
  last_seen: string | null;
};

const RATE_LIMIT_TABLE = "RateLimits";
const cleanupByScope = new Map<string, number>();

const parseTimestamp = (value: string | null) => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
};

const toIso = (value: number) => new Date(value).toISOString();

export const getRateLimitEntry = async (
  scope: string,
  key: string,
  now: number,
  windowMs: number,
): Promise<RateLimitEntry> => {
  const { data, error } = await getSupabaseAdmin()
    .from(RATE_LIMIT_TABLE)
    .select("count, first_seen, last_seen")
    .eq("scope", scope)
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const row = data as RateLimitRow | null;
  if (!row) {
    return { count: 0, firstSeen: now, lastSeen: null };
  }

  const firstSeen = parseTimestamp(row.first_seen);
  const lastSeen = parseTimestamp(row.last_seen);
  if (!firstSeen || now - firstSeen > windowMs) {
    return { count: 0, firstSeen: now, lastSeen: null };
  }

  return {
    count: row.count ?? 0,
    firstSeen,
    lastSeen,
  };
};

export const getRateLimitError = (
  entry: RateLimitEntry,
  now: number,
  config: {
    maxCount: number;
    cooldownMs: number;
    cooldownMessage: string;
    maxMessage: string;
  },
) => {
  if (entry.lastSeen && now - entry.lastSeen < config.cooldownMs) {
    return config.cooldownMessage;
  }
  if (entry.count >= config.maxCount) {
    return config.maxMessage;
  }
  return null;
};

export const commitRateLimit = async (
  scope: string,
  key: string,
  entry: RateLimitEntry,
) => {
  const { error } = await getSupabaseAdmin()
    .from(RATE_LIMIT_TABLE)
    .upsert(
      {
        scope,
        key,
        count: entry.count,
        first_seen: toIso(entry.firstSeen),
        last_seen: entry.lastSeen ? toIso(entry.lastSeen) : null,
      },
      { onConflict: "scope,key" },
    );

  if (error) {
    throw error;
  }
};

export const pruneRateLimitEntries = async (
  scope: string,
  windowMs: number,
  now: number,
  cleanupIntervalMs: number,
) => {
  const lastCleanup = cleanupByScope.get(scope) ?? 0;
  if (now - lastCleanup < cleanupIntervalMs) {
    return;
  }
  cleanupByScope.set(scope, now);

  const cutoff = toIso(now - windowMs);
  const { error } = await getSupabaseAdmin()
    .from(RATE_LIMIT_TABLE)
    .delete()
    .eq("scope", scope)
    .lt("first_seen", cutoff);

  if (error) {
    throw error;
  }
};
