"use client";

import { useEffect, useState } from "react";

type TotalResponsesPayload = {
  total: number;
};

const FALLBACK_POLL_INTERVAL_MS = 1000;

export default function TotalResponses() {
  const [total, setTotal] = useState<number | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let pollId: number | null = null;
    let eventSource: EventSource | null = null;

    const updateTotal = (nextTotal: number) => {
      if (!isMounted) return;
      setTotal(nextTotal);
      setHasError(false);
    };

    const loadTotal = async () => {
      try {
        const response = await fetch("/api/summary/total-responses", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Failed to load total responses.");
        }
        const data = (await response.json()) as TotalResponsesPayload;
        updateTotal(typeof data.total === "number" ? data.total : 0);
      } catch {
        if (!isMounted) return;
        setHasError(true);
      }
    };

    const startPolling = () => {
      if (pollId !== null) return;
      void loadTotal();
      pollId = window.setInterval(loadTotal, FALLBACK_POLL_INTERVAL_MS);
    };

    const startEventStream = () => {
      if (typeof window === "undefined" || !("EventSource" in window)) {
        startPolling();
        return;
      }

      eventSource = new EventSource("/api/summary/total-responses/stream");
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as TotalResponsesPayload;
          if (typeof data.total === "number") {
            updateTotal(data.total);
          }
        } catch {
          // Ignore malformed events.
        }
      };
      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
        startPolling();
      };
    };

    startEventStream();

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      if (pollId !== null) {
        window.clearInterval(pollId);
      }
    };
  }, []);

  const isLive = !hasError;
  const totalValue =
    total !== null ? total.toLocaleString() : isLive ? "..." : "--";
  const badgeLabel = isLive ? "Live" : "Offline";
  const badgeTone = isLive
    ? "bg-[#E0D4F5] text-[#4A7B9D]"
    : "bg-[#FDEBEC] text-[#D86161]";
  const label = isLive ? "Total responses" : "Last total";

  return (
    <div className="flex flex-col items-center gap-2" aria-live="polite">
      <div className="flex flex-wrap items-center justify-center gap-2 rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[clamp(10px,1.2vw,12px)] font-semibold uppercase tracking-wide ${badgeTone}`}
        >
          {isLive && (
            <span className="h-2 w-2 rounded-full bg-[#D86161] animate-pulse" />
          )}
          {badgeLabel}
        </span>
        <span className="text-[clamp(14px,1.8vw,18px)] font-[var(--font-poppins)] font-semibold text-[#6B89B0]">
          {label}
        </span>
        <span className="rounded-full bg-[#F5D5C8] px-3 py-1 text-[clamp(16px,2.4vw,22px)] font-semibold text-[#2E5B7A]">
          {totalValue}
        </span>
      </div>
      {hasError && (
        <span className="text-xs font-semibold text-rose-500">
          Total responses unavailable.
        </span>
      )}
    </div>
  );
}
