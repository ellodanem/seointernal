import { z } from "zod";

function splitEmails(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().optional().default(""),
  GOOGLE_CLIENT_SECRET: z.string().optional().default(""),
  OWNER_EMAILS: z.string().default(""),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional().default(""),
  WORKER_IDLE_MS: z.coerce.number().int().positive().default(60_000),
  PORT: z.coerce.number().int().positive().default(3000),
});

export type Env = z.infer<typeof envSchema> & {
  ownerEmails: string[];
  googleOAuthConfigured: boolean;
  gscCredentialsConfigured: boolean;
};

let cached: Env | null = null;

export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const data = parsed.data;
  const ownerEmails = splitEmails(data.OWNER_EMAILS);
  if (ownerEmails.length === 0 && data.NODE_ENV === "production") {
    throw new Error("OWNER_EMAILS must be set in production");
  }

  cached = {
    ...data,
    ownerEmails,
    googleOAuthConfigured: Boolean(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET),
    gscCredentialsConfigured: Boolean(data.GOOGLE_APPLICATION_CREDENTIALS),
  };
  return cached;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const env = loadEnv();
  return env.ownerEmails.includes(email.trim().toLowerCase());
}
