import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** clsx + tailwind-merge: later classes win, conflicts resolved. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
