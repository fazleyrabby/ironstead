export type Handler<T> = (payload: T) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<Handler<never>>>();

  on<T>(event: string, handler: Handler<T>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<T>(event: string, handler: Handler<T>): void {
    this.handlers.get(event)?.delete(handler as Handler<never>);
  }

  emit<T>(event: string, payload: T): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<T>)(payload);
    }
  }
}
