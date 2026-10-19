import { Router } from "express";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db.js";
import { HttpError, asyncHandler } from "../utils/http.js";
import { requireAuth, signTokens, verifyRefreshToken } from "../middleware/auth.js";
import type { AuthRequest } from "../types/auth.js";

const router = Router();

const phoneSchema = z.string().regex(/^\+9665\d{8}$/, {
  message: "Phone must use Saudi +9665XXXXXXXX format"
});

const userSelect = {
  onboardingPending: true,
  onboardingKind: true,
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  language: true,
  avatar: true,
  createdAt: true
} as const;

const enrollmentAttempts = new Map<string, { count:number; until:number }>();
router.post("/onboarding-register", asyncHandler(async (req,res) => {
  const now=Date.now(),ip=req.ip??"unknown";
  for(const [key,entry] of enrollmentAttempts) if(entry.until<now) enrollmentAttempts.delete(key);
  const entry=enrollmentAttempts.get(ip)??{count:0,until:now+3600000};
  if(entry.count>=10||enrollmentAttempts.size>10000)throw new HttpError(429,"Too many registration attempts; try later");
  entry.count++;enrollmentAttempts.set(ip,entry);
  const body=z.object({kind:z.enum(["VENDOR","CLIENT"]),name:z.string().trim().min(2).max(120),email:z.string().trim().email().max(254).toLowerCase(),phone:phoneSchema,password:z.string().min(12).max(72).refine(value=>Buffer.byteLength(value,"utf8")<=72,"Password must be at most 72 UTF-8 bytes"),language:z.enum(["ar","en"]).default("ar")}).strict().parse(req.body);
  if(await prisma.user.findUnique({where:{email:body.email},select:{id:true}}))throw new HttpError(409,"Unable to create applicant; sign in if you already registered");
  const passwordHash=await bcrypt.hash(body.password,12);
  const user=await prisma.$transaction(async tx=>{
    const created=await tx.user.create({data:{name:body.name,email:body.email,phone:body.phone,passwordHash,role:Role.GUEST,language:body.language,onboardingPending:true,onboardingKind:body.kind},select:userSelect});
    await tx.auditLog.create({data:{actorUserId:created.id,actorRole:Role.GUEST,action:"onboarding.account_requested",entityType:"USER",entityId:created.id,metadata:{kind:body.kind}}});
    return created;
  });
  res.status(201).json({user,...signTokens(user)});
}));

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(2),
        email: z.string().email().toLowerCase(),
        phone: phoneSchema,
        password: z.string().min(8),
        role: z.nativeEnum(Role).default(Role.GUEST),
        language: z.enum(["ar", "en"]).default("ar"),
        avatar: z.string().optional()
      })
      .parse(req.body);

    if (body.role !== Role.GUEST) {
      throw new HttpError(403, "Public registration is limited to guests");
    }

    const passwordHash = await bcrypt.hash(body.password, 12);
    const { password: _password, ...registration } = body;
    const user = await prisma.user.create({
      data: { ...registration, passwordHash },
      select: userSelect
    });

    res.status(201).json({
      user,
      ...signTokens(user)
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        email: z.string().email().toLowerCase(),
        password: z.string().min(1)
      })
      .parse(req.body);

    // T-02: only a stored user whose bcrypt hash matches may sign in.
    // There is no shared password, demo identity or database-failure fallback.
    const user = await prisma.user.findUnique({
      where: { email: body.email }
    });

    if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
      throw new HttpError(401, "Invalid email or password");
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;

    res.json({
      user: safeUser,
      ...signTokens(user)
    });
  })
);

router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const body = z.object({ refreshToken: z.string() }).parse(req.body);
    const payload = verifyRefreshToken(body.refreshToken);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: userSelect
    });

    if (!user) {
      throw new HttpError(401, "Refresh token user no longer exists");
    }

    res.json({
      user,
      ...signTokens(user)
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: userSelect
    });

    if (!user) {
      throw new HttpError(404, "User not found");
    }

    res.json({ user });
  })
);

export default router;
