/**
 * Configuration Validation
 *
 * Validates that all required environment variables are set
 * and provides typed config access
 */

interface ExportConfig {
  redis: {
    url: string;
    token: string;
  };
  database: {
    url: string;
  };
  worker: {
    pollIntervalMs: number;
    maxRetries: number;
    retryBackoffMs: number;
  };
  storage: {
    type: "s3" | "gcs" | "azure" | "local";
    s3?: {
      bucket: string;
      region: string;
    };
    local?: {
      path: string;
    };
  };
}

function validateRequired(name: string, value?: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}\n` +
      `Check your .env.local file and ensure all required variables are set.\n` +
      `See .env.example for the template.`
    );
  }
  return value;
}

function validateOptional(value?: string, defaultValue?: string): string {
  return value ?? defaultValue ?? "";
}

export function getConfig(): ExportConfig {
  return {
    redis: {
      url: validateRequired("UPSTASH_REDIS_URL", process.env.UPSTASH_REDIS_URL),
      token: validateRequired(
        "UPSTASH_REDIS_TOKEN",
        process.env.UPSTASH_REDIS_TOKEN
      ),
    },
    database: {
      url: validateRequired("DATABASE_URL", process.env.DATABASE_URL),
    },
    worker: {
      pollIntervalMs: parseInt(
        process.env.EXPORT_WORKER_POLL_INTERVAL_MS ?? "1000"
      ),
      maxRetries: parseInt(process.env.EXPORT_WORKER_MAX_RETRIES ?? "3"),
      retryBackoffMs: parseInt(
        process.env.EXPORT_WORKER_RETRY_BACKOFF_MS ?? "5000"
      ),
    },
    storage: {
      type: (process.env.EXPORT_STORAGE_TYPE as any) ?? "local",
      s3:
        process.env.EXPORT_STORAGE_TYPE === "s3"
          ? {
              bucket: validateRequired(
                "AWS_S3_BUCKET",
                process.env.AWS_S3_BUCKET
              ),
              region: validateRequired(
                "AWS_S3_REGION",
                process.env.AWS_S3_REGION
              ),
            }
          : undefined,
      local:
        process.env.EXPORT_STORAGE_TYPE !== "s3"
          ? {
              path: validateOptional(
                process.env.EXPORT_STORAGE_PATH,
                "/tmp/exports"
              ),
            }
          : undefined,
    },
  };
}

/**
 * Validate configuration at startup
 * This ensures all required env vars are present before
 * any export operations begin
 */
export function validateConfig(): void {
  try {
    getConfig();
    console.log("[Config] Configuration validated successfully");
  } catch (error) {
    console.error("[Config] Configuration validation failed:");
    console.error(error);
    process.exit(1);
  }
}

// Export singleton config instance for convenience
export const config = (() => {
  try {
    return getConfig();
  } catch (error) {
    if (process.env.NODE_ENV !== "test") {
      console.error("[Config] Failed to load configuration:", error);
    }
    return null;
  }
})();
