"use client";

import Link from "next/link";
import Script from "next/script";
import { type FormEvent, useEffect, useState } from "react";

const TURNSTILE_SITE_KEY = "0x4AAAAAACNirQzl3-5r4WFA";

const DOMAIN_SUGGESTIONS: Record<string, string> = {
  "gmail.co": "gmail.com",
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "gmaol.com": "gmail.com",
  "gmal.com": "gmail.com",
  "hotmial.com": "hotmail.com",
  "hotmal.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "yahooo.com": "yahoo.com",
  "yahho.com": "yahoo.com",
  "yaho.com": "yahoo.com",
  "outlok.com": "outlook.com",
  "icloud.con": "icloud.com",
  "aol.con": "aol.com",
};

const getEmailValidationError = (email: string) => {
  if (!email) return "Please enter an email address.";
  if (/\s/.test(email)) return "Email addresses cannot contain spaces.";

  const parts = email.split("@");
  if (parts.length !== 2) return "Email addresses must include one @ symbol.";

  const [local, domain] = parts;
  if (!local) return "Email addresses need text before the @ symbol.";
  if (!domain) return "Email addresses need a domain after the @ symbol.";

  if (email.includes("..")) return "Email addresses cannot contain double dots.";
  if (local.endsWith(".") || domain.startsWith(".")) {
    return "Email addresses cannot have dots next to the @ symbol.";
  }

  if (!domain.includes(".")) {
    return "Email addresses need a domain with a dot (example.com).";
  }

  const tld = domain.split(".").pop() ?? "";
  if (!/^[a-z]{2,}$/i.test(tld)) {
    return "Email addresses must end with a valid domain extension.";
  }

  const suggestion = DOMAIN_SUGGESTIONS[domain];
  if (suggestion) {
    return `Please double-check the email domain. Did you mean ${suggestion}?`;
  }

  return null;
};

export default function WaitlistPage() {
  const [isVerified, setIsVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [submitStatus, setSubmitStatus] = useState<"idle" | "submitting" | "success" | "error">(
    "idle",
  );
  const [submitMessage, setSubmitMessage] = useState("");
  const [showMissionMessage, setShowMissionMessage] = useState(false);
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
    setShowMissionMessage(false);
    if (!isVerified) {
      setSubmitStatus("error");
      setSubmitMessage("Please complete the verification before submitting.");
      return;
    }

    const form = event.currentTarget;
    const formData = new FormData(form);
    const emailValue = formData.get("email");
    const email = typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";
    const validationError = getEmailValidationError(email);
    if (validationError) {
      setSubmitStatus("error");
      setSubmitMessage(validationError);
      return;
    }
    formData.set("email", email);
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
      let payload: { error?: string; alreadySubscribed?: boolean } | null = null;
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
      const alreadySubscribed = Boolean(payload?.alreadySubscribed);
      setSubmitStatus("success");
      setSubmitMessage(
        alreadySubscribed
          ? "You're already on the waitlist. We will keep you posted on launch."
          : "Thanks for joining the waitlist. We will email you when the app launches.",
      );
      setShowMissionMessage(!alreadySubscribed);
      form.reset();
      setIsVerified(false);
      setStatusMessage("");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to submit right now. Please try again.";
      setSubmitStatus("error");
      setSubmitMessage(message);
      setShowMissionMessage(false);
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

        {showMissionMessage && (
          <section className="card-surface space-y-3 p-6 text-sm text-[#6B7A84]">
            <h2 className="text-base font-semibold text-[#2E5B7A]">
              Thank You for Joining Our Mission
            </h2>
            <p className="font-semibold text-[#2E5B7A]">Dear Friend,</p>
            <p>
              Thank you for joining our community and committing to help us save one more
              person.
            </p>
            <p>
              Your decision to be part of this journey means more than you know. Every
              soul matters, and together, we are building something that will reach
              hearts and change lives. You're not just a subscriber - you're a partner
              in this mission.
            </p>
            <p>
              The app we're creating is being shaped by voices like yours. Your
              suggestions, your insights, and your experiences will help us build
              features that truly serve those who need hope, connection, and the
              transforming power of faith. We're building this together, and your input
              is invaluable.
            </p>
            <p>
              As we move forward, we'll keep you updated on our progress, share stories
              of impact, and invite you to contribute ideas that will help us reach one
              more person, and then another, and another.
            </p>
            <p>
              Thank you for saying yes. Thank you for caring. Thank you for being part
              of something bigger than ourselves. We're so grateful to have you with
              us.
            </p>
            <p>In faith and gratitude,</p>
            <p className="font-semibold text-[#2E5B7A]">Save One More Person</p>
            <p className="text-xs italic text-[#9BA8B0]">
              "For the Son of Man came to seek and to save the lost." - Luke 19:10
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
