/**
 * Minimal name-keyed pub-sub backing `MapEngine`'s `on`/`off`/`emit`. Holds a
 * map of event name to a `Set` of handlers; `emit` fans a payload out to every
 * registered handler for a name, in registration order. Kept free of any
 * MapEngine/DOM coupling so it stays a pure dispatch primitive.
 */
export class EventEmitter {
  private readonly _handlers = new Map<string, Set<Function>>()

  /** Registers `handler` for `event`, creating the handler set on first use. A handler already registered for `event` is not added twice (`Set` semantics). */
  on(event: string, handler: Function): void {
    let handlers = this._handlers.get(event)
    if (!handlers) {
      handlers = new Set()
      this._handlers.set(event, handlers)
    }
    handlers.add(handler)
  }

  /** Removes `handler` from `event`'s handler set; a no-op if it was never registered. */
  off(event: string, handler: Function): void {
    this._handlers.get(event)?.delete(handler)
  }

  /** Invokes every handler registered for `event` with `payload`, in registration order; a no-op when `event` has no handlers. */
  emit(event: string, payload: unknown): void {
    const handlers = this._handlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        handler(payload)
      }
    }
  }

  /** Drops all registered handlers for every event (teardown). */
  clear(): void {
    this._handlers.clear()
  }
}
