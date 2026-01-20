"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useRouter } from "next/navigation";

type FeatureSummary = {
  featureId: string;
  name: string;
  category: string | null;
  count: number;
  averageScore: number;
  yesCount: number;
  maybeCount: number;
  noCount: number;
  commentCount: number;
};

type CommunityFeatureSummary = {
  featureId: string;
  name: string;
  category: string | null;
  createdAt: string | null;
  count: number;
  averageScore: number;
  yesCount: number;
  maybeCount: number;
  noCount: number;
  commentCount: number;
};

type DistributionItem = {
  score: number;
  label: string;
  count: number;
};

type TrendItem = {
  bucket: string;
  count: number;
};

type CommentItem = {
  id: string;
  comment: string | null;
  score: number | null;
  created_at: string | null;
};

type ModerationItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  createdAt: string | null;
  reportedCount: number;
};

const COMMENTS_PAGE_SIZE = 5;
const ADMIN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

const bucketOptions = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<FeatureSummary[]>([]);
  const [communitySummary, setCommunitySummary] = useState<
    CommunityFeatureSummary[]
  >([]);
  const [flaggedFeatures, setFlaggedFeatures] = useState<ModerationItem[]>([]);
  const [moderationStatus, setModerationStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [moderationMessage, setModerationMessage] = useState<string | null>(
    null,
  );
  const [moderationActionById, setModerationActionById] = useState<
    Record<string, "approve" | "reject">
  >({});
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [trend, setTrend] = useState<TrendItem[]>([]);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentsPage, setCommentsPage] = useState(0);
  const [commentsHasMore, setCommentsHasMore] = useState(false);
  const [commentsStatus, setCommentsStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [commentsMessage, setCommentsMessage] = useState<string | null>(null);
  const [bucket, setBucket] = useState<(typeof bucketOptions)[number]["value"]>(
    "day",
  );
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [communityStatus, setCommunityStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [communityMessage, setCommunityMessage] = useState<string | null>(null);
  const [communitySortBy, setCommunitySortBy] = useState<
    "popular" | "controversial" | "feedback"
  >("popular");
  const [sortBy, setSortBy] = useState<
    "popular" | "controversial" | "feedback"
  >("popular");

  const selectedSummary = useMemo(
    () => summary.find((item) => item.featureId === selectedFeatureId) ?? null,
    [summary, selectedFeatureId],
  );

  const getPercent = (count: number, total: number) => {
    if (!total) return 0;
    return Math.round((count / total) * 100);
  };

  const getControversyScore = (item: FeatureSummary) => {
    if (!item.count) return 0;
    const diff = Math.abs(item.yesCount - item.noCount);
    return 1 - diff / item.count;
  };

  const sortedSummary = useMemo(() => {
    const data = [...summary];
    if (sortBy === "popular") {
      return data.sort((a, b) =>
        b.averageScore === a.averageScore
          ? b.count - a.count
          : b.averageScore - a.averageScore,
      );
    }
    if (sortBy === "feedback") {
      return data.sort((a, b) =>
        b.commentCount === a.commentCount
          ? b.count - a.count
          : b.commentCount - a.commentCount,
      );
    }
    return data.sort((a, b) => {
      const scoreDiff = getControversyScore(b) - getControversyScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.count - a.count;
    });
  }, [sortBy, summary]);

  const sortedCommunitySummary = useMemo(() => {
    const data = [...communitySummary];
    if (communitySortBy === "popular") {
      return data.sort((a, b) =>
        b.averageScore === a.averageScore
          ? b.count - a.count
          : b.averageScore - a.averageScore,
      );
    }
    if (communitySortBy === "feedback") {
      return data.sort((a, b) =>
        b.commentCount === a.commentCount
          ? b.count - a.count
          : b.commentCount - a.commentCount,
      );
    }
    return data.sort((a, b) => {
      const scoreDiff = getControversyScore(b) - getControversyScore(a);
      if (scoreDiff !== 0) return scoreDiff;
      return b.count - a.count;
    });
  }, [communitySortBy, communitySummary]);

  const loadSummary = useCallback(
    async (options?: { silent?: boolean; resetPage?: boolean }) => {
      const silent = options?.silent ?? false;
      const resetPage = options?.resetPage ?? false;
      try {
        if (!silent) {
          setStatus("loading");
        }
        const response = await fetch("/api/admin/summary/feature-ratings", {
          credentials: "include",
        });
        if (response.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load summary.");
        }
        const data = (await response.json()) as { summary: FeatureSummary[] };
        const nextSummary = data.summary ?? [];
        setSummary(nextSummary);
        setSelectedFeatureId((prev) => {
          if (!nextSummary.length) return null;
          if (prev && nextSummary.some((item) => item.featureId === prev)) {
            return prev;
          }
          return nextSummary[0]?.featureId ?? null;
        });
        if (resetPage) {
          setCommentsPage(0);
        }
        setStatus("ready");
        setMessage(null);
      } catch {
        setStatus("error");
        setMessage("Unable to load admin summary.");
      }
    },
    [router],
  );

  const loadCommunitySummary = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        if (!silent) {
          setCommunityStatus("loading");
        }
        const response = await fetch(
          "/api/admin/summary/community-feature-ratings",
          { credentials: "include" },
        );
        if (response.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load community summary.");
        }
        const data = (await response.json()) as {
          summary: CommunityFeatureSummary[];
        };
        setCommunitySummary(data.summary ?? []);
        setCommunityStatus("ready");
        setCommunityMessage(null);
      } catch {
        setCommunitySummary([]);
        setCommunityStatus("error");
        setCommunityMessage("Unable to load community features.");
      }
    },
    [router],
  );

  const loadModeration = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    try {
      if (!silent) {
        setModerationStatus("loading");
        setModerationMessage(null);
      }
      const response = await fetch("/api/admin/moderation", {
        credentials: "include",
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to load moderation queue.");
      }
      const data = (await response.json()) as {
        features: {
          id: string;
          name: string;
          description: string | null;
          category: string | null;
          created_at: string | null;
          reported_count: number | null;
        }[];
      };
      const normalized =
        data.features?.map((feature) => ({
          id: feature.id,
          name: feature.name,
          description: feature.description,
          category: feature.category,
          createdAt: feature.created_at,
          reportedCount: feature.reported_count ?? 0,
        })) ?? [];
      setFlaggedFeatures(normalized);
      setModerationStatus("ready");
    } catch {
      setFlaggedFeatures([]);
      setModerationStatus("error");
      setModerationMessage("Unable to load flagged submissions.");
    }
  }, [router]);

  const loadDetails = useCallback(
    async (_options?: { silent?: boolean }) => {
      if (!selectedFeatureId) return;
      try {
        const [distributionResponse, trendResponse] = await Promise.all([
          fetch(
            `/api/admin/summary/rating-distribution?featureId=${selectedFeatureId}`,
            { credentials: "include" },
          ),
          fetch(
            `/api/admin/summary/trend?featureId=${selectedFeatureId}&bucket=${bucket}`,
            { credentials: "include" },
          ),
        ]);

        if (distributionResponse.status === 401 || trendResponse.status === 401) {
          router.push("/admin/login");
          return;
        }

        let hasChartError = false;
        if (!distributionResponse.ok || !trendResponse.ok) {
          hasChartError = true;
        }

        if (!hasChartError) {
          const distributionData = (await distributionResponse.json()) as {
            distribution: DistributionItem[];
          };
          const trendData = (await trendResponse.json()) as {
            trend: TrendItem[];
          };

          setDistribution(distributionData.distribution ?? []);
          setTrend(trendData.trend ?? []);
          setMessage(null);
        } else {
          setMessage("Unable to load chart data.");
        }
      } catch {
        setMessage("Unable to load chart data.");
      }
    },
    [bucket, router, selectedFeatureId],
  );

  const loadComments = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!selectedFeatureId) return;
      const silent = options?.silent ?? false;
      try {
        if (!silent) {
          setCommentsStatus("loading");
        }
        const response = await fetch(
          `/api/admin/comments?featureId=${selectedFeatureId}&page=${commentsPage}&limit=${COMMENTS_PAGE_SIZE}`,
          { credentials: "include" },
        );
        if (response.status === 401) {
          router.push("/admin/login");
          return;
        }
        if (!response.ok) {
          throw new Error("Unable to load comments.");
        }
        const data = (await response.json()) as {
          comments: CommentItem[];
          hasMore?: boolean;
        };
        setComments(data.comments ?? []);
        setCommentsHasMore(Boolean(data.hasMore));
        setCommentsStatus("ready");
        setCommentsMessage(null);
      } catch {
        setComments([]);
        setCommentsHasMore(false);
        setCommentsStatus("error");
        setCommentsMessage("Unable to load comments.");
      }
    },
    [commentsPage, router, selectedFeatureId],
  );

  useEffect(() => {
    loadSummary({ resetPage: true });
  }, [loadSummary]);

  useEffect(() => {
    loadCommunitySummary();
  }, [loadCommunitySummary]);

  useEffect(() => {
    loadModeration();
  }, [loadModeration]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    const refresh = () => {
      loadSummary({ silent: true });
      loadCommunitySummary({ silent: true });
      loadDetails({ silent: true });
      loadComments({ silent: true });
      loadModeration({ silent: true });
    };
    const intervalId = window.setInterval(refresh, ADMIN_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [loadSummary, loadCommunitySummary, loadDetails, loadComments, loadModeration]);

  const totalResponses = summary.reduce((sum, item) => sum + item.count, 0);
  const totalComments = summary.reduce((sum, item) => sum + item.commentCount, 0);
  const overallScoreAverage = totalResponses
    ? summary.reduce(
        (sum, item) => sum + item.averageScore * item.count,
        0,
      ) / totalResponses
    : 0;
  const overallCommentRate = totalResponses
    ? Math.round((totalComments / totalResponses) * 100)
    : 0;

  const formatDate = (value: string | null) => {
    if (!value) return "";
    return new Date(value).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getScoreBadge = (score: number | null) => {
    if (score === 3) {
      return { label: "Yes", bg: "#E8F5E8", color: "#3D6B43" };
    }
    if (score === 2) {
      return { label: "Maybe", bg: "#D4DBE0", color: "#6B7A84" };
    }
    if (score === 1) {
      return { label: "No", bg: "#F5D5C8", color: "#7A5B4A" };
    }
    return { label: "Unscored", bg: "#E8F4F8", color: "#6B7A84" };
  };

  const handleModerationAction = async (
    featureId: string,
    action: "approve" | "reject",
  ) => {
    setModerationActionById((prev) => ({ ...prev, [featureId]: action }));
    setModerationMessage(null);
    try {
      const response = await fetch(`/api/admin/moderation/${action}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureId }),
      });
      if (response.status === 401) {
        router.push("/admin/login");
        return;
      }
      if (!response.ok) {
        throw new Error("Unable to update moderation status.");
      }
      setFlaggedFeatures((prev) =>
        prev.filter((feature) => feature.id !== featureId),
      );
    } catch {
      setModerationMessage("Unable to update moderation status.");
    } finally {
      setModerationActionById((prev) => {
        const { [featureId]: _removed, ...rest } = prev;
        return rest;
      });
    }
  };

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9BA8B0]">
            Admin portal
          </p>
          <h1 className="font-heading text-3xl font-semibold text-[#2E5B7A]">
            Insights dashboard
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-2 text-sm font-semibold text-[#6B7A84] shadow-sm transition hover:-translate-y-0.5"
          >
            Back to app
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-2 text-sm font-semibold text-[#6B7A84] shadow-sm transition hover:-translate-y-0.5"
          >
            Log out
          </button>
        </div>
      </header>

      {status === "loading" && (
        <div className="card-surface flex h-40 items-center justify-center text-[#9BA8B0]">
          Loading summary...
        </div>
      )}

      {status === "error" && (
        <div className="card-surface flex h-40 items-center justify-center text-[#9BA8B0]">
          {message ?? "Unable to load summary."}
        </div>
      )}

      {status === "ready" && (
        <>
          {message && (
            <p className="text-sm font-semibold text-rose-500">{message}</p>
          )}
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <div className="card-surface p-4">
              <p className="text-xs font-semibold uppercase text-[#9BA8B0]">
                Total responses
              </p>
              <p className="font-heading text-2xl text-[#2E5B7A]">
                {totalResponses}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-semibold uppercase text-[#9BA8B0]">
                Avg swipe score
              </p>
              <p className="font-heading text-2xl text-[#2E5B7A]">
                {overallScoreAverage.toFixed(2)}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-semibold uppercase text-[#9BA8B0]">
                Total feedback
              </p>
              <p className="font-heading text-2xl text-[#2E5B7A]">
                {totalComments}
              </p>
            </div>
            <div className="card-surface p-4">
              <p className="text-xs font-semibold uppercase text-[#9BA8B0]">
                Feedback rate
              </p>
              <p className="font-heading text-2xl text-[#2E5B7A]">
                {overallCommentRate}%
              </p>
            </div>
          </div>

          <div className="card-surface flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-sm font-semibold text-[#6B7A84]">
                Feature
              </label>
              <select
                className="rounded-full border border-[#D8E3E8] bg-white px-3 py-2 text-sm"
                value={selectedFeatureId ?? ""}
                onChange={(event) => {
                  setSelectedFeatureId(event.target.value);
                  setCommentsPage(0);
                }}
              >
                {summary.map((item) => (
                  <option key={item.featureId} value={item.featureId}>
                    {item.name}
                  </option>
                ))}
              </select>
              <label className="text-sm font-semibold text-[#6B7A84]">
                Bucket
              </label>
              <select
                className="rounded-full border border-[#D8E3E8] bg-white px-3 py-2 text-sm"
                value={bucket}
                onChange={(event) =>
                  setBucket(
                    event.target.value as (typeof bucketOptions)[number]["value"],
                  )
                }
              >
                {bucketOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {selectedSummary?.category && (
                <span className="rounded-full bg-[#E0D4F5] px-3 py-1 text-xs font-semibold text-[#4A7B9D]">
                  {selectedSummary.category}
                </span>
              )}
            </div>
            <div className="h-72">
              <p className="mb-2 text-sm font-semibold text-[#6B7A84]">
                Swipe distribution
              </p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={distribution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8E3E8" />
                  <XAxis dataKey="label" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8FC5E8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-surface flex flex-col gap-4 p-4">
            <div className="h-72">
              <p className="mb-2 text-sm font-semibold text-[#6B7A84]">
                Response trend
              </p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#D8E3E8" />
                  <XAxis dataKey="bucket" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#8FC5E8"
                    strokeWidth={3}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card-surface flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#6B7A84]">
                  Feature comments
                </p>
                <p className="text-xs text-[#9BA8B0]">
                  {selectedSummary?.name ?? "Selected feature"}
                </p>
              </div>
              <span className="rounded-full bg-[#E8F4F8] px-3 py-1 text-xs font-semibold text-[#6B7A84]">
                {selectedSummary?.commentCount ?? 0} comments
              </span>
            </div>

            {commentsStatus === "loading" && (
              <p className="text-sm text-[#9BA8B0]">Loading comments...</p>
            )}

            {commentsStatus === "error" && (
              <p className="text-sm font-semibold text-rose-500">
                {commentsMessage ?? "Unable to load comments."}
              </p>
            )}

            {commentsStatus === "ready" && comments.length === 0 && (
              <p className="text-sm text-[#9BA8B0]">
                No comments yet for this feature.
              </p>
            )}

            {commentsStatus === "ready" && comments.length > 0 && (
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {comments.map((comment) => {
                  const badge = getScoreBadge(comment.score);
                  const createdLabel = formatDate(comment.created_at);
                  return (
                    <div
                      key={comment.id}
                      className="rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <p className="text-sm leading-relaxed text-[#4A7B9D]">
                          {comment.comment}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="rounded-full px-2 py-1 text-xs font-semibold"
                            style={{
                              backgroundColor: badge.bg,
                              color: badge.color,
                            }}
                          >
                            {badge.label}
                          </span>
                        </div>
                      </div>
                      {createdLabel && (
                        <p className="mt-2 text-xs text-[#9BA8B0]">
                          {createdLabel}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {commentsStatus === "ready" &&
              (comments.length > 0 || commentsPage > 0) && (
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setCommentsPage((page) => Math.max(0, page - 1))
                    }
                    disabled={commentsPage === 0}
                    className="rounded-full border border-[#D8E3E8] bg-white px-4 py-1.5 text-xs font-semibold text-[#6B7A84] transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-[#9BA8B0]">
                    Page {commentsPage + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCommentsPage((page) => page + 1)}
                    disabled={!commentsHasMore}
                    className="rounded-full border border-[#D8E3E8] bg-white px-4 py-1.5 text-xs font-semibold text-[#6B7A84] transition disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
          </div>

          <div className="card-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#6B7A84]">
                Feature responses
              </p>
              <div className="flex items-center gap-2 text-sm">
                <label className="font-semibold text-[#9BA8B0]">Sort</label>
                <select
                  className="rounded-full border border-[#D8E3E8] bg-white px-3 py-1.5 text-sm"
                  value={sortBy}
                  onChange={(event) =>
                    setSortBy(
                      event.target.value as
                        | "popular"
                        | "controversial"
                        | "feedback",
                    )
                  }
                >
                  <option value="popular">Most popular</option>
                  <option value="controversial">Most controversial</option>
                  <option value="feedback">Most feedback</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 text-sm text-[#6B7A84]">
              {sortedSummary.map((item) => {
                const yesPercent = getPercent(item.yesCount, item.count);
                const maybePercent = getPercent(item.maybeCount, item.count);
                const noPercent = getPercent(item.noCount, item.count);
                const commentCoverage = getPercent(item.commentCount, item.count);
                return (
                  <div
                    key={item.featureId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D8E3E8] bg-white px-3 py-3"
                  >
                    <div>
                      <p className="font-semibold text-[#2E5B7A]">{item.name}</p>
                      <p className="text-xs text-[#9BA8B0]">
                        {item.category ?? "General"}
                      </p>
                      <p className="mt-1 text-xs text-[#9BA8B0]">
                        Yes {yesPercent}% | Maybe {maybePercent}% | No{" "}
                        {noPercent}%
                      </p>
                      <p className="text-xs text-[#9BA8B0]">
                        Feedback {commentCoverage}%
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-[#4A7B9D]">
                        {item.averageScore.toFixed(2)}
                      </p>
                      <p className="text-xs text-[#9BA8B0]">
                        {item.count} responses
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#6B7A84]">
                  Community feature responses
                </p>
                <span className="rounded-full bg-[#E8F4F8] px-3 py-1 text-xs font-semibold text-[#6B7A84]">
                  {communitySummary.length} submissions
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <label className="font-semibold text-[#9BA8B0]">Sort</label>
                <select
                  className="rounded-full border border-[#D8E3E8] bg-white px-3 py-1.5 text-sm"
                  value={communitySortBy}
                  onChange={(event) =>
                    setCommunitySortBy(
                      event.target.value as
                        | "popular"
                        | "controversial"
                        | "feedback",
                    )
                  }
                >
                  <option value="popular">Most popular</option>
                  <option value="controversial">Most controversial</option>
                  <option value="feedback">Most feedback</option>
                </select>
              </div>
            </div>

            {communityStatus === "loading" && (
              <p className="text-sm text-[#9BA8B0]">
                Loading community features...
              </p>
            )}

            {communityStatus === "error" && (
              <p className="text-sm font-semibold text-rose-500">
                {communityMessage ?? "Unable to load community features."}
              </p>
            )}

            {communityStatus === "ready" && communitySummary.length === 0 && (
              <p className="text-sm text-[#9BA8B0]">
                No community submissions yet.
              </p>
            )}

            {communityStatus === "ready" && communitySummary.length > 0 && (
              <div className="space-y-2 text-sm text-[#6B7A84]">
                {sortedCommunitySummary.map((item) => {
                  const yesPercent = getPercent(item.yesCount, item.count);
                  const maybePercent = getPercent(item.maybeCount, item.count);
                  const noPercent = getPercent(item.noCount, item.count);
                  const commentCoverage = getPercent(item.commentCount, item.count);
                  const createdLabel = formatDate(item.createdAt);
                  return (
                    <div
                      key={item.featureId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#D8E3E8] bg-white px-3 py-3"
                    >
                      <div>
                        <p className="font-semibold text-[#2E5B7A]">
                          {item.name}
                        </p>
                        <p className="text-xs text-[#9BA8B0]">
                          {item.category ?? "General"}
                        </p>
                        <p className="mt-1 text-xs text-[#9BA8B0]">
                          Yes {yesPercent}% | Maybe {maybePercent}% | No{" "}
                          {noPercent}%
                        </p>
                        <p className="text-xs text-[#9BA8B0]">
                          Feedback {commentCoverage}%
                        </p>
                        {createdLabel && (
                          <p className="text-xs text-[#9BA8B0]">
                            Submitted {createdLabel}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[#4A7B9D]">
                          {item.averageScore.toFixed(2)}
                        </p>
                        <p className="text-xs text-[#9BA8B0]">
                          {item.count} responses
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card-surface p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#6B7A84]">
                  Moderation queue
                </p>
                <span className="rounded-full bg-[#F5D5C8] px-3 py-1 text-xs font-semibold text-[#7A5B4A]">
                  {flaggedFeatures.length} flagged
                </span>
              </div>
            </div>

            {moderationMessage && moderationStatus !== "error" && (
              <p className="text-sm font-semibold text-rose-500">
                {moderationMessage}
              </p>
            )}

            {moderationStatus === "loading" && (
              <p className="text-sm text-[#9BA8B0]">
                Loading flagged submissions...
              </p>
            )}

            {moderationStatus === "error" && (
              <p className="text-sm font-semibold text-rose-500">
                {moderationMessage ?? "Unable to load flagged submissions."}
              </p>
            )}

            {moderationStatus === "ready" && flaggedFeatures.length === 0 && (
              <p className="text-sm text-[#9BA8B0]">
                No community submissions are awaiting review.
              </p>
            )}

            {moderationStatus === "ready" && flaggedFeatures.length > 0 && (
              <div className="space-y-3">
                {flaggedFeatures.map((feature) => {
                  const createdLabel = formatDate(feature.createdAt);
                  const isModerating = Boolean(moderationActionById[feature.id]);
                  const reportLabel = `${feature.reportedCount} report${
                    feature.reportedCount === 1 ? "" : "s"
                  }`;
                  return (
                    <div
                      key={feature.id}
                      className="rounded-2xl border border-[#D8E3E8] bg-white px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[#E0D4F5] px-3 py-1 text-xs font-semibold text-[#4A7B9D]">
                              {feature.category ?? "General"}
                            </span>
                            <span className="rounded-full bg-[#F5D5C8] px-3 py-1 text-xs font-semibold text-[#7A5B4A]">
                              {reportLabel}
                            </span>
                          </div>
                          <p className="font-semibold text-[#2E5B7A]">
                            {feature.name}
                          </p>
                          {feature.description && (
                            <p className="text-sm text-[#6B7A84]">
                              {feature.description}
                            </p>
                          )}
                          {createdLabel && (
                            <p className="text-xs text-[#9BA8B0]">
                              Submitted {createdLabel}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              handleModerationAction(feature.id, "approve")
                            }
                            disabled={isModerating}
                            aria-label={`Approve ${feature.name}`}
                            title="Approve"
                            className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#3D6B43] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#2F5236] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <Check size={26} strokeWidth={2.5} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleModerationAction(feature.id, "reject")
                            }
                            disabled={isModerating}
                            aria-label={`Reject ${feature.name}`}
                            title="Reject"
                            className="flex h-[60px] w-[60px] items-center justify-center rounded-full bg-[#D86161] text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-[#C45151] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <X size={26} strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

