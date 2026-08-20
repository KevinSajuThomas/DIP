import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET;

export function requireJwtSecret(): string {
  if (!JWT_SECRET) {
    throw new Error(
      "JWT_SECRET is not set. Configure a strong random secret before starting the server."
    );
  }
  return JWT_SECRET;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, requireJwtSecret(), { expiresIn: "7d" });
}

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = jwt.verify(header.slice(7), requireJwtSecret()) as { sub: string };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
