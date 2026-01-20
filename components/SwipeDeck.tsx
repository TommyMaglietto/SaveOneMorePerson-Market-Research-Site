"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlertCircle, Check, X } from "lucide-react";

import { containsProfanity, createProfanityFilter } from "@/lib/moderation";

type FeatureBase = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
};

type CommunityFeature = FeatureBase & {
  createdAt: string;
  reportedCount: number;
};

type DeckItem = FeatureBase & {
  source: "official" | "community";
  createdAt?: string;
  reportedCount?: number;
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
type SubmissionCategory = "Learning" | "Community" | "Prayer" | "Content" | "Other";
type CardView = "feature" | "submission";

type ProfanityFlags = {
  name: boolean;
  description: boolean;
};

const LOCAL_STORAGE_KEY = "somp-selections";
const ROTATION_STEP_KEY = "somp-rotation-step";
const SWIPE_THRESHOLD = 80;
const COMMUNITY_BATCH_SIZE = 20;
const COMMUNITY_NEW_DAYS = 7;
const SUBMISSION_NAME_MIN = 3;
const SUBMISSION_NAME_MAX = 80;
const SUBMISSION_DESCRIPTION_MIN = 10;
const SUBMISSION_DESCRIPTION_MAX = 500;

const shuffleFeatures = <T,>(items: T[]) => {
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

const submissionCategories: SubmissionCategory[] = [
  "Learning",
  "Community",
  "Prayer",
  "Content",
  "Other",
];

const isRecentCommunityFeature = (createdAt: string) => {
  const createdTime = new Date(createdAt).getTime();
  if (Number.isNaN(createdTime)) {
    return false;
  }
  const ageMs = Date.now() - createdTime;
  return ageMs <= COMMUNITY_NEW_DAYS * 24 * 60 * 60 * 1000;
};

const getReportedCount = (item: CommunityFeature) =>
  Math.max(0, item.reportedCount ?? 0);

const weightedShuffleCommunity = (items: CommunityFeature[]) => {
  const scored = items.map((item) => {
    const weight = Math.max(0.05, 1 / (1 + getReportedCount(item)));
    const key = Math.pow(Math.random(), 1 / weight);
    return { item, key };
  });
  scored.sort((a, b) => b.key - a.key);
  return scored.map((entry) => entry.item);
};

const buildCommunityQueue = (items: CommunityFeature[]) => {
  const recent: CommunityFeature[] = [];
  const older: CommunityFeature[] = [];
  items.forEach((item) => {
    if (isRecentCommunityFeature(item.createdAt)) {
      recent.push(item);
    } else {
      older.push(item);
    }
  });
  const recentQueue = weightedShuffleCommunity(recent);
  const olderQueue = weightedShuffleCommunity(older);
  const blended: CommunityFeature[] = [];
  while (recentQueue.length || olderQueue.length) {
    if (recentQueue.length) {
      blended.push(recentQueue.shift() as CommunityFeature);
    }
    if (olderQueue.length) {
      blended.push(olderQueue.shift() as CommunityFeature);
    }
  }
  return blended;
};

const buildDeck = (
  official: FeatureBase[],
  community: CommunityFeature[],
  startStep: number,
) => {
  if (!community.length) {
    return official.map((item) => ({ ...item, source: "official" as const }));
  }

  const queue = buildCommunityQueue(community);
  const deck: DeckItem[] = [];
  let step = startStep;
  let featureIndex = 0;
  let communityUsed = 0;
  const maxCommunitySlots = Math.floor(official.length / 2) + 1;

  while (featureIndex < official.length) {
    const wantsCommunity = step === 2;
    if (wantsCommunity && queue.length && communityUsed < maxCommunitySlots) {
      const next = queue.shift() as CommunityFeature;
      deck.push({ ...next, source: "community" });
      communityUsed += 1;
    } else if (!wantsCommunity && featureIndex < official.length) {
      const next = official[featureIndex];
      deck.push({ ...next, source: "official" });
      featureIndex += 1;
    } else if (featureIndex < official.length) {
      const next = official[featureIndex];
      deck.push({ ...next, source: "official" });
      featureIndex += 1;
    } else {
      break;
    }
    step = (step + 1) % 3;
  }

  if (queue.length && communityUsed < maxCommunitySlots) {
    const next = queue.shift() as CommunityFeature;
    deck.push({ ...next, source: "community" });
    communityUsed += 1;
  }

  return deck;
};

export default function SwipeDeck() {
  const [officialFeatures, setOfficialFeatures] = useState<FeatureBase[]>([]);
  const [communityFeatures, setCommunityFeatures] = useState<
    CommunityFeature[]
  >([]);
  const [deck, setDeck] = useState<DeckItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [selections, setSelections] = useState<Selection[]>([]);
  const [isFlipped, setIsFlipped] = useState(false);
  const [feedbackByFeature, setFeedbackByFeature] = useState<
    Record<string, string>
  >({});
  const [cardView, setCardView] = useState<CardView>("feature");
  const [isCardHidden, setIsCardHidden] = useState(false);
  const [submissionName, setSubmissionName] = useState("");
  const [submissionDescription, setSubmissionDescription] = useState("");
  const [submissionCategory, setSubmissionCategory] = useState<
    SubmissionCategory | ""
  >("");
  const [submissionHoneypot, setSubmissionHoneypot] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState<string | null>(null);
  const [submissionMessageTone, setSubmissionMessageTone] = useState<
    "success" | "error"
  >("success");
  const [profanityFlags, setProfanityFlags] = useState<ProfanityFlags>({
    name: false,
    description: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState<string | null>(null);
  const [reportMessageTone, setReportMessageTone] = useState<
    "idle" | "success" | "error"
  >("idle");
  const [initialVotedIds, setInitialVotedIds] = useState<Set<string> | null>(
    null,
  );
  const [rotationSeed, setRotationSeed] = useState<number | null>(null);
  const [didLoadFeatures, setDidLoadFeatures] = useState(false);
  const [didLoadCommunity, setDidLoadCommunity] = useState(false);

  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [transition, setTransition] = useState("transform 180ms ease");
  const [isLocked, setIsLocked] = useState(false);
  const offsetRef = useRef(offset);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const cardTransitionRef = useRef<number | null>(null);
  const submissionResetRef = useRef<number | null>(null);
  const submissionStartRef = useRef<number | null>(null);
  const reportResetRef = useRef<number | null>(null);
  const didLoadSelections = useRef(false);
  const rotationStepRef = useRef(0);

  const profanityFilter = useMemo(() => createProfanityFilter(), []);

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
        const data = (await response.json()) as { features: FeatureBase[] };
        if (!active) return;
        setOfficialFeatures(shuffleFeatures(data.features ?? []));
        setDidLoadFeatures(true);
      } catch (error) {
        if (!active) return;
        setStatus("error");
        setMessage("We couldn't load the next cards. Please refresh.");
      }
    };

    const loadCommunityFeatures = async () => {
      try {
        const response = await fetch(
          `/api/community-features?limit=${COMMUNITY_BATCH_SIZE}`,
        );
        if (!response.ok) {
          throw new Error("Unable to load community features.");
        }
        const data = (await response.json()) as {
          features: {
            id: string;
            name: string;
            description: string | null;
            category: string | null;
            created_at: string;
            reported_count: number | null;
          }[];
        };
        if (!active) return;
        const normalized =
          data.features?.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            category: item.category,
            createdAt: item.created_at,
            reportedCount: item.reported_count ?? 0,
          })) ?? [];
        setCommunityFeatures(normalized);
      } catch {
        if (!active) return;
        setCommunityFeatures([]);
      } finally {
        if (!active) return;
        setDidLoadCommunity(true);
      }
    };

    loadFeatures();
    loadCommunityFeatures();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (didLoadSelections.current) return;
    didLoadSelections.current = true;
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    let parsed: Selection[] = [];
    if (stored) {
      try {
        parsed = JSON.parse(stored) as Selection[];
        setSelections(parsed);
      } catch {
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
    setInitialVotedIds(new Set(parsed.map((selection) => selection.featureId)));
  }, []);

  useEffect(() => {
    if (!didLoadSelections.current) return;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(selections));
  }, [selections]);

  useEffect(() => {
    const stored = localStorage.getItem(ROTATION_STEP_KEY);
    const parsed = stored ? Number(stored) : 0;
    const normalized = Number.isFinite(parsed) ? ((parsed % 3) + 3) % 3 : 0;
    rotationStepRef.current = normalized;
    setRotationSeed(normalized);
  }, []);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    if (!didLoadFeatures || !didLoadCommunity) return;
    if (rotationSeed === null || !initialVotedIds) return;
    if (status === "error") return;
    const availableOfficial = officialFeatures.filter(
      (feature) => !initialVotedIds.has(feature.id),
    );
    const availableCommunity = communityFeatures.filter(
      (feature) => !initialVotedIds.has(feature.id),
    );
    const builtDeck = buildDeck(
      availableOfficial,
      availableCommunity,
      rotationSeed,
    );
    setDeck(builtDeck);
    setCurrentIndex(0);
    setStatus("ready");
  }, [
    didLoadFeatures,
    didLoadCommunity,
    rotationSeed,
    initialVotedIds,
    officialFeatures,
    communityFeatures,
    status,
  ]);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      if (cardTransitionRef.current) {
        window.clearTimeout(cardTransitionRef.current);
      }
      if (submissionResetRef.current) {
        window.clearTimeout(submissionResetRef.current);
      }
      if (reportResetRef.current) {
        window.clearTimeout(reportResetRef.current);
      }
    },
    [],
  );

  const currentFeature = deck[currentIndex];
  const nextFeature = deck[currentIndex + 1];
  const totalCount = deck.length;
  const progress = totalCount
    ? Math.min(currentIndex + 1, totalCount)
    : 0;
  const isFeatureCardActive =
    cardView === "feature" &&
    status === "ready" &&
    Boolean(currentFeature) &&
    !isCardHidden;
  const isSubmissionCard = cardView === "submission";
  const isCommunityFeature = currentFeature?.source === "community";

  useEffect(() => {
    setIsReportModalOpen(false);
    setReportMessage(null);
    setReportMessageTone("idle");
    setIsReporting(false);
    if (reportResetRef.current) {
      window.clearTimeout(reportResetRef.current);
      reportResetRef.current = null;
    }
  }, [currentFeature?.id]);

  const cardTransitionStyle = useMemo<CSSProperties>(
    () => ({
      opacity: isCardHidden ? 0 : 1,
      transform: isCardHidden ? "translateY(12px)" : "translateY(0px)",
      transition: "opacity 250ms ease, transform 250ms ease",
      pointerEvents: isCardHidden ? "none" : "auto",
    }),
    [isCardHidden],
  );

  const swipePreview = useMemo<SwipePreview>(() => {
    if (isFlipped || !isFeatureCardActive) {
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
  }, [isFlipped, isFeatureCardActive, offset.x, offset.y]);

  const getButtonStyle = (intent: Exclude<SwipeIntent, null>) => {
    if (!swipePreview.intent) return undefined;
    if (swipePreview.intent === intent) return { opacity: 1 };
    return { opacity: Math.max(0.35, 1 - swipePreview.strength * 0.6) };
  };

  const addSelection = (score: 1 | 2 | 3, feature: DeckItem) => {
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

  const submitOpinion = async (score: 1 | 2 | 3, feature: DeckItem) => {
    addSelection(score, feature);
    const commentText = (feedbackByFeature[feature.id] ?? "").trim();
    setFeedbackByFeature((prev) => {
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

  const advanceRotationStep = () => {
    rotationStepRef.current = (rotationStepRef.current + 1) % 3;
    localStorage.setItem(ROTATION_STEP_KEY, `${rotationStepRef.current}`);
  };

  const switchCardView = (nextView: CardView) => {
    if (cardView === nextView) return;
    setIsFlipped(false);
    setIsLocked(false);
    resetPosition();
    setIsCardHidden(true);
    if (cardTransitionRef.current) {
      window.clearTimeout(cardTransitionRef.current);
    }
    cardTransitionRef.current = window.setTimeout(() => {
      setCardView(nextView);
      window.requestAnimationFrame(() => {
        setIsCardHidden(false);
      });
    }, 250);
  };

  const openSubmissionCard = () => {
    setSubmissionMessage(null);
    setSubmissionMessageTone("success");
    setProfanityFlags({ name: false, description: false });
    setIsReportModalOpen(false);
    setReportMessage(null);
    setReportMessageTone("idle");
    setIsReporting(false);
    if (reportResetRef.current) {
      window.clearTimeout(reportResetRef.current);
      reportResetRef.current = null;
    }
    if (submissionResetRef.current) {
      window.clearTimeout(submissionResetRef.current);
    }
    if (cardView === "submission") {
      submissionStartRef.current = null;
      switchCardView("feature");
      return;
    }
    submissionStartRef.current = Date.now();
    setSubmissionHoneypot("");
    switchCardView("submission");
  };

  const advanceCard = () => {
    advanceRotationStep();
    timeoutRef.current = window.setTimeout(() => {
      setCurrentIndex((prev) => prev + 1);
      setOffset({ x: 0, y: 0 });
      setTransition("transform 0ms ease");
      setIsLocked(false);
      setIsFlipped(false);
    }, 220);
  };

  const dismissCard = (score: 1 | 2 | 3, direction: "left" | "right" | "up") => {
    if (!isFeatureCardActive || !currentFeature || isLocked || isFlipped) return;
    setIsLocked(true);
    setTransition("transform 220ms ease");

    const exitX = direction === "left" ? -520 : direction === "right" ? 520 : 0;
    const exitY = direction === "up" ? -360 : 0;
    setOffset({ x: exitX, y: exitY });
    submitOpinion(score, currentFeature);
    advanceCard();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isFeatureCardActive || isCardHidden || isLocked || !currentFeature || isFlipped) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, textarea, input, select")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStartRef.current = { x: event.clientX, y: event.clientY };
    setTransition("transform 0ms ease");
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !pointerStartRef.current ||
      !isFeatureCardActive ||
      isCardHidden ||
      isLocked ||
      isFlipped
    ) {
      return;
    }
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    setOffset({ x: dx, y: dy });
  };

  const handlePointerUp = () => {
    if (
      !pointerStartRef.current ||
      !isFeatureCardActive ||
      isCardHidden ||
      isLocked ||
      isFlipped
    ) {
      return;
    }
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

  const handleFeedbackChange = (value: string) => {
    if (!currentFeature) return;
    setFeedbackByFeature((prev) => ({
      ...prev,
      [currentFeature.id]: value,
    }));
  };

  const handleSubmissionNameChange = (value: string) => {
    setSubmissionName(value);
    if (profanityFlags.name) {
      setProfanityFlags((prev) => ({ ...prev, name: false }));
    }
    if (submissionMessage) {
      setSubmissionMessage(null);
    }
  };

  const handleSubmissionDescriptionChange = (value: string) => {
    setSubmissionDescription(value);
    if (profanityFlags.description) {
      setProfanityFlags((prev) => ({ ...prev, description: false }));
    }
    if (submissionMessage) {
      setSubmissionMessage(null);
    }
  };

  const handleSubmissionHoneypotChange = (value: string) => {
    setSubmissionHoneypot(value);
  };

  const closeReportModal = () => {
    if (reportResetRef.current) {
      window.clearTimeout(reportResetRef.current);
      reportResetRef.current = null;
    }
    setIsReportModalOpen(false);
    setReportMessage(null);
    setReportMessageTone("idle");
    setIsReporting(false);
  };

  const handleReportClick = () => {
    if (!isCommunityFeature) return;
    if (isReportModalOpen) {
      closeReportModal();
      return;
    }
    setReportMessage(null);
    setReportMessageTone("idle");
    setIsReporting(false);
    setIsReportModalOpen(true);
  };

  const handleSubmitReport = async () => {
    if (!currentFeature || !isCommunityFeature || isReporting) return;
    setIsReporting(true);
    setReportMessage(null);
    setReportMessageTone("idle");
    const reportId = currentFeature.id;

    let timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      timezone = "";
    }

    try {
      const response = await fetch("/api/community-features/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ featureId: currentFeature.id, timezone }),
      });
      if (!response.ok) {
        throw new Error("Failed to report.");
      }
      setReportMessage("Thanks for helping keep things safe.");
      setReportMessageTone("success");
      if (reportResetRef.current) {
        window.clearTimeout(reportResetRef.current);
      }
      reportResetRef.current = window.setTimeout(() => {
        setDeck((prev) => prev.filter((item) => item.id !== reportId));
        closeReportModal();
      }, 2000);
    } catch {
      setReportMessage("We couldn't submit that report. Please try again.");
      setReportMessageTone("error");
      setIsReporting(false);
    }
  };

  const handleSubmissionCategoryChange = (value: SubmissionCategory | "") => {
    setSubmissionCategory(value);
    if (submissionMessage) {
      setSubmissionMessage(null);
    }
  };

  const handleSubmitIdea = async () => {
    if (isSubmitting) return;

    const name = submissionName.trim();
    const description = submissionDescription.trim();
    const category = submissionCategory;

    if (!name || !description || !category) return;

    if (name.length < SUBMISSION_NAME_MIN) {
      setSubmissionMessage(
        `Feature name should be at least ${SUBMISSION_NAME_MIN} characters.`,
      );
      setSubmissionMessageTone("error");
      return;
    }

    if (description.length < SUBMISSION_DESCRIPTION_MIN) {
      setSubmissionMessage(
        `Please add more detail (at least ${SUBMISSION_DESCRIPTION_MIN} characters).`,
      );
      setSubmissionMessageTone("error");
      return;
    }

    if (name.length > SUBMISSION_NAME_MAX) {
      setSubmissionMessage(
        `Feature name should be under ${SUBMISSION_NAME_MAX} characters.`,
      );
      setSubmissionMessageTone("error");
      return;
    }

    if (description.length > SUBMISSION_DESCRIPTION_MAX) {
      setSubmissionMessage(
        `Description should be under ${SUBMISSION_DESCRIPTION_MAX} characters.`,
      );
      setSubmissionMessageTone("error");
      return;
    }

    const nameProfane = containsProfanity(name, profanityFilter);
    const descriptionProfane = containsProfanity(description, profanityFilter);

    if (nameProfane || descriptionProfane) {
      setProfanityFlags({ name: nameProfane, description: descriptionProfane });
      setSubmissionMessage(
        "Let's keep it constructive - please rephrase and try again",
      );
      setSubmissionMessageTone("error");
      return;
    }

    setIsSubmitting(true);
    setSubmissionMessage(null);
    setSubmissionMessageTone("success");

    let timezone = "";
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      timezone = "";
    }
    const clientTimeMs = submissionStartRef.current
      ? Date.now() - submissionStartRef.current
      : null;

    try {
      const response = await fetch("/api/community-features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          category,
          honeypot: submissionHoneypot,
          clientTimeMs,
          timezone,
        }),
      });
      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        const errorText =
          typeof errorPayload?.error === "string"
            ? errorPayload.error
            : null;
        if (errorText === "Submission length is invalid.") {
          setSubmissionMessage(
            `Please add more detail (at least ${SUBMISSION_DESCRIPTION_MIN} characters).`,
          );
        } else if (errorText) {
          setSubmissionMessage(errorText);
        } else {
          setSubmissionMessage("We couldn't submit right now. Please try again.");
        }
        setSubmissionMessageTone("error");
        return;
      }
      setSubmissionMessage("Thanks! Your idea has been submitted!");
      setSubmissionMessageTone("success");
      setSubmissionName("");
      setSubmissionDescription("");
      setSubmissionCategory("");
      setSubmissionHoneypot("");
      setProfanityFlags({ name: false, description: false });
      if (submissionResetRef.current) {
        window.clearTimeout(submissionResetRef.current);
      }
      submissionResetRef.current = window.setTimeout(() => {
        setSubmissionMessage(null);
        submissionStartRef.current = null;
        switchCardView("feature");
      }, 1400);
    } catch {
      setSubmissionMessage("We couldn't submit right now. Please try again.");
      setSubmissionMessageTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSubmissionValid =
    submissionName.trim().length > 0 &&
    submissionDescription.trim().length > 0 &&
    Boolean(submissionCategory);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col items-center gap-6">
      <div className="grid w-full grid-cols-3 items-center gap-[clamp(8px,1.8vw,14px)] text-[clamp(11px,2.4vw,14px)] font-semibold text-[#4A7B9D]">
        <span className="flex min-h-[clamp(40px,6vh,48px)] w-full min-w-0 items-center justify-center rounded-full bg-white/70 px-[clamp(8px,1.5vw,12px)] py-[clamp(6px,1.2vw,10px)] text-center leading-tight whitespace-normal shadow-sm">
          {progress}/{totalCount || 0} reviewed
        </span>
        <button
          type="button"
          onClick={openSubmissionCard}
          disabled={status !== "ready" || isSubmitting}
          className="flex min-h-[clamp(40px,6vh,48px)] w-full min-w-0 items-center justify-center rounded-full bg-[#FCD99A] px-[clamp(8px,1.5vw,12px)] py-[clamp(6px,1.2vw,10px)] text-center leading-tight text-[#2E5B7A] whitespace-normal shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmissionCard ? "Back" : "Have a Better Idea?"}
        </button>
        <Link
          href="/selections"
          className="flex min-h-[clamp(40px,6vh,48px)] w-full min-w-0 items-center justify-center rounded-full border border-[#D8E3E8] bg-white/80 px-[clamp(8px,1.5vw,12px)] py-[clamp(6px,1.2vw,10px)] text-center leading-tight text-[#4A7B9D] whitespace-normal shadow-sm transition hover:-translate-y-0.5 hover:border-[#B8C4CC]"
        >
          View selections
        </Link>
      </div>

      <div className="relative h-[480px] w-full">
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
        {status === "ready" && cardView === "feature" && !currentFeature && (
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
        {nextFeature && cardView === "feature" && (
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
        {status === "ready" && cardView === "feature" && currentFeature && (
          <div className="absolute inset-0 h-full w-full" style={cardTransitionStyle}>
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
                  className="absolute inset-0 flex h-full w-full flex-col justify-between p-6 relative"
                  style={{
                    backfaceVisibility: "hidden",
                    pointerEvents: isFlipped ? "none" : "auto",
                  }}
                >
                  <div className="space-y-4">
                    <div className="flex w-full flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="whitespace-nowrap rounded-full bg-[#E0D4F5] px-3 py-1 text-xs font-semibold text-[#4A7B9D]">
                          {currentFeature.category ?? "General"}
                        </span>
                        {isCommunityFeature && (
                          <span className="rounded-[12px] bg-[#C8E3F5] px-3 py-1 text-[11px] font-medium text-[#4A7B9D] shadow-[0_2px_4px_rgba(74,123,157,0.15)] font-[var(--font-poppins)]">
                            Community Made
                          </span>
                        )}
                      </div>
                      {isCommunityFeature && (
                        <button
                          type="button"
                          aria-label="Report for abuse"
                          aria-expanded={isReportModalOpen}
                          onClick={handleReportClick}
                          className={`flex h-6 w-6 items-center justify-center rounded-full border border-[#9BA8B0] text-[#9BA8B0] shadow-sm transition hover:-translate-y-0.5 ${
                            isReportModalOpen ? "bg-[#D8E3E8]" : "bg-white/80"
                          }`}
                        >
                          <AlertCircle
                            size={14}
                            strokeWidth={2}
                            className="text-[#6B7A84]"
                          />
                        </button>
                      )}
                    </div>
                    {isCommunityFeature && isReportModalOpen && (
                      <div
                        className="absolute inset-0 z-20 flex items-center justify-center rounded-[20px] bg-white/70 p-4 backdrop-blur-[2px]"
                        onClick={closeReportModal}
                      >
                        <div
                          className="card-surface relative w-full max-w-xs space-y-3 p-4 text-center"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            aria-label="Close report dialog"
                            onClick={closeReportModal}
                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#F5A3A3] bg-white text-[#D86161] shadow-sm transition hover:-translate-y-0.5"
                          >
                            <X size={12} strokeWidth={2.5} />
                          </button>
                          <p className="text-sm font-semibold text-[#2E5B7A]">
                            Want to submit a report?
                          </p>
                          <p className="text-xs text-[#6B7A84]">
                            Use this if the submission feels abusive or unsafe.
                          </p>
                          {reportMessage && (
                            <p
                              className={`text-xs font-semibold ${
                                reportMessageTone === "error"
                                  ? "text-[#D9967A]"
                                  : "text-[#3D6B43]"
                              }`}
                            >
                              {reportMessage}
                            </p>
                          )}
                          {reportMessageTone !== "success" && (
                            <button
                              type="button"
                              onClick={handleSubmitReport}
                              disabled={isReporting}
                              className="w-full rounded-full bg-[#F5A3A3] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isReporting ? "Submitting..." : "Submit report"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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
                    <button
                      type="button"
                      onClick={() => setIsFlipped(true)}
                      disabled={!currentFeature || isCardHidden}
                      className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Got thoughts? Help us improve this feature.
                    </button>
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
                  <div className="flex flex-1 flex-col gap-4">
                    <p className="text-center text-sm font-semibold text-[#4A7B9D]">
                      What would you change about this feature?
                    </p>
                    <textarea
                      value={currentFeedback}
                      onChange={(event) => handleFeedbackChange(event.target.value)}
                      placeholder="Your thoughts..."
                      className="min-h-[220px] w-full flex-1 resize-none rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 text-sm text-[#4A7B9D] shadow-sm"
                    />
                  </div>
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-center text-xs text-[#9BA8B0]">
                      Your feedback is saved with your yes/no/maybe response.
                    </p>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5"
                    >
                      Back to the feature
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
        {status === "ready" && isSubmissionCard && (
          <div className="absolute inset-0 h-full w-full" style={cardTransitionStyle}>
            <div className="card-surface flex h-full w-full flex-col gap-4 p-6">
              <input
                name="company"
                value={submissionHoneypot}
                onChange={(event) =>
                  handleSubmissionHoneypotChange(event.target.value)
                }
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                className="sr-only"
              />
              <div className="space-y-2">
                <label
                  htmlFor="community-feature-name"
                  className="text-sm font-heading font-medium text-[#4A7B9D]"
                >
                  Feature Name
                </label>
                <input
                  id="community-feature-name"
                  value={submissionName}
                  onChange={(event) => handleSubmissionNameChange(event.target.value)}
                  placeholder="What's your idea called?"
                  className={`w-full rounded-2xl border bg-white px-4 py-3 text-sm font-normal text-[#4A7B9D] shadow-sm ${
                    profanityFlags.name
                      ? "border-[#F5D5C8] focus:border-[#F0B89C]"
                      : "border-[#D8E3E8]"
                  }`}
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="community-feature-description"
                  className="text-sm font-heading font-medium text-[#4A7B9D]"
                >
                  Description
                </label>
                <textarea
                  id="community-feature-description"
                  value={submissionDescription}
                  onChange={(event) =>
                    handleSubmissionDescriptionChange(event.target.value)
                  }
                  placeholder="Tell us what this feature would do..."
                  className={`h-32 w-full resize-none rounded-2xl border bg-white px-4 py-3 text-sm font-normal text-[#4A7B9D] shadow-sm ${
                    profanityFlags.description
                      ? "border-[#F5D5C8] focus:border-[#F0B89C]"
                      : "border-[#D8E3E8]"
                  }`}
                />
              </div>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="community-feature-category"
                    className="text-sm font-heading font-medium text-[#4A7B9D]"
                  >
                    Category
                  </label>
                </div>
                <select
                  id="community-feature-category"
                  value={submissionCategory}
                  onChange={(event) =>
                    handleSubmissionCategoryChange(
                      event.target.value as SubmissionCategory | "",
                    )
                  }
                  className="w-full rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 text-sm font-normal text-[#4A7B9D] shadow-sm"
                >
                  <option value="">Choose a category</option>
                  {submissionCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>
              {submissionMessage && (
                <p
                  className={`mt-auto text-center text-xs ${
                    submissionMessageTone === "error"
                      ? "text-[#D9967A]"
                      : "text-[#3D6B43]"
                  }`}
                >
                  {submissionMessage}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      {isSubmissionCard ? (
        <button
          type="button"
          onClick={handleSubmitIdea}
          disabled={!isSubmissionValid || isSubmitting}
          className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Submitting..." : "Share Your Feature"}
        </button>
      ) : (
        <div className="grid w-full grid-cols-2 gap-3">
          <Link
            href="/waitlist"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#D8E3E8] bg-white/80 px-4 py-3 text-sm font-semibold text-[#4A7B9D] shadow-sm transition hover:-translate-y-0.5 hover:border-[#B8C4CC]"
          >
            Join the waitlist
          </Link>
          <a
            href="https://www.youtube.com/@SaveOneMorePerson"
            target="_blank"
            rel="noreferrer noopener"
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#F5A3A3] bg-white/80 px-4 py-3 text-sm font-semibold text-[#D86161] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#FDEBEC]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#D86161] text-white">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="ml-0.5 h-3.5 w-3.5 fill-current"
              >
                <path d="M8 6.5v11l9-5.5-9-5.5z" />
              </svg>
            </span>
            Visit my channel
          </a>
        </div>
      )}

      {message && (
        <p className="text-center text-xs text-[#9BA8B0]">{message}</p>
      )}
    </section>
  );
}
