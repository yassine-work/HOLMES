"use client";

import { Check, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { createStripeCheckout, isAuthenticated } from "@/lib/api";
import { useUserProfile } from "@/providers/user-profile-provider";

export default function PricingPage() {
  const { isPremium } = useUserProfile();
  const loggedIn = isAuthenticated();

  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onUpgrade() {
    if (isUpgradeLoading) {
      return;
    }

    setError(null);
    setIsUpgradeLoading(true);

    try {
      const response = await createStripeCheckout();
      window.location.href = response.checkout_url;
    } catch (checkoutFailure) {
      const message =
        checkoutFailure instanceof Error
          ? checkoutFailure.message
          : "Unable to create checkout session.";

      setError(
        message.toLowerCase().includes("payment system not configured")
          ? "Payment system not configured yet"
          : message,
      );
    } finally {
      setIsUpgradeLoading(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="mc-panel mb-6 p-5 md:p-6">
        <p className="pixel-label text-[10px] text-[#96abc2]">Plans</p>
        <h1 className="pixel-title mt-2 text-lg leading-relaxed text-[#ebf2fb] md:text-xl">
          Pricing
        </h1>
        <p className="pixel-sub mt-2 text-lg leading-5">
          Choose the plan that matches your verification needs.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="mc-panel p-5 md:p-6">
          <p className="pixel-label text-[10px] text-[#c9d7ea]">Free</p>
          <p className="mt-2 text-4xl text-[#eff5ff] md:text-5xl">$0 / month</p>

          <ul className="mt-5 space-y-2 text-lg leading-5 text-[#d8e5f6]">
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Text verification</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />URL verification</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Web presence check</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />AI verdict with reasoning</li>
            <li className="inline-flex items-center gap-2 text-[#8fa2bb]"><X className="h-4 w-4" />Image verification</li>
            <li className="inline-flex items-center gap-2 text-[#8fa2bb]"><X className="h-4 w-4" />Video verification</li>
            <li className="inline-flex items-center gap-2 text-[#8fa2bb]"><X className="h-4 w-4" />Audio verification</li>
            <li className="inline-flex items-center gap-2 text-[#8fa2bb]"><X className="h-4 w-4" />Full multi-agent debate pipeline</li>
          </ul>

          <div className="mt-6">
            {!loggedIn ? (
              <Link
                href="/register"
                className="mc-button mc-button-stone inline-flex w-full items-center justify-center px-4 py-3 text-[10px]"
              >
                Get Started
              </Link>
            ) : !isPremium ? (
              <button
                type="button"
                disabled
                className="mc-button mc-button-stone inline-flex w-full items-center justify-center px-4 py-3 text-[10px] opacity-65"
              >
                Current Plan
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="mc-button mc-button-stone inline-flex w-full items-center justify-center px-4 py-3 text-[10px] opacity-65"
              >
                Included
              </button>
            )}
          </div>
        </article>

        <article className="mc-panel mc-status-glow-inconclusive p-5 md:p-6">
          <p className="pixel-label text-[10px] text-[#9cc8ff]">Premium</p>
          <p className="mt-2 text-4xl text-[#eff5ff] md:text-5xl">$9 / month</p>

          <ul className="mt-5 space-y-2 text-lg leading-5 text-[#d8e5f6]">
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Everything in Free</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Image deepfake detection</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Video deepfake detection</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Audio verification</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Full multi-agent AI debate</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />BitMind AI detection</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Browser extension access</li>
            <li className="inline-flex items-center gap-2"><Check className="h-4 w-4 text-[#79e286]" />Priority processing</li>
          </ul>

          <div className="mt-6">
            {isPremium ? (
              <button
                type="button"
                disabled
                className="mc-button mc-button-result inline-flex w-full items-center justify-center px-4 py-3 text-[10px] text-[#eff5ff] opacity-65"
              >
                Current Plan
              </button>
            ) : loggedIn ? (
              <button
                type="button"
                onClick={onUpgrade}
                disabled={isUpgradeLoading}
                className="mc-button mc-button-result inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[10px] text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isUpgradeLoading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  "Upgrade Now"
                )}
              </button>
            ) : (
              <Link
                href="/register"
                className="mc-button mc-button-result inline-flex w-full items-center justify-center px-4 py-3 text-[10px] text-[#eff5ff]"
              >
                Upgrade Now
              </Link>
            )}
          </div>
        </article>
      </section>

      {error ? (
        <section className="mc-panel mt-4 border-[#331515] bg-[#2a1a1a] p-4 text-[#ffb6b6]">
          <p className="text-lg leading-5">{error}</p>
        </section>
      ) : null}
    </main>
  );
}
