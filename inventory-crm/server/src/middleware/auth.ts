import { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const session = (req as any).session;
  if (!session?.userId) {
    return res.status(401).json({ error: "יש להתחבר למערכת" });
  }
  next();
}
