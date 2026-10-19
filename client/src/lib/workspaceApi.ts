import { useEffect, useState } from "react";
import { apiFetch } from "./api";

export function workspaceRequest<T>(token: string, path: string, body?: unknown, method = "POST", signal?: AbortSignal) {
  return apiFetch<T>(`/workspace${path}`, token, { method: body === undefined ? "GET" : method, signal, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

/** Abort and invalidate old event/session requests before displaying another scope. */
export function useWorkspaceResource<T>(token: string, path: string | null, revision = 0, prefix = "/workspace", keepPrevious = false) {
  const [state, setState] = useState<{ key: string; scope?: string; data?: T; error?: string; refreshing?: boolean }>({ key: "" });
  const scope = `${token}:${prefix}:${path}`;
  const key = `${token}:${prefix}:${path}:${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    if (path && token) apiFetch<T>(`${prefix}${path}`, token, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setState({ key, scope, data }); })
      .catch(error => { if (!controller.signal.aborted) setState({ key, scope, error: error instanceof Error ? error.message : "Request failed" }); });
    return () => controller.abort();
  }, [key, token, path]);
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
 const base=import.meta.env.VITE_API_BASE_URL??'/api';
 const response=await fetch(`${base}/workspace/events/${eventId}/guest-workbook/import`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
 const data=await response.json();if(!response.ok&&response.status!==422)throw new Error(data?.error?.message??'Import failed');return data;
}
