/**
 * Normalize AI SDK / OpenAI usage payloads into flat token counts.
 *
 * This codebase may see any of:
 * - AI SDK LanguageModelUsage: { inputTokens, outputTokens, totalTokens }
 * - AI SDK v4 nested: { inputTokens: { total }, outputTokens: { total }, raw }
 * - OpenAI Chat Completions raw: { prompt_tokens, completion_tokens, total_tokens }
 * - OpenAI Responses API raw: { input_tokens, output_tokens }
 */
import {
  emptyTokenUsage,
  type TokenUsage,
} from "@/lib/ai/pricing"

function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.round(value)
  }
  if (value && typeof value === "object" && "total" in value) {
    return toCount((value as { total?: unknown }).total)
  }
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return Math.round(n)
  }
  return 0
}

function fromUsageObject(source: unknown): TokenUsage {
  if (!source || typeof source !== "object") return emptyTokenUsage()
  const u = source as Record<string, unknown>

  // Nested v4 provider usage: inputTokens.total / outputTokens.total
  if (u.inputTokens && typeof u.inputTokens === "object") {
    const inputTokens = toCount(u.inputTokens)
    const outputTokens = toCount(u.outputTokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: toCount(u.totalTokens) || inputTokens + outputTokens,
    }
  }

  // Flat AI SDK LanguageModelUsage: inputTokens / outputTokens
  if (
    typeof u.inputTokens === "number" ||
    typeof u.outputTokens === "number" ||
    typeof u.totalTokens === "number"
  ) {
    const inputTokens = toCount(u.inputTokens)
    const outputTokens = toCount(u.outputTokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: toCount(u.totalTokens) || inputTokens + outputTokens,
    }
  }

  // OpenAI Chat Completions: prompt_tokens / completion_tokens
  if (u.prompt_tokens != null || u.completion_tokens != null) {
    const inputTokens = toCount(u.prompt_tokens)
    const outputTokens = toCount(u.completion_tokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: toCount(u.total_tokens) || inputTokens + outputTokens,
    }
  }

  // OpenAI Responses API: input_tokens / output_tokens
  if (u.input_tokens != null || u.output_tokens != null) {
    const inputTokens = toCount(u.input_tokens)
    const outputTokens = toCount(u.output_tokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: toCount(u.total_tokens) || inputTokens + outputTokens,
    }
  }

  // Legacy camelCase aliases
  if (u.promptTokens != null || u.completionTokens != null) {
    const inputTokens = toCount(u.promptTokens)
    const outputTokens = toCount(u.completionTokens)
    return {
      inputTokens,
      outputTokens,
      totalTokens: toCount(u.totalTokens) || inputTokens + outputTokens,
    }
  }

  if (u.raw) return fromUsageObject(u.raw)
  return emptyTokenUsage()
}

/**
 * Extract token usage from a generateObject / generateText result.
 * Prefers AI SDK `usage`, then nested `usage.raw`, then response body usage.
 */
export function usageFromResult(result: unknown): TokenUsage {
  if (!result || typeof result !== "object") return emptyTokenUsage()
  const r = result as Record<string, unknown>

  const candidates: unknown[] = [
    r.usage,
    r.totalUsage,
    (r.usage as { raw?: unknown } | undefined)?.raw,
    (r.response as { body?: { usage?: unknown } } | undefined)?.body?.usage,
    (r.response as { usage?: unknown } | undefined)?.usage,
  ]

  for (const candidate of candidates) {
    const parsed = fromUsageObject(candidate)
    if (parsed.inputTokens > 0 || parsed.outputTokens > 0 || parsed.totalTokens > 0) {
      return parsed
    }
  }

  return emptyTokenUsage()
}
