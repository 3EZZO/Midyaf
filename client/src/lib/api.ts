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
    throw new Error(error?.error?.message ?? "API request failed");
  }

  return (await response.json()) as T;
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
