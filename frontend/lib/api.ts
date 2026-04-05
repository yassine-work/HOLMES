export type CurrentJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED";

export type VerificationStatus =
  | "VERIFIED"
  | "SUSPICIOUS"
  | "INCONCLUSIVE"
  | null;

export type VerificationJobQueuedResponse = {
  job_id: string;
  current_status: CurrentJobStatus;
};

export type VerificationJobStatusResponse = {
  job_id: string;
  current_status: CurrentJobStatus;
  status: VerificationStatus;
  confidence_score: number | null;
  reasoning: string | null;
  source_kind?: "text" | "url" | "media";
  submitted_url?: string | null;
  analysis_id?: string | null;
  url_stats?: UrlStats | null;
  url_highlights?: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  is_admin: boolean;
  is_premium: boolean;
};

export type RegisterResponse = {
  id: string;
  email: string;
  is_admin: boolean;
  is_premium: boolean;
  is_active: boolean;
  created_at: string;
};

export type UserProfile = {
  id: string;
  email: string;
  is_admin: boolean;
  is_premium: boolean;
  is_active: boolean;
  created_at: string;
};

export type AdminDashboardResponse = {
  total_users: number;
  total_verifications: number;
  total_tasks: number;
};

export type AdminUser = {
  id: string;
  email: string;
  is_admin: boolean;
  is_premium: boolean;
  is_active: boolean;
};

export type AdminUsersListResponse = {
  users: AdminUser[];
};

export type AdminCreateUserPayload = {
  email: string;
  password: string;
  is_admin?: boolean;
  is_premium?: boolean;
  is_active?: boolean;
};

export type AdminUpdateUserPayload = {
  is_admin?: boolean;
  is_premium?: boolean;
  is_active?: boolean;
};

type UrlStats = {
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  timeout: number;
};

type CreateVerificationPayload = {
  input: string;
  url: string;
  file: File | null;
};

export type HolmesContentType = "text" | "image" | "video" | "audio" | "url";

type HolmesVerificationResponse = {
  id: string;
  content_type: HolmesContentType;
  input_reference: string;
  verdict: string;
  confidence: number;
  details: Record<string, unknown>;
  created_at: string;
};

const AUTH_TOKEN_STORAGE_KEY = "holmes_token";
const VERIFICATION_CACHE_STORAGE_KEY = "holmes_verification_cache";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readVerificationCache(): Record<string, VerificationJobStatusResponse> {
  if (!canUseStorage()) {
    return {};
  }

  const raw = window.localStorage.getItem(VERIFICATION_CACHE_STORAGE_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as Record<string, VerificationJobStatusResponse>;
  } catch {
    return {};
  }
}

function writeVerificationCache(entry: VerificationJobStatusResponse): void {
  if (!canUseStorage()) {
    return;
  }

  const current = readVerificationCache();
  current[entry.job_id] = entry;
  window.localStorage.setItem(VERIFICATION_CACHE_STORAGE_KEY, JSON.stringify(current));
}

export function getAuthToken(): string | null {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setAuthToken(token: string): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.dispatchEvent(new Event("holmes-auth-updated"));
}

export function clearAuthToken(): void {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.dispatchEvent(new Event("holmes-auth-updated"));
}

export function isAuthenticated(): boolean {
  return Boolean(getAuthToken());
}

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
        const message = (first as Record<string, unknown>).msg;
        if (typeof message === "string") {
          return message;
        }
      }
      return String(first);
    }
  }

  return fallback;
}

function normalizePercent(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const scaled = value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, scaled));
}

