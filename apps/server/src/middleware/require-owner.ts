import type { Context, Next } from "hono";
import type { Auth } from "../lib/auth.js";
import { isOwnerEmail } from "../config.js";

export type AppVariables = {
  auth: Auth;
  user: {
    id: string;
    email: string;
    name: string;
  };
};

export async function requireOwner(c: Context<{ Variables: AppVariables }>, next: Next) {
  const auth = c.get("auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!isOwnerEmail(session.user.email)) {
    return c.json({ error: "Forbidden: owner allowlist only" }, 403);
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });

  await next();
}
