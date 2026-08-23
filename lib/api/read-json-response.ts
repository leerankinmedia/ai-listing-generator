/**
 * Safely read an API response body as JSON.
 * Platform errors (e.g. Vercel "Request Entity Too Large") often return plain text/HTML.
 */
export type ApiJsonResult<T = Record<string, unknown>> =
  | {
      ok: true
      status: number
      contentType: string
      data: T
      rawText: string
    }
  | {
      ok: false
      status: number
      contentType: string
      data: T | null
      rawText: string
      error: string
    }

function contentTypeOf(response: Response): string {
  return (response.headers.get("content-type") || "").toLowerCase()
}

function looksLikeJson(contentType: string, text: string): boolean {
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    return true
  }
  const trimmed = text.trim()
  return trimmed.startsWith("{") || trimmed.startsWith("[")
}

export function formatNonJsonApiError(
  status: number,
  rawText: string
): string {
  const trimmed = rawText.replace(/\s+/g, " ").trim()
  if (!trimmed) {
    return `Request failed with HTTP ${status} and an empty non-JSON response.`
  }
  if (/^<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    const platform = trimmed.match(
      /FUNCTION_INVOCATION_(?:FAILED|TIMEOUT)|A server error has occurred|Request Entity Too Large/i
    )
    const hint = platform
      ? ` Vercel platform code: ${platform[0]}.`
      : ""
    return `Publish failed with HTTP ${status}: the server returned an HTML error page instead of JSON.${hint} Check Vercel logs for the first exception and the last [publish-stage] line at this request.`
  }
  return `Request failed with HTTP ${status}: ${trimmed.slice(0, 280)}`
}

/**
 * Read response text once, parse JSON when possible, never throw on HTML/plain text.
 */
export async function readApiJsonResponse<T = Record<string, unknown>>(
  response: Response
): Promise<ApiJsonResult<T>> {
  const contentType = contentTypeOf(response)
  const rawText = await response.text()
  const canParse = looksLikeJson(contentType, rawText)

  if (!canParse) {
    const error = formatNonJsonApiError(response.status, rawText)
    return {
      ok: false,
      status: response.status,
      contentType,
      data: null,
      rawText,
      error,
    }
  }

  try {
    const data = (rawText ? JSON.parse(rawText) : {}) as T
    if (!response.ok) {
      const record = data as Record<string, unknown>
      const message =
        (typeof record.error === "string" && record.error) ||
        (typeof record.message === "string" && record.message) ||
        formatNonJsonApiError(response.status, rawText)
      const stage =
        typeof record.stage === "string" && record.stage.trim()
          ? record.stage.trim()
          : ""
      return {
        ok: false,
        status: response.status,
        contentType,
        data,
        rawText,
        error: stage ? `${message} (stage: ${stage})` : message,
      }
    }
    return {
      ok: true,
      status: response.status,
      contentType,
      data,
      rawText,
    }
  } catch {
    return {
      ok: false,
      status: response.status,
      contentType,
      data: null,
      rawText,
      error: formatNonJsonApiError(response.status, rawText),
    }
  }
}
