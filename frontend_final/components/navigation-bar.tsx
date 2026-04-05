"use client";

import Link from "next/link";
import { Compass, DoorOpen, Gem, ScrollText, ShieldCheck, Tags } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { HolmesLogo } from "@/components/holmes-logo";
import {
  canAccessAdminDashboard,
  createStripeCheckout,
  isAuthenticated,
  logoutUser,
  unsubscribePremium,
} from "@/lib/api";
import { useUserProfile } from "@/providers/user-profile-provider";
import { useSound } from "@/providers/sound-provider";

export function NavigationBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { play } = useSound();
  const { isPremium, isAdmin: profileIsAdmin, refreshProfile } = useUserProfile();

  const [authed, setAuthed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isUnsubscribing, setIsUnsubscribing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = async () => {
      const loggedIn = isAuthenticated();
      setAuthed(loggedIn);

      if (!loggedIn) {
        setIsAdmin(false);
        return;
      }

      const adminAccess = await canAccessAdminDashboard();
      setIsAdmin(adminAccess);
    };

    const onStorage = () => {
      void refresh();
    };

    void refresh();
    window.addEventListener("storage", onStorage);
    window.addEventListener("holmes-auth-updated", onStorage);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("holmes-auth-updated", onStorage);
    };
  }, []);

  function onLogout() {
    logoutUser();
    play("click");
    setAuthed(false);
    setIsAdmin(false);
    router.push("/login");
  }

  async function onUpgrade() {
    if (isUpgrading) {
      return;
    }

    setCheckoutError(null);
    setIsUpgrading(true);
    play("click");

    try {
      const response = await createStripeCheckout();
      window.location.href = response.checkout_url;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create checkout session.";
      setCheckoutError(
        message.toLowerCase().includes("payment system not configured")
          ? "Payment system not configured yet"
          : message,
      );
    } finally {
      setIsUpgrading(false);
    }
  }

  async function onUnsubscribe() {
    if (isUnsubscribing) {
      return;
    }

    setCheckoutError(null);
    setIsUnsubscribing(true);
    play("click");

    try {
      const response = await unsubscribePremium();
      if (response.message) {
        setCheckoutError(response.message);
      }
      await refreshProfile();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to unsubscribe right now.";
      setCheckoutError(message);
    } finally {
      setIsUnsubscribing(false);
    }
  }

  const isAuthPage = pathname === "/login" || pathname === "/register";

  return (
    <header className="px-4 pb-2 pt-4 md:px-8 md:pt-6">
      <div className="mc-panel mx-auto flex w-full max-w-6xl items-center justify-between gap-3 p-3 md:p-4">
        <Link
          href="/"
          onClick={() => play("click")}
          className="inline-flex items-center gap-3"
        >
          <HolmesLogo size="nav" priority />
          <div>
            <p className="pixel-label text-[10px] text-[#a9bfd9]">HOLMES</p>
            <p className="text-lg leading-5 text-[#e7eef9]">Detective Realm</p>
          </div>
        </Link>

        <nav className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href="/"
            onClick={() => play("click")}
            className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
          >
            <Compass className="h-3.5 w-3.5" />
            Home
          </Link>

          <Link
            href="/pricing"
            onClick={() => play("click")}
            className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
          >
            <Tags className="h-3.5 w-3.5" />
            Pricing
          </Link>

          {authed ? (
            <>
              <Link
                href="/verify"
                onClick={() => play("click")}
                className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                Verify
              </Link>
              <Link
                href="/history"
                onClick={() => play("click")}
                className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
              >
                <ScrollText className="h-3.5 w-3.5" />
                History
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  onClick={() => play("click")}
                  className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
                >
                  Admin
                </Link>
              ) : null}

              {!isPremium ? (
                <button
                  type="button"
                  onClick={onUpgrade}
                  disabled={isUpgrading}
                  className="mc-button mc-button-result inline-flex items-center gap-2 px-3 py-2 text-[10px] text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <Gem className="h-3.5 w-3.5" />
                  {isUpgrading ? "Upgrading..." : "Upgrade to Premium"}
                </button>
              ) : !profileIsAdmin ? (
                <button
                  type="button"
                  onClick={onUnsubscribe}
                  disabled={isUnsubscribing}
                  className="mc-button mc-button-result inline-flex items-center gap-2 px-3 py-2 text-[10px] text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
                >
                  <Gem className="h-3.5 w-3.5" />
                  {isUnsubscribing ? "Unsubscribing..." : "Unsubscribe"}
                </button>
              ) : null}

              <button
                type="button"
                onClick={onLogout}
                className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
              >
                <DoorOpen className="h-3.5 w-3.5" />
                Logout
              </button>
            </>
          ) : (
            <>
              {!isAuthPage ? (
                <Link
                  href="/results/demo"
                  onClick={() => play("click")}
                  className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  Preview
                </Link>
              ) : null}
              <Link
                href="/login"
                onClick={() => play("click")}
                className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                onClick={() => play("click")}
                className="mc-button mc-button-stone inline-flex items-center gap-2 px-3 py-2 text-[10px]"
              >
                Register
              </Link>
            </>
          )}

          {checkoutError ? (
            <span className="mc-slot px-2 py-1 text-lg leading-5 text-[#ff9595]">
              {checkoutError}
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
