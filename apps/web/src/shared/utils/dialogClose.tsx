/**
 * Wraps a Dialog/Modal onClose handler so backdrop clicks are ignored —
 * these should only close via an explicit close icon or the Escape key.
 */
export function ignoreBackdropClick<T extends (...args: any[]) => void>(
  handler: T,
) {
  return (event?: unknown, reason?: string) => {
    if (reason === "backdropClick") return;
    handler(event, reason);
  };
}
