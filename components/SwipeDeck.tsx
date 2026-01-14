"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check, X } from "lucide-react";

type Feature = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

type Selection = {
  featureId: string;
  name: string;
  category: string | null;
  score: 1 | 2 | 3;
  createdAt: string;
};

type SwipeIntent = "yes" | "maybe" | "no" | null;
type SwipePreview = {
  intent: SwipeIntent;
  strength: number;
};

const LOCAL_STORAGE_KEY = "somp-selections";
const SWIPE_THRESHOLD = 80;

const shuffleFeatures = (items: Feature[]) => {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const swipePreviewColors: Record<Exclude<SwipeIntent, null>, string> = {
  yes: "#E8F5E8",
  maybe: "#D4DBE0",
  no: "#F5D5C8",
};

export default function SwipeDeck() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [feedbackByFeature, setFeedbackByFeature] = useState<
    Record<string, string>
  >({});
  const [ratingByFeature, setRatingByFeature] = useState<
    Record<string, number>
  >({});

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [transition, setTransition] = useState("transform 180ms ease");
  const [isLocked, setIsLocked] = useState(false);
  const offsetRef = useRef(offset);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const didLoadSelections = useRef(false);

  useEffect(() => {
    let active = true;

    const loadFeatures = async () => {
      try {
        setStatus("loading");
        setMessage(null);
        const response = await fetch("/api/features");
        if (!response.ok) {
          throw new Error("Unable to load features.");
        }
        const data = (await response.json()) as { features: Feature[] };
        if (!active) return;
        setFeatures(shuffleFeatures(data.features ?? []));
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage("We couldn't load the next cards. Please refresh.");
      }
    };

    loadFeatures();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (didLoadSelections.current) return;
    didLoadSelections.current = true;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as Selection[];
        setSelections(parsed);
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    if (!didLoadSelections.current) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(selections));
  }, [selections]);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    [],
  );

  const currentFeature = features[currentIndex];
  const nextFeature = features[currentIndex + 1];
  const progress = features.length
    ? Math.min(currentIndex + 1, features.length)
    : 0;

  const swipePreview = useMemo<SwipePreview>(() => {
    if (isFlipped) {
      return { intent: null, strength: 0 };
    }
    const absX = Math.abs(offset.x);
    const absY = Math.abs(offset.y);
    const strength = Math.min(1, Math.max(absX, absY) / 160);
    if (strength < 0.05) {
      return { intent: null, strength: 0 };
    }
    if (absX >= absY) {
      return { intent: offset.x > 0 ? "yes" : "no", strength };
    }
    if (offset.y < 0) {
      return { intent: "maybe", strength };
    }
    return { intent: null, strength: 0 };
  }, [isFlipped, offset.x, offset.y]);

  const getButtonStyle = (intent: Exclude<SwipeIntent, null>) => {
    if (!swipePreview.intent) return undefined;
    if (swipePreview.intent === intent) return { opacity: 1 };
    return { opacity: Math.max(0.35, 1 - swipePreview.strength * 0.6) };
  };

  const addSelection = (score: 1 | 2 | 3, feature: Feature) => {
    setSelections((prev) => [
      {
        featureId: feature.id,
        name: feature.name,
        category: feature.category,
        score,
        createdAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  };

  const submitOpinion = async (score: 1 | 2 | 3, feature: Feature) => {
    addSelection(score, feature);
    const commentText = (feedbackByFeature[feature.id] ?? "").trim();
    const ratingValue = ratingByFeature[feature.id] ?? null;
    setFeedbackByFeature((prev) => {
      if (prev[feature.id] === undefined) return prev;
      const updated = { ...prev };
      delete updated[feature.id];
      return updated;
    });
    setRatingByFeature((prev) => {
      if (prev[feature.id] === undefined) return prev;
      const updated = { ...prev };
      delete updated[feature.id];
      return updated;
    });
    setIsFlipped(false);
    setMessage(null);
    try {
      const response = await fetch("/api/opinions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          featureId: feature.id,
          score,
          comment: commentText.length ? commentText : null,
          rating: ratingValue,
        }),
      });
      if (!response.ok) {
        throw new Error("Failed to save.");
      }
    } catch {
      setMessage("Saved locally. We'll retry next time you're online.");
    }
  };

  const resetPosition = () => {
    setTransition("transform 180ms ease");
    setOffset({ x: 0, y: 0 });
  };

  const advanceCard = () => {
    timeoutRef.current = window.setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setOffset({ x: 0, y: 0 });
      setTransition("transform 0ms ease");
      setIsLocked(false);
      setIsFlipped(false);
    }, 220);
  };

  const dismissCard = (score: 1 | 2 | 3, direction: "left" | "right" | "up") => {
    if (!currentFeature || isLocked || isFlipped) return;
    setIsLocked(true);
    setTransition("transform 220ms ease");

    const exitX = direction === "left" ? -520 : direction === "right" ? 520 : 0;
    const exitY = direction === "up" ? -360 : 0;
    setOffset({ x: exitX, y: exitY });
    submitOpinion(score, currentFeature);
    advanceCard();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isLocked || !currentFeature || isFlipped) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, a, textarea, input, select")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    setTransition("transform 0ms ease");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || isLocked || isFlipped) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    setOffset({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (!pointerStartRef.current || isLocked || isFlipped) return;
    pointerStartRef.current = null;
    const { x, y } = offsetRef.current;
    const absX = Math.abs(x);
    const absY = Math.abs(y);

    if (absX > absY && absX > SWIPE_THRESHOLD) {
      dismissCard(x > 0 ? 3 : 1, x > 0 ? "right" : "left");
      return;
    }

    if (absY > SWIPE_THRESHOLD && y < 0) {
      dismissCard(2, "up");
      return;
    }

    resetPosition();
  };

  const swipeHint = useMemo(() => {
    if (!currentFeature) return "You're all caught up.";
    return "Swipe right for yes, up for maybe, left for no.";
  }, [currentFeature]);

  const currentFeedback =
    currentFeature?.id ? feedbackByFeature[currentFeature.id] ?? "" : "";
  const currentRating =
    currentFeature?.id !== undefined
      ? ratingByFeature[currentFeature.id] ?? null
      : null;

  const handleFeedbackChange = (value: string) => {
    if (!currentFeature) return;
    setFeedbackByFeature((prev) => ({
      ...prev,
      [currentFeature.id]: value,
    }));
  };

  const handleRatingSelect = (rating: number) => {
    if (!currentFeature) return;
    setRatingByFeature((prev) => ({
      ...prev,
      [currentFeature.id]: rating,
    }));
  };

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      <div className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-[#4A7B9D]">
        <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm">
          {progress}/{features.length || 0} reviewed
        </span>
        <Link
          href="/selections"
          className="rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-1.5 text-[#4A7B9D] shadow-sm transition hover:-translate-y-0.5 hover:border-[#B8C4CC]"
        >
          View selections
        </Link>
      </div>

      <div className="relative h-[420px] w-full">
        {status === "loading" && (
          <div className="card-surface flex h-full items-center justify-center text-[#9BA8B0]">
            Loading cards...
          </div>
        )}
        {status === "error" && (
          <div className="card-surface flex h-full items-center justify-center text-[#9BA8B0]">
            {message ?? "Unable to load cards."}
          </div>
        )}
        {status === "ready" && !currentFeature && (
          <div className="card-surface flex h-full flex-col items-center justify-center gap-3 text-center text-[#6B7A84]">
            <p className="font-heading text-lg text-[#2E5B7A]">
              That's everything for now.
            </p>
            <p className="max-w-xs text-sm">
              Come back later for new ideas, or review what you picked.
            </p>
            <Link
              href="/selections"
              className="rounded-full bg-[#B8A8D4] px-4 py-2 text-sm font-semibold text-[#2E5B7A] shadow-sm transition hover:-translate-y-0.5"
            >
              See your selections
            </Link>
          </div>
        )}
        {nextFeature && (
          <div
            className="card-surface absolute inset-0 h-full w-full -translate-y-2 scale-[0.97] opacity-70"
            style={{
              backgroundColor: swipePreview.intent
                ? swipePreviewColors[swipePreview.intent]
                : undefined,
              transition: "background-color 160ms ease",
            }}
          >
            <div className="flex h-full flex-col justify-between p-6">
              <div className="h-4 w-20 rounded-full bg-[#F8F9FA]" />
              <div className="h-5 w-32 rounded-full bg-[#F8F9FA]" />
              <div className="space-y-2">
                <div className="h-5 w-3/4 rounded-full bg-[#F8F9FA]" />
                <div className="h-5 w-2/3 rounded-full bg-[#F8F9FA]" />
              </div>
            </div>
          </div>
        )}
        {currentFeature && (
          <div
            className="absolute inset-0 h-full w-full"
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) rotate(${offset.x / 14}deg)`,
              transition,
              touchAction: isFlipped ? "auto" : "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <div
              className="relative h-full w-full"
              style={{ perspective: "1200px" }}
            >
              <div
                className="card-surface relative h-full w-full"
                style={{
                  transformStyle: "preserve-3d",
                  transition: "transform 260ms ease",
                  transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
                }}
              >
                <div
                  className="absolute inset-0 flex h-full w-full flex-col justify-between p-6"
                  style={{
                    backfaceVisibility: "hidden",
                    pointerEvents: isFlipped ? "none" : "auto",
                  }}
                >
                  <div className="space-y-4">
                    <div className="flex items-center justify-start">
                      <span className="whitespace-nowrap rounded-full bg-[#E0D4F5] px-3 py-1 text-xs font-semibold text-[#4A7B9D]">
                        {currentFeature.category ?? "General"}
                      </span>
                    </div>
                    <div className="space-y-3">
                      <h2 className="text-center font-heading text-2xl font-semibold text-[#2E5B7A]">
                        {currentFeature.name}
                      </h2>
                      <p className="text-center text-sm leading-relaxed text-[#6B7A84]">
                        {currentFeature.description ?? ""}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-center">
                      <span className="whitespace-nowrap rounded-full border border-[#D8E3E8] px-3 py-1 text-xs text-[#9BA8B0]">
                        {swipeHint}
                      </span>
                    </div>
                    <div className="grid w-full grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => dismissCard(1, "left")}
                      disabled={!currentFeature || isLocked}
                      aria-label="No"
                      className="flex h-14 items-center justify-center rounded-2xl border border-[#F5D5C8] bg-[#F5D5C8] text-sm font-semibold text-[#2E5B7A] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      style={getButtonStyle("no")}
                    >
                      <X size={20} strokeWidth={2.5} />
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissCard(2, "up")}
                      disabled={!currentFeature || isLocked}
                      aria-label="Maybe"
                      className="flex h-14 items-center justify-center rounded-2xl border border-[#D8E3E8] bg-[#D4DBE0] text-sm font-semibold text-[#4A7B9D] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      style={getButtonStyle("maybe")}
                    >
                      Maybe
                    </button>
                    <button
                      type="button"
                      onClick={() => dismissCard(3, "right")}
                      disabled={!currentFeature || isLocked}
                      aria-label="Yes"
                      className="flex h-14 items-center justify-center rounded-2xl border border-[#D8E3E8] bg-[#E8F5E8] text-lg font-semibold text-[#3D6B43] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                      style={getButtonStyle("yes")}
                    >
                      <Check size={20} strokeWidth={2.5} />
                    </button>
                  </div>
                  </div>
                </div>

                <div
                  className="absolute inset-0 flex h-full w-full flex-col p-6"
                  style={{
                    backfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                    pointerEvents: isFlipped ? "auto" : "none",
                  }}
                >
                  <div className="space-y-4">
                    <p className="text-center text-sm font-semibold text-[#4A7B9D]">
                      What would you change about this feature?
                    </p>
                    <textarea
                      value={currentFeedback}
                      onChange={(event) => handleFeedbackChange(event.target.value)}
                      placeholder="Your thoughts..."
                      className="h-40 w-full resize-none rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 text-sm text-[#4A7B9D] shadow-sm"
                    />
                    <div className="space-y-2">
                      <p className="text-center text-xs font-semibold text-[#4A7B9D]">
                        Rate this feature (1-5)
                      </p>
                      <div className="flex items-center justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((value) => {
                          const isSelected = currentRating === value;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => handleRatingSelect(value)}
                              aria-pressed={isSelected}
                              className={`h-9 w-9 rounded-full border text-sm font-semibold transition ${
                                isSelected
                                  ? "border-[#8FC5E8] bg-[#8FC5E8] text-white"
                                  : "border-[#D8E3E8] bg-white text-[#6B7A84]"
                              }`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-auto flex flex-col gap-2">
                    <p className="text-center text-xs text-[#9BA8B0]">
                      Your feedback is saved with your yes/no/maybe response.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className="w-full rounded-2xl bg-[#F5D5C8] px-4 py-3 text-sm font-semibold text-[#2E5B7A] shadow-sm transition hover:-translate-y-0.5"
                    >
                      Submit feedback
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsFlipped((prev) => !prev)}
        disabled={!currentFeature}
        className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isFlipped
          ? "Back to the feature"
          : "Got thoughts? Help us improve this feature."}
      </button>

      {message && (
        <p className="text-center text-xs text-[#9BA8B0]">{message}</p>
      )}
    </section>
  );
}
