export type CallHandler = (params: unknown) => unknown | Promise<unknown>

const handlers = new Map<string, CallHandler>()

/** Registered by later epics (2, 3, 5–8) — one entry per CALL method name. */
export function registerCallHandler(
  method: string,
  handler: CallHandler
): void {
  handlers.set(method, handler)
}

export function getCallHandler(method: string): CallHandler | undefined {
  return handlers.get(method)
}
