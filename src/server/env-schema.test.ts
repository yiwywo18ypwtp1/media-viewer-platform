import { describe, expect, it } from "vitest";
import { parseEnv, webEnvSchema } from "./env-schema";

const validWebEnv = {
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://app:app@localhost:5432/app",
  REDIS_URL: "redis://localhost:6379",
  S3_REGION: "us-east-1",
  S3_BUCKET: "media",
  S3_ACCESS_KEY: "minio",
  S3_SECRET_KEY: "minio-secret",
  S3_ENDPOINT: "http://minio:9000",
  S3_PUBLIC_ENDPOINT: "http://localhost:9000",
};

describe("parseEnv", () => {
  it("returns typed values with defaults applied", () => {
    const env = parseEnv(webEnvSchema, validWebEnv);
    expect(env.S3_BUCKET).toBe("media");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("lists every missing variable by name", () => {
    const incomplete: Record<string, string> = { ...validWebEnv };
    delete incomplete.S3_SECRET_KEY;
    delete incomplete.REDIS_URL;
    expect(() => parseEnv(webEnvSchema, incomplete)).toThrow("S3_SECRET_KEY: missing");
    expect(() => parseEnv(webEnvSchema, incomplete)).toThrow("REDIS_URL: missing");
  });

  it("reports invalid values with the validation message", () => {
    expect(() => parseEnv(webEnvSchema, { ...validWebEnv, DATABASE_URL: "nope" })).toThrow(
      /DATABASE_URL: (?!missing)/,
    );
  });
});
