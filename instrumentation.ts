/**
 * Log unhandled request errors so Vercel shows the real exception, not only
 * the Next.js HTML 500 document the browser receives.
 */
export async function onRequestError(
  error: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routerKind?: string }
) {
  console.error("[instrumentation] onRequestError", {
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routerKind: context.routerKind,
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  })
}
