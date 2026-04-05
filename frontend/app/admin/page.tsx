"use client";

import {
  Activity,
  Crown,
  AlertCircle,
  CheckCircle2,
  Shield,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  UserX,
  LoaderCircle,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  AdminDashboardResponse,
  AdminUser,
  VerificationJobStatusResponse,
  canAccessAdminDashboard,
  createAdminUser,
  deleteAdminUser,
  getAdminDashboard,
  getAuthToken,
  getVerificationHistory,
  listAdminUsers,
  updateAdminUser,
} from "@/lib/api";

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
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [processingUserId, setProcessingUserId] = useState<string | null>(null);

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [newUserIsPremium, setNewUserIsPremium] = useState(false);
  const [newUserIsActive, setNewUserIsActive] = useState(true);

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

        const [dashboardData, historyData, usersData] = await Promise.all([
          getAdminDashboard(),
          getVerificationHistory(),
          listAdminUsers(),
        ]);

        if (cancelled) {
          return;
        }

        setDashboard(dashboardData);
        setHistoryItems((historyData as HistoryItem[]).slice(0, 10));
        setUsers(usersData);
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

  async function refreshUsers() {
    const usersData = await listAdminUsers();
    setUsers(usersData);
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setActionError(null);
    setActionMessage(null);
    setIsCreating(true);

    try {
      await createAdminUser({
        email: newUserEmail.trim(),
        password: newUserPassword,
        is_admin: newUserIsAdmin,
        is_premium: newUserIsPremium,
        is_active: newUserIsActive,
      });

      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserIsAdmin(false);
      setNewUserIsPremium(false);
      setNewUserIsActive(true);

      await refreshUsers();
      setActionMessage("User created.");
    } catch (createError) {
      setActionError(createError instanceof Error ? createError.message : "Unable to create user.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleToggleUserFlag(
    user: AdminUser,
    field: "is_admin" | "is_premium" | "is_active",
  ) {
    setActionError(null);
    setActionMessage(null);
    setProcessingUserId(user.id);

    try {
      const payload = { [field]: !user[field] };
      const updated = await updateAdminUser(user.id, payload);
      setUsers((current) => current.map((item) => (item.id === user.id ? updated : item)));
      setActionMessage("User updated.");
    } catch (updateError) {
      setActionError(updateError instanceof Error ? updateError.message : "Unable to update user.");
    } finally {
      setProcessingUserId(null);
    }
  }

  async function handleDeleteUser(user: AdminUser) {
    const confirmed = window.confirm(`Delete ${user.email}? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setActionError(null);
    setActionMessage(null);
    setProcessingUserId(user.id);

    try {
      await deleteAdminUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setActionMessage("User deleted.");
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to delete user.");
    } finally {
      setProcessingUserId(null);
    }
  }

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

          <section className="mc-panel mb-6 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                <UserPlus className="h-4 w-4" />
                Add User
              </p>
              <span className="mc-chip px-2 py-1 text-[10px] text-[#cadcf3]">
                {users.length} users
              </span>
            </div>

            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleCreateUser}>
              <label className="space-y-2">
                <span className="pixel-label text-[10px] text-[#c9d7ea]">Email</span>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  className="w-full rounded-md border border-[#2f455f] bg-[#101b2a] px-3 py-2 text-base text-[#edf5ff] outline-none focus:border-[#4c698a]"
                  placeholder="user@example.com"
                />
              </label>

              <label className="space-y-2">
                <span className="pixel-label text-[10px] text-[#c9d7ea]">Password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  className="w-full rounded-md border border-[#2f455f] bg-[#101b2a] px-3 py-2 text-base text-[#edf5ff] outline-none focus:border-[#4c698a]"
                  placeholder="Minimum 8 characters"
                />
              </label>

              <div className="md:col-span-2 flex flex-wrap items-center gap-3">
                <label className="mc-chip inline-flex items-center gap-2 px-3 py-2 text-[10px] text-[#cadcf3]">
                  <input
                    type="checkbox"
                    checked={newUserIsAdmin}
                    onChange={(event) => setNewUserIsAdmin(event.target.checked)}
                  />
                  Admin
                </label>
                <label className="mc-chip inline-flex items-center gap-2 px-3 py-2 text-[10px] text-[#cadcf3]">
                  <input
                    type="checkbox"
                    checked={newUserIsPremium}
                    onChange={(event) => setNewUserIsPremium(event.target.checked)}
                  />
                  Premium
                </label>
                <label className="mc-chip inline-flex items-center gap-2 px-3 py-2 text-[10px] text-[#cadcf3]">
                  <input
                    type="checkbox"
                    checked={newUserIsActive}
                    onChange={(event) => setNewUserIsActive(event.target.checked)}
                  />
                  Active
                </label>

                <button
                  type="submit"
                  disabled={isCreating}
                  className="mc-button px-4 py-2 text-[10px] disabled:opacity-60"
                >
                  {isCreating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>

            {actionError ? (
              <p className="mt-3 text-base text-[#ffb6b6]">{actionError}</p>
            ) : null}
            {actionMessage ? (
              <p className="mt-3 text-base text-[#9ee6af]">{actionMessage}</p>
            ) : null}
          </section>

          <section className="mc-panel mb-6 p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="pixel-label inline-flex items-center gap-2 text-[10px] text-[#c9d7ea]">
                <UserCog className="h-4 w-4" />
                Manage Users
              </p>
            </div>

            {users.length > 0 ? (
              <div className="space-y-2">
                {users.map((user) => {
                  const isProcessing = processingUserId === user.id;

                  return (
                    <article key={user.id} className="mc-slot p-3">
                      <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                        <div className="min-w-0">
                          <p className="truncate text-lg leading-5 text-[#e6edf7]">{user.email}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="mc-chip inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[#cadcf3]">
                              {user.is_admin ? <ShieldCheck className="h-3 w-3" /> : <Shield className="h-3 w-3" />}
                              {user.is_admin ? "Admin" : "User"}
                            </span>
                            <span className="mc-chip inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[#cadcf3]">
                              <Crown className="h-3 w-3" />
                              {user.is_premium ? "Premium" : "Free"}
                            </span>
                            <span className="mc-chip inline-flex items-center gap-1 px-2 py-1 text-[10px] text-[#cadcf3]">
                              {user.is_active ? "Active" : "Inactive"}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 md:justify-end">
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleToggleUserFlag(user, "is_admin")}
                            className="mc-button px-3 py-2 text-[10px] disabled:opacity-60"
                          >
                            {user.is_admin ? "Remove Admin" : "Make Admin"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleToggleUserFlag(user, "is_premium")}
                            className="mc-button px-3 py-2 text-[10px] disabled:opacity-60"
                          >
                            {user.is_premium ? "Set Free" : "Set Premium"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleToggleUserFlag(user, "is_active")}
                            className="mc-button px-3 py-2 text-[10px] disabled:opacity-60"
                          >
                            {user.is_active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => handleDeleteUser(user)}
                            className="mc-button inline-flex items-center gap-1 px-3 py-2 text-[10px] text-[#ffb6b6] disabled:opacity-60"
                          >
                            <UserX className="h-3 w-3" />
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="mc-slot inline-flex items-center gap-2 px-3 py-2 text-lg leading-5 text-[#9cb1ca]">
                <ShieldAlert className="h-4 w-4" />
                No users found.
              </p>
            )}
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
