"use client";

import Link from "next/link";
import { AlertCircle, Clock4, History, Link2, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { VerificationJobStatusResponse, getVerificationHistory, isAuthenticated } from "@/lib/api";

type HistoryItem = VerificationJobStatusResponse & {
  created_at?: string;
};

function getStatusBadge(status: VerificationJobStatusResponse["status"]) {
  if (status === "VERIFIED") {
    return {
      label: "VERIFIED",
      className: "text-[#79e286]",
    };
  }

  if (status === "SUSPICIOUS") {
    return {
      label: "SUSPICIOUS",
      className: "text-[#ff8686]",
    };
  }

  return {
    label: "INCONCLUSIVE",
    className: "text-[#c7d2de]",
  };
}

function getSourceKindLabel(sourceKind: VerificationJobStatusResponse["source_kind"]): string {
  if (sourceKind === "url") {
    return "url";
  }
  if (sourceKind === "text") {
    return "text";
  }
  return "media";
}

function truncateLabel(value: string, maxLength = 100): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function getMainLabel(item: HistoryItem): string {
  if (item.submitted_url && item.submitted_url.trim().length > 0) {
    return item.submitted_url;
  }

  if (item.reasoning && item.reasoning.trim().length > 0) {
    return truncateLabel(item.reasoning.trim());
  }

  return "No reasoning available";
}

function formatConfidence(value: number | null): string {
  const safe = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return `${Math.max(0, Math.min(100, safe)).toFixed(0)}%`;
}

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const absMs = Math.abs(diffMs);

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absMs < hour) {
    return rtf.format(Math.round(diffMs / minute), "minute");
  }
  if (absMs < day) {
    return rtf.format(Math.round(diffMs / hour), "hour");
  }
  if (absMs < week) {
    return rtf.format(Math.round(diffMs / day), "day");
  }
  if (absMs < month) {
    return rtf.format(Math.round(diffMs / week), "week");
  }
  if (absMs < year) {
    return rtf.format(Math.round(diffMs / month), "month");
  }
  return rtf.format(Math.round(diffMs / year), "year");
}

function getCreatedAtLabel(item: HistoryItem): string {
  if (item.created_at) {
    return formatRelativeTime(item.created_at);
  }
  return item.job_id;
}

export default function HistoryPage() {
  const router = useRouter();

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function loadHistory() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await getVerificationHistory();
        if (!cancelled) {
          setItems(response as HistoryItem[]);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Unable to load verification history.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const hasItems = useMemo(() => items.length > 0, [items.length]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="mc-panel mb-6 p-5 md:p-6">
        <p className="pixel-label text-[10px] text-[#96abc2]">Quest Log</p>
        <h1 className="pixel-title mt-2 text-lg leading-relaxed text-[#ebf2fb] md:text-xl">
          Verification History
        </h1>
        <p className="pixel-sub mt-2 text-lg leading-5">
          Review your previous investigations and open any report instantly.
        </p>
      </header>

      {isLoading ? (
        <section className="mc-panel p-5 md:p-6">
          <p className="status-pulse inline-flex items-center gap-2 text-xl leading-6 text-[#d8e7fb]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading investigation history...
          </p>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mc-panel border-[#331515] bg-[#2a1a1a] p-5 text-[#ffb6b6]">
          <p className="inline-flex items-center gap-2 text-xl leading-6">
            <AlertCircle className="h-5 w-5" />
            Could not load history.
          </p>
          <p className="mt-2 text-lg leading-5">{error}</p>
        </section>
      ) : null}

      {!isLoading && !error && !hasItems ? (
        <section className="mc-panel grid min-h-[320px] place-items-center p-6 text-center">
          <div>
            <p className="pixel-title text-base text-[#ecf3ff]">No verification history yet</p>
            <p className="pixel-sub mt-2 text-lg leading-5 text-[#9cb1ca]">
              Start your first investigation to populate this page.
            </p>
            <Link
              href="/verify"
              className="mc-button mc-button-result mt-5 inline-flex items-center gap-2 px-4 py-2 text-[10px] text-[#eff5ff]"
            >
              <ShieldCheck className="h-4 w-4" />
              Go to Verify
            </Link>
          </div>
        </section>
      ) : null}

      {!isLoading && !error && hasItems ? (
        <section className="space-y-3">
          {items.map((item) => {
            const statusBadge = getStatusBadge(item.status);

            return (
              <article key={item.job_id} className="mc-panel p-4 md:p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={[
                          "mc-chip inline-flex items-center px-2 py-1 text-[10px]",
                          statusBadge.className,
                        ].join(" ")}
                      >
                        {statusBadge.label}
                      </span>

                      <span className="mc-chip inline-flex items-center px-2 py-1 text-[10px] text-[#cdddf2]">
                        {getSourceKindLabel(item.source_kind)}
                      </span>
                    </div>

                    <p className="text-xl leading-6 text-[#e6edf7]">{getMainLabel(item)}</p>

                    <div className="flex flex-wrap items-center gap-3 text-lg leading-5 text-[#9cb1ca]">
                      <span className="inline-flex items-center gap-1">
                        <History className="h-4 w-4" />
                        {getCreatedAtLabel(item)}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock4 className="h-4 w-4" />
                        Confidence: {formatConfidence(item.confidence_score)}
                      </span>
                    </div>
                  </div>

                  <Link
                    href={`/result/${item.job_id}`}
                    className="mc-button mc-button-stone inline-flex items-center justify-center gap-2 px-4 py-2 text-[10px]"
                  >
                    <Link2 className="h-4 w-4" />
                    View Report
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
