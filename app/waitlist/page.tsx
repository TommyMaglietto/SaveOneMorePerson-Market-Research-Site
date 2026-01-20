"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

export default function WaitlistPage() {
  const [isVerified, setIsVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as typeof window & {
      onTurnstileSuccess?: () => void;
      onTurnstileExpired?: () => void;
      onTurnstileError?: () => void;
    };

    w.onTurnstileSuccess = () => {
      setIsVerified(true);
      setStatusMessage("");
    };
    w.onTurnstileExpired = () => {
      setIsVerified(false);
      setStatusMessage("Please verify again to submit.");
    };
    w.onTurnstileError = () => {
      setIsVerified(false);
      setStatusMessage("Verification failed. Please refresh and try again.");
    };

    return () => {
      delete w.onTurnstileSuccess;
      delete w.onTurnstileExpired;
      delete w.onTurnstileError;
    };
  }, []);

  return (
    <div className="min-h-screen bg-app px-[clamp(16px,3vw,32px)] pb-[clamp(32px,6vw,64px)] pt-[clamp(32px,6vw,48px)]">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        strategy="afterInteractive"
      />
      <main className="mx-auto flex w-full max-w-[400px] flex-col gap-[clamp(16px,3vw,24px)] min-[480px]:max-w-[500px] lg:max-w-[600px]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#9BA8B0]">
              Email waitlist
            </p>
            <h1 className="font-heading text-2xl font-semibold text-[#2E5B7A]">
              Launch updates
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-[#D8E3E8] bg-white/80 px-4 py-2 text-sm font-semibold text-[#4A7B9D] shadow-sm transition hover:-translate-y-0.5"
          >
            Back to cards
          </Link>
        </header>

        <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
          <p className="font-semibold text-[#2E5B7A]">
            Be the first to know when the app is live.
          </p>
          <p>
            Join the waitlist and we will email you as soon as the launch is ready.
            Your information is stored securely and used only for launch updates.
          </p>
          <p className="text-xs text-[#9BA8B0]">
            We do not share your information and you can unsubscribe any time.
          </p>
        </section>

        <form
          action="https://submit-form.com/y3mhRCNQh"
          method="POST"
          className="card-surface flex flex-col gap-4 p-6"
        >
          <input
            type="checkbox"
            name="_honeypot"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-heading font-medium text-[#4A7B9D]"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              inputMode="email"
              required
              className="w-full rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 text-sm font-normal text-[#4A7B9D] shadow-sm focus:border-[#B8C4CC] focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={!isVerified}
            aria-disabled={!isVerified}
            className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Subscribe
          </button>
          {/* Configure the Turnstile secret key in Formspark > Spam Protection. */}
          <div className="flex justify-center">
            <div
              className="cf-turnstile"
              data-sitekey="0x4AAAAAACNirQzl3-5r4WFA"
              data-callback="onTurnstileSuccess"
              data-expired-callback="onTurnstileExpired"
              data-error-callback="onTurnstileError"
            />
          </div>
          <p
            id="waitlist-status"
            role="status"
            aria-live="polite"
            className="text-center text-xs font-semibold text-[#6B7A84]"
          >
            {statusMessage}
          </p>
        </form>
      </main>
    </div>
  );
}
