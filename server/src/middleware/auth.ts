import type { NextFunction, Response } from "express";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import type { Role, User } from "@prisma/client";
import { env } from "../env.js";
import { HttpError } from "../utils/http.js";
import type { AuthRequest } from "../types/auth.js";

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
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    throw new HttpError(401, "Missing bearer token");
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as TokenPayload;
    req.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role
    };
    next();
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
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
