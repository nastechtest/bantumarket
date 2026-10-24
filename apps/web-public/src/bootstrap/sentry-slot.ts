/**
 * Error reporting slot — deliberately empty.
 *
 * A real error tracker (Sentry or equivalent) is a third-party script and a network call; the
 * first-paint budget cannot carry either and the consent posture (POPIA) says the *user's* choice
 * gates telemetry, not our convenience. So the shell codes against this interface and nothing
 * else, and whoever owns consent attaches the sink *after* first paint and after consent:
 *
 *   attachErrorSink(await loadLazySentryClient());   // controller, post-consent, dynamic import
 *
 * Until then `reportError` logs to console (for the boot-timing panel and devtools) and is
 * honest that nothing left the device.
 */

export interface ErrorSink {
  captureError(error: unknown, context?: Readonly<Record<string, string>>): void;
}

let sink: ErrorSink | null = null;

export function attachErrorSink(next: ErrorSink | null): void {
  sink = next;
}

export function hasErrorSink(): boolean {
  return sink !== null;
}

export function reportError(error: unknown, context?: Readonly<Record<string, string>>): void {
  if (sink) {
    try {
      sink.captureError(error, context);
      return;
    } catch {
      // a broken sink must not swallow the error it was given
    }
  }
  if (typeof console !== 'undefined' && typeof console.error === 'function') {
    console.error('[nt:unreported]', error, context ?? '');
  }
}
