import type {
  DemoBaselineResponse,
  DemoPersonaDto,
  DemoPersonaKey,
  DemoResetResponse,
  DemoStatusDto,
  DemoSwitchResponse
} from "@shared/demo";
import { ApiError, apiFetch } from "./api";

export const INVESTOR_DEMO_ADMIN_EMAIL = "admin@midyaf.local";

/**
 * Queries GET /api/demo/status for the current session.
 * Returns null when the server responds 404 (demo disabled), hiding all demo UI.
 */
export async function fetchDemoStatus(
  accessToken: string,
  signal?: AbortSignal
): Promise<DemoStatusDto | null> {
  try {
    return await apiFetch<DemoStatusDto>("/demo/status", accessToken, { signal });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/** Switches to a certified demo persona in one click without logging out. */
export function switchDemoPersona(
  accessToken: string,
  persona: DemoPersonaKey
): Promise<DemoSwitchResponse> {
  return apiFetch<DemoSwitchResponse>("/demo/switch", accessToken, {
    method: "POST",
    body: JSON.stringify({ persona })
  });
}

/** Saves the current database state as the start point future resets restore to. */
export function captureDemoBaseline(accessToken: string): Promise<DemoBaselineResponse> {
  return apiFetch<DemoBaselineResponse>("/demo/baseline", accessToken, {
    method: "POST",
    body: JSON.stringify({ confirm: true })
  });
}

/** Resets demo data back to the saved baseline start point. */
export function resetDemoData(accessToken: string): Promise<DemoResetResponse> {
  return apiFetch<DemoResetResponse>("/demo/reset", accessToken, {
    method: "POST",
    body: JSON.stringify({ confirm: true })
  });
}

/** Resolves the active persona entry from DemoStatusDto, if any. */
export function activePersonaForStatus(status: DemoStatusDto | null | undefined): DemoPersonaDto | null {
  if (!status?.activePersona) return null;
  return status.personas.find((p) => p.key === status.activePersona) ?? null;
}

/** Formats an ISO timestamp for demo status metadata in AR or EN. */
export function formatDemoTimestamp(iso: string | null | undefined, isArabic: boolean): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleString(isArabic ? "ar-SA-u-nu-latn" : "en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}
