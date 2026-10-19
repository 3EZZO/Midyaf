import type { Request } from "express";
import type { Role } from "@prisma/client";

export type AuthenticatedUser = {
  onboardingPending?: boolean;
  id: string;
  email: string;
  role: Role;
};

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}
