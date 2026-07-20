/**
 * The zod source of truth for the model-judge extension config.
 *
 * The config carries the *model mechanism* half of ADR 0007's config split
 * (provider / model / instructions / patterns / timeout); the *chain policy*
 * half (`authorizerChain`, the delegation envelope) lives in
 * `@gotgenes/pi-permission-system`. This package reads only what it uses.
 */

import { z } from "zod";

/** Extension id — the `extensions/<id>/config.json` path segment. */
export const MODEL_JUDGE_EXTENSION_ID = "pi-permission-model-judge";

/** Default per-review model-call budget, in milliseconds. */
export const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Operator-owned config for the deny-first typo-path reviewer.
 *
 * An empty or absent `typoPatterns` makes the reviewer defer everything —
 * installing the package and naming it in `authorizerChain` without configuring
 * patterns is a safe no-op (nothing is auto-denied).
 */
export const modelJudgeConfigSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
  instructions: z.string().min(1),
  typoPatterns: z.array(z.string().min(1)).default([]),
  timeoutMs: z.number().int().positive().default(DEFAULT_TIMEOUT_MS),
});

export type ModelJudgeConfig = z.infer<typeof modelJudgeConfigSchema>;
