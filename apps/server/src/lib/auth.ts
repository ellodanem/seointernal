import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
import { prisma } from "./db.js";
import { isOwnerEmail, loadEnv } from "../config.js";

export function createAuth() {
  const env = loadEnv();

  const socialProviders =
    env.googleOAuthConfigured
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined;

  return betterAuth({
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.APP_BASE_URL, env.WEB_ORIGIN].filter(
      (v, i, a) => Boolean(v) && a.indexOf(v) === i,
    ),
    socialProviders,
    // No email/password public signup. Google only for allowlisted owners.
    emailAndPassword: {
      enabled: false,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!isOwnerEmail(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "This Google account is not authorized for the SEO Operations Console.",
              });
            }
            return { data: user };
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const user = await prisma.user.findUnique({ where: { id: session.userId } });
            if (!user || !isOwnerEmail(user.email)) {
              throw new APIError("FORBIDDEN", {
                message: "This Google account is not authorized for the SEO Operations Console.",
              });
            }
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
