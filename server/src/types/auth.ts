import type { Request } from "express";
import type { Role } from "@prisma/client";

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: Role;
};

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}