function verdictToStatus(verdict: string): VerificationStatus {
  const normalized = verdict.trim().toLowerCase();
  if (normalized === "likely_authentic") {
    return "VERIFIED";
  }
  if (normalized === "likely_manipulated" || normalized === "malicious") {
    return "SUSPICIOUS";
  }
  return "INCONCLUSIVE";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function extractReasoning(details: Record<string, unknown>): string | null {
  const debate = asRecord(details.debate);
  const verdict = debate ? asRecord(debate.verdict) : null;
  const rationale = verdict ? asString(verdict.rationale) : null;
  if (rationale) {
    return rationale;
  }

  const tools = asRecord(details.tools);
  if (!tools) {
    return null;
  }

  const summaries = Object.values(tools)
    .map((tool) => asRecord(tool))
    .filter((tool): tool is Record<string, unknown> => tool !== null)
    .map((tool) => asString(tool.summary))
    .filter((summary): summary is string => summary !== null)
    .slice(0, 3);

  return summaries.length > 0 ? summaries.join(" ") : null;
}

function extractUrlStats(details: Record<string, unknown>): UrlStats | null {
  const tools = asRecord(details.tools);
  const virustotal = tools ? asRecord(tools.virustotal) : null;
  const stats = virustotal ? asRecord(virustotal.analysis_stats) : null;
  if (!stats) {
    return null;
  }

  return {
    malicious: asNumber(stats.malicious) ?? 0,
    suspicious: asNumber(stats.suspicious) ?? 0,
    harmless: asNumber(stats.harmless) ?? 0,
    undetected: asNumber(stats.undetected) ?? 0,
    timeout: asNumber(stats.timeout) ?? 0,
  };
}

function extractUrlHighlights(details: Record<string, unknown>): string | null {
  const tools = asRecord(details.tools);
  const zenserp = tools ? asRecord(tools.zenserp) : null;
  const summary = zenserp ? asString(zenserp.summary) : null;
  if (summary) {
    return summary;
  }

  const virustotal = tools ? asRecord(tools.virustotal) : null;
  return virustotal ? asString(virustotal.summary) : null;
}

function mapVerification(record: HolmesVerificationResponse): VerificationJobStatusResponse {
  const confidence = normalizePercent(record.confidence);
  const details = asRecord(record.details) ?? {};
  const contentType = record.content_type;

  return {
    job_id: record.id,
    current_status: "COMPLETED",
    status: verdictToStatus(record.verdict),
    confidence_score: confidence,
    reasoning: extractReasoning(details),
    source_kind:
      contentType === "url" ? "url" : contentType === "text" ? "text" : "media",
    submitted_url: contentType === "url" ? record.input_reference : null,
    analysis_id: null,
    url_stats: contentType === "url" ? extractUrlStats(details) : null,
    url_highlights: contentType === "url" ? extractUrlHighlights(details) : null,
  };
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

export async function registerUser(
  email: string,
  password: string,
): Promise<RegisterResponse> {
  return requestBackend<RegisterResponse>(
    "/auth/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    "Unable to register user.",
  );
}

export async function loginUser(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const response = await requestBackend<LoginResponse>(
    "/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    "Unable to login.",
  );

  setAuthToken(response.access_token);
  return response;
}

export function logoutUser(): void {
  clearAuthToken();
}

export async function canAccessAdminDashboard(): Promise<boolean> {
  try {
    await getAdminDashboard();
    return true;
  } catch {
    return false;
  }
}

export async function getAdminDashboard(): Promise<AdminDashboardResponse> {
  return requestBackend<AdminDashboardResponse>(
    "/admin/dashboard",
    { method: "GET" },
    "Unable to load admin dashboard.",
    true,
  );
}

export async function listAdminUsers(): Promise<AdminUser[]> {
  const response = await requestBackend<AdminUsersListResponse>(
    "/admin/users",
    { method: "GET" },
    "Unable to load users.",
    true,
  );
  return response.users;
}

export async function createAdminUser(payload: AdminCreateUserPayload): Promise<AdminUser> {
  return requestBackend<AdminUser>(
    "/admin/users",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Unable to create user.",
    true,
  );
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUpdateUserPayload,
): Promise<AdminUser> {
  return requestBackend<AdminUser>(
    `/admin/users/${userId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Unable to update user.",
    true,
  );
}

export async function deleteAdminUser(userId: string): Promise<{ status: string; id: string }> {
  return requestBackend<{ status: string; id: string }>(
    `/admin/users/${userId}`,
    {
      method: "DELETE",
    },
    "Unable to delete user.",
    true,
  );
}

export async function getVerificationHistory(): Promise<VerificationJobStatusResponse[]> {
  const response = await requestBackend<HolmesVerificationResponse[]>(
    "/history",
    { method: "GET" },
    "Unable to load verification history.",
    true,
  );

  return response.map(mapVerification);
}

export async function getUserProfile(): Promise<UserProfile> {
  return requestBackend<UserProfile>(
    "/auth/me",
    { method: "GET" },
    "Unable to load user profile.",
    true,
  );
}

export async function createStripeCheckout(): Promise<{ checkout_url: string }> {
  return requestBackend<{ checkout_url: string }>(
    "/stripe/create-checkout-session",
    { method: "POST" },
    "Unable to create checkout session.",
    true,
  );
}

export async function unsubscribePremium(): Promise<{ status: string; is_premium: boolean; message?: string }> {
  return requestBackend<{ status: string; is_premium: boolean; message?: string }>(
    "/stripe/unsubscribe",
    { method: "POST" },
    "Unable to unsubscribe right now.",
    true,
  );
}

export async function createVerificationJob(
  payload: CreateVerificationPayload,
): Promise<VerificationJobQueuedResponse> {
  const text = payload.input.trim();
  const url = payload.url.trim();

  let response: HolmesVerificationResponse;

  if (payload.file) {
    const contentType: HolmesContentType | null = payload.file.type.startsWith("video/")
      ? "video"
      : payload.file.type.startsWith("image/")
        ? "image"
        : payload.file.type.startsWith("audio/")
          ? "audio"
          : null;

    if (!contentType) {
      throw new Error("Only image, video, and audio files are supported.");
    }

    const formData = new FormData();
    formData.append("content_type", contentType);
    formData.append("file", payload.file);

    response = await requestBackend<HolmesVerificationResponse>(
      "/upload/verify-file",
      { method: "POST", body: formData },
      "Unable to submit media verification request.",
      true,
    );
  } else if (url) {
    response = await requestBackend<HolmesVerificationResponse>(
      "/upload/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: "url", content: url }),
      },
      "Unable to submit URL verification request.",
      true,
    );
  } else {
    if (!text) {
      throw new Error("Please provide a claim, URL, or file.");
    }

    response = await requestBackend<HolmesVerificationResponse>(
      "/upload/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_type: "text", content: text }),
      },
      "Unable to submit text verification request.",
      true,
    );
  }

  const mapped = mapVerification(response);
  writeVerificationCache(mapped);

  return {
    job_id: response.id,
    current_status: "COMPLETED",
  };
}

export type VerifySubmitPayload =
  | { contentType: "text" | "url" | "audio"; content: string }
  | { contentType: "image" | "video"; content: string }
  | { contentType: "image" | "video"; file: File };

export async function submitVerification(
  payload: VerifySubmitPayload,
): Promise<VerificationJobStatusResponse> {
  let response: HolmesVerificationResponse;

  if ("file" in payload) {
    const formData = new FormData();
    formData.append("content_type", payload.contentType);
    formData.append("file", payload.file);

    response = await requestBackend<HolmesVerificationResponse>(
      "/upload/verify-file",
      { method: "POST", body: formData },
      "Unable to submit file verification request.",
      true,
    );
  } else {
    response = await requestBackend<HolmesVerificationResponse>(
      "/upload/verify",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content_type: payload.contentType,
          content: payload.content,
        }),
      },
      "Unable to submit verification request.",
      true,
    );
  }

  const mapped = mapVerification(response);
  writeVerificationCache(mapped);
  return mapped;
}

export async function getVerificationJob(
  jobId: string,
): Promise<VerificationJobStatusResponse> {
  if (jobId === "demo") {
    return {
      job_id: "demo",
      current_status: "COMPLETED",
      status: "INCONCLUSIVE",
      confidence_score: 54,
      reasoning:
        "Demo mode: login and run a real verification to view Holmes backend results.",
      source_kind: "text",
      submitted_url: null,
      analysis_id: null,
      url_stats: null,
      url_highlights: null,
    };
  }

  const cached = readVerificationCache();
  const cachedEntry = cached[jobId];
  if (cachedEntry) {
    return cachedEntry;
  }

  const entries = await getVerificationHistory();
  const found = entries.find((entry) => entry.job_id === jobId);

  if (!found) {
    throw new Error("Investigation result not found in your history.");
  }

  return found;
}
