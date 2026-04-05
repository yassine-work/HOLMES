"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  VerificationJobStatusResponse,
  canAccessAdminDashboard,
  getAuthToken,
  getVerificationHistory,
} from "@/lib/api";

type AdminDashboardResponse = {
  total_users: number;
  total_verifications: number;
  total_tasks: number;
};

type HistoryItem = VerificationJobStatusResponse & {
  created_at?: string;
};

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");

function extractErrorMessage(errorBody: unknown, fallback: string): string {
  if (typeof errorBody === "string") {
    return errorBody;
  }

  if (typeof errorBody === "object" && errorBody !== null) {
    const body = errorBody as Record<string, unknown>;

    if (typeof body.detail === "string") {
      return body.detail;
    }

    if (Array.isArray(body.detail) && body.detail.length > 0) {
      const first = body.detail[0] as unknown;
      if (typeof first === "string") {
        return first;
      }
      if (typeof first === "object" && first !== null) {
        const msg = (first as Record<string, unknown>).msg;
        if (typeof msg === "string") {
          return msg;
        }
      }
      return String(first);
    }
  }

  return fallback;
}

async function requestBackend<T>(
  endpoint: string,
  init: RequestInit,
  errorMessage: string,
  requireAuth = false,
): Promise<T> {
  const headers = new Headers(init.headers ?? undefined);

  if (requireAuth) {
    const token = getAuthToken();
    if (!token) {
      throw new Error("Please login first.");
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = await response.text();
    }
    throw new Error(extractErrorMessage(errorBody, errorMessage));
  }

  return (await response.json()) as T;
}

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

function truncateLabel(value: string, maxLength = 90): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function getReferenceLabel(item: HistoryItem): string {
  if (item.submitted_url && item.submitted_url.trim().length > 0) {
    return item.submitted_url;
  }

  if (item.reasoning && item.reasoning.trim().length > 0) {
    return truncateLabel(item.reasoning.trim());
  }

  return `Job ${item.job_id}`;
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

function getDateLabel(item: HistoryItem): string {
  if (item.created_at) {
    return formatRelativeTime(item.created_at);
  }
  return item.job_id;
}

export default function AdminPage() {
  const router = useRouter();

  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    async function loadAdminData() {
      setIsLoading(true);
      setError(null);

      try {
        const hasAdminAccess = await canAccessAdminDashboard();

        if (!hasAdminAccess) {
          router.replace("/");
          return;
        }

        const [dashboardData, historyData] = await Promise.all([
          requestBackend<{
            total_users: number;
            total_verifications: number;
            total_tasks: number;
          }>("/admin/dashboard", { method: "GET" }, "Unable to load.", true),
          getVerificationHistory(),
        ]);

        if (cancelled) {
          return;
        }

        setDashboard(dashboardData);
        setHistoryItems((historyData as HistoryItem[]).slice(0, 10));
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Unable to load.";

        if (message === "Please login first.") {
          router.replace("/login");
          return;
        }

        setError(message);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadAdminData();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const metrics = useMemo(() => {
    if (!dashboard) {
      return [];
    }

    return [
      {
        key: "users",
        label: "Total Users",
        value: dashboard.total_users,
        icon: Users,
      },
      {
        key: "verifications",
        label: "Total Verifications",
        value: dashboard.total_verifications,
        icon: CheckCircle2,
      },
      {
        key: "tasks",
        label: "Total Tasks",
        value: dashboard.total_tasks,
        icon: Activity,
      },
    ];
  }, [dashboard]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 md:px-8 md:py-14">
      <header className="mc-panel mb-6 p-5 md:p-6">
        <p className="pixel-label text-[10px] text-[#96abc2]">Admin Hall</p>
        <h1 className="pixel-title mt-2 text-lg leading-relaxed text-[#ebf2fb] md:text-xl">
          Dashboard
        </h1>
        <p className="pixel-sub mt-2 text-lg leading-5">
          Monitor platform activity and recent verification outcomes.
        </p>
      </header>

      {isLoading ? (
        <section className="mc-panel p-5 md:p-6">
          <p className="status-pulse inline-flex items-center gap-2 text-xl leading-6 text-[#d8e7fb]">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading admin dashboard...
          </p>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className="mc-panel border-[#331515] bg-[#2a1a1a] p-5 text-[#ffb6b6]">
          <p className="inline-flex items-center gap-2 text-xl leading-6">
            <AlertCircle className="h-5 w-5" />
            Could not load admin dashboard.
          </p>
          <p className="mt-2 text-lg leading-5">{error}</p>
        </section>
      ) : null}

      {!isLoading && !error && dashboard ? (
        <>
          <section className="mb-6 grid gap-3 md:grid-cols-3">
            {metrics.map((metric) => {
              const MetricIcon = metric.icon;

              return (
                <article key={metric.key} className="mc-panel p-4 md:p-5">
                  <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                    <MetricIcon className="h-4 w-4" />
                    {metric.label}
                  </p>
                  <p className="mt-3 text-4xl leading-none text-[#eff5ff] md:text-5xl">
                    {metric.value}
                  </p>
                  <p className="mt-2 text-lg leading-5 text-[#9cb1ca]">{metric.label}</p>
                </article>
              );
            })}
          </section>

          <section className="mc-panel p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="pixel-label text-[10px] text-[#c9d7ea]">Recent Verifications</p>
              <span className="mc-chip px-2 py-1 text-[10px] text-[#cadcf3]">
                {historyItems.length}
              </span>
            </div>

            {historyItems.length > 0 ? (
              <div className="space-y-2">
                {historyItems.map((item) => {
                  const statusBadge = getStatusBadge(item.status);

                  return (
                    <article key={item.job_id} className="mc-slot p-3">
                      <div className="grid gap-2 md:grid-cols-[auto_auto_1fr_auto_auto] md:items-center md:gap-3">
                        <span
                          className={[
                            "mc-chip inline-flex w-fit items-center px-2 py-1 text-[10px]",
                            statusBadge.className,
                          ].join(" ")}
                        >
                          {statusBadge.label}
                        </span>

                        <span className="mc-chip inline-flex w-fit items-center px-2 py-1 text-[10px] text-[#cdddf2]">
                          {getSourceKindLabel(item.source_kind)}
                        </span>

                        <p className="min-w-0 truncate text-lg leading-5 text-[#e6edf7]">
                          {getReferenceLabel(item)}
                        </p>

                        <p className="text-base text-[#9cb1ca]">
                          {formatConfidence(item.confidence_score)}
                        </p>

                        <p className="text-base text-[#9cb1ca]">{getDateLabel(item)}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mc-slot inline-flex items-center gap-2 px-3 py-2 text-lg leading-5 text-[#9cb1ca]">
                <ShieldAlert className="h-4 w-4" />
                No verifications found yet.
              </p>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
