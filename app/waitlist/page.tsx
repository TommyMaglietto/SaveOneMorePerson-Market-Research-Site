"use client";

import Link from "next/link";
import Script from "next/script";
import { type FormEvent, useEffect, useState } from "react";

const TURNSTILE_SITE_KEY = "0x4AAAAAACNirQzl3-5r4WFA";

export default function WaitlistPage() {
  const [isVerified, setIsVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [submitMessage, setSubmitMessage] = useState("");
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitStatus === "submitting") return;
    if (!isVerified) {
      setSubmitStatus("error");
      setSubmitMessage("Please complete the verification before submitting.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const body = new URLSearchParams();
    formData.forEach((value, key) => {
      if (typeof value === "string") {
        body.append(key, value);
      }
    });
    setSubmitStatus("submitting");
    setSubmitMessage("");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
      });
      const responseText = await response.text();
      let payload: { error?: string } | null = null;
      try {
        payload = responseText ? (JSON.parse(responseText) as { error?: string }) : null;
      } catch {
        payload = null;
      }
      if (!response.ok) {
        const fallbackMessage =
          responseText?.trim() || `Submission failed (status ${response.status}).`;
        throw new Error(payload?.error ?? fallbackMessage);
      }
      setSubmitStatus("success");
      setSubmitMessage(
        "Thanks for joining the waitlist. We will email you when the app launches.",
      );
      form.reset();
      setIsVerified(false);
      setStatusMessage("Please verify again to submit.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again.";
      setSubmitStatus("error");
      setSubmitMessage(message);
    }
  };

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
          action="/api/waitlist/submit"
          method="POST"
          onSubmit={handleSubmit}
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
            disabled={!isVerified || submitStatus === "submitting"}
            aria-disabled={!isVerified || submitStatus === "submitting"}
            className="w-full rounded-2xl bg-[#8FC5E8] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitStatus === "submitting" ? "Submitting..." : "Subscribe"}
          </button>
          <div className="flex justify-center">
            <div
              className="cf-turnstile"
              data-sitekey={TURNSTILE_SITE_KEY}
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
          {submitMessage && (
            <p
              role="status"
              aria-live="polite"
              className={`text-center text-xs font-semibold ${
                submitStatus === "success" ? "text-[#3D6B43]" : "text-rose-500"
              }`}
            >
              {submitMessage}
            </p>
          )}
        </form>
      </main>
    </div>
  );
}
