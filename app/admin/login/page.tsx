"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FormEvent } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        throw new Error("Invalid password.");
      }

      router.push("/admin");
    } catch {
      setMessage("Invalid password. Please try again.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-app px-4 pb-16 pt-10">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-[#9BA8B0]">
            Admin portal
          </p>
          <h1 className="font-heading text-3xl font-semibold text-[#2E5B7A]">
            Sign in
          </h1>
        </header>

        <form
          onSubmit={handleSubmit}
          className="card-surface flex flex-col gap-4 p-6"
        >
          <label className="text-sm font-semibold text-[#6B7A84]">
            Admin password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-[#D8E3E8] bg-white px-4 py-3 text-sm text-[#4A7B9D] shadow-sm"
              placeholder="Enter password"
              required
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-full bg-[#B8A8D4] px-4 py-3 text-sm font-semibold text-[#2E5B7A] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Signing in..." : "Access dashboard"}
          </button>
          {message && (
            <p className="text-xs font-semibold text-rose-500">{message}</p>
          )}
        </form>

        <Link href="/" className="text-center text-sm font-semibold text-[#6B7A84]">
          Back to app
        </Link>
      </div>
    </div>
  );
}
