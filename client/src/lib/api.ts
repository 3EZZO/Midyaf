import type {
  FileAsset,
  FileUploadInput,
  MidyafData,
  Session,
  User
} from "@shared/domain";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

type LoginResponse = {
  user: User;
  accessToken: string;
  refreshToken: string;
};

export async function login(email: string, password: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? "Login failed");
  }

  const data = (await response.json()) as LoginResponse;

  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken
  };
}

export type GuestRegistration = {
  name: string;
  email: string;
  phone: string;
  password: string;
  language: "ar" | "en";
};

/** Public guest self-registration; returns a session like `login`. */
export async function registerGuest(
  input: GuestRegistration
): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, role: "GUEST" })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? "Registration failed");
  }

  const data = (await response.json()) as LoginResponse;
  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken
  };
}

export async function getBootstrap(accessToken: string): Promise<MidyafData> {
  return apiFetch<MidyafData>("/bootstrap", accessToken);
}

export async function apiFetch<T>(
  path: string,
  accessToken: string,
  options: RequestInit = {}
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers ?? {})
    }
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(
      error?.error?.message ?? "API request failed",
      response.status
    );
  }

  return (await response.json()) as T;
}

/** An HTTP failure with its status, so callers can tell "expired" from "down". */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Fetch a company report PDF with the bearer header and save it. A plain
 * `window.open("/api/…")` would send no token (401) and, once the service
 * worker controls the page, could be answered with the app shell instead.
 */
export async function downloadReportPdf(
  reportId: string,
  accessToken: string,
  language: "ar" | "en"
) {
  const response = await fetch(
    `${API_BASE}/company-reports/${encodeURIComponent(reportId)}/pdf?lang=${language}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    throw new ApiError("Report download failed", response.status);
  }

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `midyaf-report-${reportId}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in Safari.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Trade the refresh token for a fresh session; throws when it too has expired. */
export async function refreshSession(refreshToken: string): Promise<Session> {
  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  if (!response.ok) {
    throw new ApiError("Session expired", response.status);
  }
  const data = (await response.json()) as LoginResponse;
  return {
    user: data.user,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken
  };
}

export async function apiUploadFile(
  file: File,
  input: FileUploadInput,
  accessToken: string
) {
  const formData = new FormData();

  formData.append("type", input.type);

  if (input.userId) {
    formData.append("userId", input.userId);
  }

  if (input.guestId) {
    formData.append("guestId", input.guestId);
  }

  if (input.driverId) {
    formData.append("driverId", input.driverId);
  }

  if (input.eventId) {
    formData.append("eventId", input.eventId);
  }

  formData.append("file", file);

  const response = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error?.message ?? "File upload failed");
  }

  return (await response.json()) as { fileAsset: FileAsset };
}
