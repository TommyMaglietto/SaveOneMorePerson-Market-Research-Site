"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  ratingCount: number;
  averageRating: number;
  commentCount: number;
};

type DistributionItem = {
  score: number;
  label: string;
  count: number;
};

type RatingDistributionItem = {
  rating: number;
  label: string;
  count: number;
};

type TrendItem = {
  bucket: string;
  count: number;
  ratingAverage: number;
  ratingCount: number;
};

type CommentItem = {
  id: string;
  comment: string | null;
  score: number | null;
  rating: number | null;
  created_at: string | null;
};

const COMMENTS_PAGE_SIZE = 5;

const bucketOptions = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;

export default function AdminDashboard() {
  const router = useRouter();
  const [summary, setSummary] = useState<FeatureSummary[]>([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null);
  const [distribution, setDistribution] = useState<DistributionItem[]>([]);
  const [ratingDistribution, setRatingDistribution] = useState<
    RatingDistributionItem[]
  >([]);
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
  const [sortBy, setSortBy] = useState<
    "popular" | "controversial" | "rated" | "feedback"
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
    if (sortBy === "rated") {
      return data.sort((a, b) =>
        b.averageRating === a.averageRating
          ? b.ratingCount - a.ratingCount
          : b.averageRating - a.averageRating,
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

  useEffect(() => {
    const loadSummary = async () => {
      try {
        setStatus("loading");
        setMessage(null);
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
        setSummary(data.summary ?? []);
        setSelectedFeatureId(data.summary?.[0]?.featureId ?? null);
        setCommentsPage(0);
        setStatus("ready");
      } catch {
        setStatus("error");
        setMessage("Unable to load admin summary.");
      }
    };

    loadSummary();
  }, [router]);

  useEffect(() => {
    const loadDetails = async () => {
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
            ratingDistribution: RatingDistributionItem[];
          };
          const trendData = (await trendResponse.json()) as {
            trend: TrendItem[];
          };

          setDistribution(distributionData.distribution ?? []);
          setRatingDistribution(distributionData.ratingDistribution ?? []);
          setTrend(trendData.trend ?? []);
          setMessage(null);
        } else {
          setMessage("Unable to load chart data.");
        }
      } catch {
        setMessage("Unable to load chart data.");
      }
    };

    loadDetails();
  }, [bucket, router, selectedFeatureId]);

  useEffect(() => {
    const loadComments = async () => {
      if (!selectedFeatureId) return;
      try {
        setCommentsStatus("loading");
        setCommentsMessage(null);
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
      } catch {
        setComments([]);
        setCommentsHasMore(false);
        setCommentsStatus("error");
        setCommentsMessage("Unable to load comments.");
      }
    };

    loadComments();
  }, [commentsPage, router, selectedFeatureId]);

  const totalResponses = summary.reduce((sum, item) => sum + item.count, 0);
  const totalRatings = summary.reduce((sum, item) => sum + item.ratingCount, 0);
  const totalComments = summary.reduce((sum, item) => sum + item.commentCount, 0);
  const overallRatingAverage = totalRatings
    ? summary.reduce(
        (sum, item) => sum + item.averageRating * item.ratingCount,
        0,
      ) / totalRatings
    : 0;
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
                Avg rating
              </p>
              <p className="font-heading text-2xl text-[#2E5B7A]">
                {overallRatingAverage.toFixed(2)}
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
            <div className="grid gap-6 lg:grid-cols-2">
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
              <div className="h-72">
                <p className="mb-2 text-sm font-semibold text-[#6B7A84]">
                  Rating distribution (1-5)
                </p>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingDistribution}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8E3E8" />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#F5D5C8" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="card-surface flex flex-col gap-4 p-4">
            <div className="grid gap-6 lg:grid-cols-2">
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
              <div className="h-72">
                <p className="mb-2 text-sm font-semibold text-[#6B7A84]">
                  Rating trend
                </p>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#D8E3E8" />
                    <XAxis dataKey="bucket" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="ratingAverage"
                      stroke="#B8A8D4"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
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
                          {typeof comment.rating === "number" && (
                            <span className="rounded-full bg-[#E0D4F5] px-2 py-1 text-xs font-semibold text-[#4A7B9D]">
                              Rating {comment.rating}/5
                            </span>
                          )}
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
                Feature ratings
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
                        | "rated"
                        | "feedback",
                    )
                  }
                >
                  <option value="popular">Most popular</option>
                  <option value="controversial">Most controversial</option>
                  <option value="rated">Best rated</option>
                  <option value="feedback">Most feedback</option>
                </select>
              </div>
            </div>
            <div className="space-y-2 text-sm text-[#6B7A84]">
              {sortedSummary.map((item) => {
                const yesPercent = getPercent(item.yesCount, item.count);
                const maybePercent = getPercent(item.maybeCount, item.count);
                const noPercent = getPercent(item.noCount, item.count);
                const ratingCoverage = getPercent(item.ratingCount, item.count);
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
                        Rating {item.averageRating.toFixed(2)} · Rated{" "}
                        {ratingCoverage}% · Comments {commentCoverage}%
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
        </>
      )}
    </div>
  );
}

