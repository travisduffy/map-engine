/** Signature of a Worker CALL handler: takes the CALL's params and returns the RESULT value (sync or async). */
export type CallHandler = (params: unknown) => unknown | Promise<unknown>

// Handler registry, keyed by CALL method name.
const handlers = new Map<string, CallHandler>()

/** Registered by later epics (2, 3, 5–8) — one entry per CALL method name. */
export function registerCallHandler(
  method: string,
  handler: CallHandler
): void {
  handlers.set(method, handler)
}

/** Looks up the handler registered for `method`, or `undefined` if none is registered. */
export function getCallHandler(method: string): CallHandler | undefined {
  return handlers.get(method)
}
