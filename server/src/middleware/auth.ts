import type { NextFunction, Response } from "express";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
import { env } from "../env.js";
import { HttpError } from "../utils/http.js";
import type { AuthenticatedUser, AuthRequest } from "../types/auth.js";

type TokenPayload = JwtPayload & {
  sub: string;
  email: string;
  role: Role;
};

const accessOptions: SignOptions = {
  expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"]
};

const refreshOptions: SignOptions = {
  expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"]
};

export function signTokens(user: Pick<User, "id" | "email" | "role">) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role
  };

  return {
    accessToken: jwt.sign(payload, env.JWT_ACCESS_SECRET, accessOptions),
    refreshToken: jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshOptions)
  };
}

export function verifyRefreshToken(token: string) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as TokenPayload;
}

export function requireAuth(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ")
    ? header.slice(7)
    : typeof req.query?.token === "string"
      ? req.query.token
      : undefined;

  if (!token) {
    throw new HttpError(401, "Missing bearer token");
  }

  try {
    req.user = verifyAccessToken(token);
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  next();
}

/**
 * Verifies an access token (not a refresh token) and returns the actor it
 * names. Shared by REST and the Socket.IO handshake; throws when the token is
 * missing claims, expired or signed with another secret.
 */
export function verifyAccessToken(token: string): AuthenticatedUser {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;

  if (
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new Error("Access token is missing required claims");
  }

  return { id: payload.sub, email: payload.email, role: payload.role };
}

export function requireRole(roles: Role[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new HttpError(401, "Authentication required");
    }

    if (!roles.includes(req.user.role)) {
      throw new HttpError(403, "Insufficient permissions");
    }

    next();
  };
}
