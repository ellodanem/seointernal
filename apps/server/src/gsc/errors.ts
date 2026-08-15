import { existsSync } from "node:fs";
import { GscError } from "./types.js";

/**
 * Map Google API / filesystem failures into stable operational codes.
 */
export function mapGscError(err: unknown): GscError {
  if (err instanceof GscError) return err;

  const anyErr = err as {
    code?: number | string;
    message?: string;
    response?: { status?: number; data?: unknown };
    errors?: Array<{ reason?: string; message?: string }>;
    cause?: unknown;
  };

  const httpStatus =
    typeof anyErr?.code === "number"
      ? anyErr.code
      : typeof anyErr?.response?.status === "number"
        ? anyErr.response.status
        : null;

  const message = sanitizeMessage(anyErr?.message ?? String(err));
  const reason = anyErr?.errors?.[0]?.reason ?? "";

  if (httpStatus === 403 || /insufficient permission|forbidden|PERMISSION_DENIED/i.test(message)) {
    return new GscError(
      "Search Console access was lost or denied for this property. Re-add the service-account user.",
      { code: "GSC_FORBIDDEN", httpStatus: 403, retryable: false, cause: err },
    );
  }

  if (httpStatus === 400 || /invalidParameter|not a valid/i.test(message + reason)) {
    return new GscError("Invalid Search Console property identifier.", {
      code: "GSC_BAD_PROPERTY",
      httpStatus: 400,
      retryable: false,
      cause: err,
    });
  }

  if (httpStatus === 429 || /rateLimitExceeded|userRateLimitExceeded|quota/i.test(message + reason)) {
    return new GscError("Search Console API quota exceeded. Backing off.", {
      code: "GSC_QUOTA",
      httpStatus: 429,
      retryable: true,
      cause: err,
    });
  }

  if (
    (httpStatus !== null && httpStatus >= 500) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND|socket|network/i.test(message)
  ) {
    return new GscError("Temporary Search Console / network error.", {
      code: "GSC_TRANSIENT",
      httpStatus,
      retryable: true,
      cause: err,
    });
  }

  return new GscError(message || "Unknown Search Console error", {
    code: "GSC_UNKNOWN",
    httpStatus,
    retryable: false,
    cause: err,
  });
}

export function missingCredentialsError(path: string): GscError {
  return new GscError(
    path
      ? `Service account key not found at configured path (contents never logged).`
      : "GOOGLE_APPLICATION_CREDENTIALS is not set.",
    { code: "MISSING_CREDENTIALS", httpStatus: null, retryable: false },
  );
}

export function assertCredentialsFile(path: string): void {
  if (!path) throw missingCredentialsError("");
  if (!existsSync(path)) throw missingCredentialsError(path);
}

function sanitizeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .replace(/BEGIN PRIVATE KEY[\s\S]*?END PRIVATE KEY/gi, "[redacted private key]");
}
