"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Selection = {
  featureId: string;
  name: string;
  category: string | null;
  score: 1 | 2 | 3;
  createdAt: string;
};

const LOCAL_STORAGE_KEY = "somp-selections";

const scoreStyles: Record<Selection["score"], string> = {
  1: "bg-[#D4DBE0] text-[#4A7B9D]",
  2: "bg-[#B8C4CC] text-[#4A7B9D]",
  3: "bg-[#F5D5C8] text-[#2E5B7A]",
};

const scoreLabels: Record<Selection["score"], string> = {
  1: "No",
  2: "Maybe",
  3: "Yes",
};

export default function SelectionsList() {
  const [selections, setSelections] = useState<Selection[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Selection[];
      setSelections(parsed);
    } catch {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  }, []);

  const counts = useMemo(() => {
    return selections.reduce(
      (acc, selection) => {
        acc.total += 1;
        acc[selection.score] += 1;
        return acc;
      },
      { total: 0, 1: 0, 2: 0, 3: 0 } as Record<string, number>,
    );
  }, [selections]);

  const handleClear = () => {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    setSelections([]);
  };

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9BA8B0]">
            Your picks
          </p>
          <h1 className="font-heading text-2xl font-semibold text-[#2E5B7A]">
            Selections
          </h1>
        </div>
        <Link
          href="/"
          className="rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-2 text-sm font-semibold text-[#4A7B9D] shadow-sm transition hover:-translate-y-0.5"
        >
          Back to cards
        </Link>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-[#6B7A84]">
        <div className="rounded-2xl bg-white/70 py-2 shadow-sm">
          {counts.total} total
        </div>
        <div className="rounded-2xl bg-white/70 py-2 shadow-sm">
          {counts[3]} yes
        </div>
        <div className="rounded-2xl bg-white/70 py-2 shadow-sm">
          {counts[2]} maybe
        </div>
      </div>

      {selections.length === 0 ? (
        <div className="card-surface flex flex-col items-center gap-2 p-6 text-center text-sm text-[#9BA8B0]">
          <p className="font-heading text-lg text-[#2E5B7A]">
            Nothing saved yet.
          </p>
          <p>Swipe through the cards to capture your preferences.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {selections.map((selection) => (
            <div
              key={`${selection.featureId}-${selection.createdAt}`}
              className="card-surface flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-[#2E5B7A]">
                  {selection.name}
                </p>
                <p className="text-xs text-[#9BA8B0]">
                  {selection.category ?? "General"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${scoreStyles[selection.score]}`}
              >
                {scoreLabels[selection.score]}
              </span>
            </div>
          ))}
        </div>
      )}

      {selections.length > 0 && (
        <button
          type="button"
          onClick={handleClear}
          className="rounded-full border border-[#D8E3E8] bg-white/70 px-4 py-2 text-sm font-semibold text-[#6B7A84] shadow-sm transition hover:-translate-y-0.5"
        >
          Clear selections
        </button>
      )}
    </section>
  );
}
