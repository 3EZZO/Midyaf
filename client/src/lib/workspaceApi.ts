import { useEffect, useRef, useState } from "react";
import { apiFetch } from "./api";
import { readJwtSubject } from "./demoGuideHint";

const RESOURCE_CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 60;

type CacheEntry = { data: unknown; expiresAt: number };
const resourceCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

export function clearWorkspaceResourceCache(): void {
  resourceCache.clear();
  inflightRequests.clear();
}

/**
 * Shared cached/deduped GET helper used by `useWorkspaceResource` so multiple
 * mounted portals requesting the same `/workspace/events` (or other read path)
 * for the same user subject and revision coalesce into a single network request.
 * Scoped by JWT subject (`readJwtSubject`) rather than raw token string so
 * routine same-user token rotations never blank or refetch mounted panels.
 */
export function fetchWorkspaceResource<T>(
  token: string,
  path: string,
  revision = 0,
  prefix = "/workspace"
): Promise<T> {
  const subject = readJwtSubject(token);
  const key = `${subject}:${prefix}:${path}:${revision}`;
  const now = Date.now();
  const cached = resourceCache.get(key);
  if (cached && cached.expiresAt > now) {
    return Promise.resolve(cached.data as T);
  }
  if (cached) {
    resourceCache.delete(key);
  }

  const pending = inflightRequests.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = apiFetch<T>(`${prefix}${path}`, token)
    .then((data) => {
      if (resourceCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = resourceCache.keys().next().value;
        if (oldestKey !== undefined) resourceCache.delete(oldestKey);
      }
      resourceCache.set(key, { data, expiresAt: Date.now() + RESOURCE_CACHE_TTL_MS });
      return data;
    })
    .finally(() => {
      inflightRequests.delete(key);
    });

  inflightRequests.set(key, promise);
  return promise;
}

export function workspaceRequest<T>(token: string, path: string, body?: unknown, method = "POST", signal?: AbortSignal) {
  const isMutation = body !== undefined || method.toUpperCase() !== "GET";
  if (isMutation) {
    clearWorkspaceResourceCache();
  }
  return apiFetch<T>(`/workspace${path}`, token, {
    method: body === undefined ? "GET" : method,
    signal,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }).then((result) => {
    if (isMutation) clearWorkspaceResourceCache();
    return result;
  });
}

/** Abort and invalidate old event/session requests before displaying another scope. */
export function useWorkspaceResource<T>(token: string, path: string | null, revision = 0, prefix = "/workspace", keepPrevious = false) {
  const subject = readJwtSubject(token);
  const scope = `${subject}:${prefix}:${path}`;
  const key = `${subject}:${prefix}:${path}:${revision}`;
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [state, setState] = useState<{ key: string; scope?: string; data?: T; error?: string; refreshing?: boolean }>(() => {
    if (path && subject) {
      const hit = resourceCache.get(key);
      if (hit && hit.expiresAt > Date.now()) {
        return { key, scope, data: hit.data as T };
      }
    }
    return { key: "" };
  });

  useEffect(() => {
    let active = true;
    const currentToken = tokenRef.current;
    if (path && subject && currentToken) {
      fetchWorkspaceResource<T>(currentToken, path, revision, prefix)
        .then((data) => {
          if (active) setState({ key, scope, data });
        })
        .catch((error) => {
          if (active) {
            setState({
              key,
              scope,
              error: error instanceof Error ? error.message : "Request failed"
            });
          }
        });
    }
    return () => {
      active = false;
    };
  }, [key, subject, path, revision, prefix, scope]);

  return state.key === key ? state : keepPrevious && state.scope === scope && state.data ? { ...state, key, refreshing: true } : { key };
}

export async function workspaceDownload(token: string, path: string, fileName: string) {
  const base = import.meta.env.VITE_API_BASE_URL ?? "/api";
  const response = await fetch(`${base}/workspace${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error?.message ?? "Download failed");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href = url; link.download = fileName; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export type GuestImportResult = { applied: boolean; count: number; errors: Array<{row:number;message:string}>; preview: Array<{guestCode:string;fullName:string;arrivalAt:string|null;departureAt:string|null}> };
export async function workspaceImport(token:string,eventId:string,input:{contentBase64:string;apply:boolean;defaultVip:boolean;timezone:string}):Promise<GuestImportResult> {
  clearWorkspaceResourceCache();
  const base=import.meta.env.VITE_API_BASE_URL??'/api';
  const response=await fetch(`${base}/workspace/events/${eventId}/guest-workbook/import`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
  const data=await response.json();if(!response.ok&&response.status!==422)throw new Error(data?.error?.message??'Import failed');
  clearWorkspaceResourceCache();
  return data;
}
