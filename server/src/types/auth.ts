import type { Request } from "express";
import type { Role } from "@prisma/client";

export type AuthenticatedUser = {
  onboardingPending?: boolean;
  id: string;
  email: string;
  role: Role;
  /** SIX-TASKS #6: the Super Admin who started this switched demo session. */
  demoOriginId?: string;
};

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}
