import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma.js";

/**
 * DipBuy is a private, self-hosted, single-user tool (README PART 45 —
 * local-first privacy, no public signup). There is exactly one owner
 * account, auto-provisioned on first request, and no login screen or
 * password. If you ever expose this instance beyond your own machine,
 * put it behind a reverse proxy with its own auth (e.g. Basic Auth,
 * Cloudflare Access) rather than relying on this app to gate access.
 */
const OWNER_EMAIL = "owner@local";

export interface AuthedRequest extends Request {
  userId?: string;
}

let cachedOwnerId: string | null = null;

async function getOrCreateOwner(): Promise<string> {
  if (cachedOwnerId) return cachedOwnerId;

  const existing = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (existing) {
    cachedOwnerId = existing.id;
    return existing.id;
  }

  const created = await prisma.user.create({
    data: { email: OWNER_EMAIL, passwordHash: "unused-no-login" },
  });
  cachedOwnerId = created.id;
  return created.id;
}

/** Attaches the single owner's userId to every request. No token, no
 * login — kept as middleware (rather than inlined in every route) so a
 * real auth layer can be dropped back in later with a one-line change. */
export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    req.userId = await getOrCreateOwner();
    next();
  } catch (err) {
    next(err);
  }
}
