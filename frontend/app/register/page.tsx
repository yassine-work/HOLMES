"use client";

import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { HolmesLogo } from "@/components/holmes-logo";
import { isAuthenticated, loginUser, registerUser } from "@/lib/api";

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default function RegisterPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated()) {
      router.replace("/verify");
    }
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const normalizedEmail = email.trim();

    if (!isValidEmail(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    setIsLoading(true);
    try {
      await registerUser(normalizedEmail, password);
      await loginUser(normalizedEmail, password);
      router.replace("/verify");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create account.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="px-4 py-8 md:px-8">
      <div className="mx-auto grid min-h-[78vh] w-full max-w-6xl place-items-center">
        <section className="w-full max-w-xl">
          <div className="mb-5 flex justify-center">
            <HolmesLogo size="hero" priority />
          </div>

          <div className="mc-panel p-5 md:p-7">
            <h1 className="pixel-title text-lg leading-relaxed text-[#eff5ff] md:text-xl">
              Create account
            </h1>
            <p className="pixel-sub mt-3 text-xl leading-6">
              Start verifying content with Holmes
            </p>

            <form onSubmit={onSubmit} className="mt-5 space-y-4">
              <label className="block">
                <span className="pixel-label mb-2 block text-[10px] text-[#b9cbe3]">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="agent@holmes.local"
                  required
                  className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
                />
              </label>

              <label className="block">
                <span className="pixel-label mb-2 block text-[10px] text-[#b9cbe3]">
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
                />
              </label>

              <label className="block">
                <span className="pixel-label mb-2 block text-[10px] text-[#b9cbe3]">
                  Confirm password
                </span>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full border-2 border-[#0e1218] bg-[#19212b] px-3 py-3 text-xl leading-6 text-[#e9eef6] outline-none focus:border-[#63b3ff]"
                />
              </label>

              <button
                type="submit"
                disabled={isLoading}
                className="mc-button mc-button-result inline-flex w-full items-center justify-center gap-2 px-4 py-3 text-[10px] text-[#eff5ff] disabled:cursor-not-allowed disabled:opacity-65"
              >
                {isLoading ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Creating Account...
                  </>
                ) : (
                  "Create Account"
                )}
              </button>

              {error ? (
                <p className="mc-slot px-3 py-2 text-lg leading-5 text-[#ff9595]">
                  {error}
                </p>
              ) : null}
            </form>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#4f5b6b]" />
              <p className="pixel-label text-[10px] text-[#9fb1c7]">or</p>
              <div className="h-px flex-1 bg-[#4f5b6b]" />
            </div>

            <p className="text-lg leading-5 text-[#d8e5f6]">
              Already have an account?{" "}
              <Link href="/login" className="text-[#9cc8ff] underline underline-offset-4">
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
