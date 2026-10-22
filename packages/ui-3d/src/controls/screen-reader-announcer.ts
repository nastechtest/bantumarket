import type { ClaimScope, ConditionCaption } from '@nastech/api-contracts'
import type { CameraPose } from './keyboard-rotate.js';

/**
 * Screen-reader announcer (07 §4.1 `controls/`).
 *
 * This is not a courtesy layer over the render; for a screen-reader user it *is* the inspection. So
 * the text it emits is the manifest's own disclosure text, and it is emitted only when there is
 * something the dispute process could also read. Three consequences, all enforced here:
 *
 *  1. A pose with no caption is never announced while the capture has captions. "Dial face, 11
 *     o'clock" spoken between two real disclosures is noise, and a buyer cannot tell noise from
 *     evidence.
 *  2. Nothing in this file may imply a check happened. The severity words are the manifest's three
 *     severities, translated to plain English, and `claim_scope` gates the whole channel. No "checked",
 *     no "verified", no glow.
 *  3. Repetition is suppressed the way screen readers actually behave: writing the same string twice
 *     into an `aria-live` region is not a second announcement, so a repeated pose has to be nudged.
 */

/** Plain-English severities. `unknown` is stated as unassessed rather than softened. */
export const SEVERITY_WORDS: Readonly<Record<ConditionCaption['severity'], string>> = {
  cosmetic: 'cosmetic',
  functional: 'affects how it works',
  unknown: 'not assessed',
};

/** How many disclosures are spoken at one pose before the rest are deferred to the condition panel. */
export const SPOKEN_CAPTION_LIMIT = 2;

export interface AnnouncementContext {
  /** False when the manifest carries no hotspots at all; then orientation alone is honest. */
  readonly captioned: boolean;
  readonly claimScope: ClaimScope;
}

export function captionText(caption: ConditionCaption): string {
  return `${caption.disclosureText} — ${SEVERITY_WORDS[caption.severity]}`;
}

/**
 * The announcement for a named pose, or null when saying it would be noise.
 *
 * A decorative model (`claim_scope: none`) announces nothing at all, because every sentence about it
 * would present geometry as evidence. The app still shows `CLAIM_SCOPE_DISCLOSURE` statically; that
 * text is the app's job, not this channel's.
 */
export function announcementForPose(pose: CameraPose, ctx: AnnouncementContext): string | null {
  if (ctx.claimScope === 'none') return null;
  if (ctx.captioned && pose.captions.length === 0) return null;
  if (pose.captions.length === 0) return pose.label;
  const spoken = pose.captions.slice(0, SPOKEN_CAPTION_LIMIT).map(captionText).join('. ');
  const rest = pose.captions.length - Math.min(pose.captions.length, SPOKEN_CAPTION_LIMIT);
  const tail = rest > 0 ? `. ${rest} more ${rest === 1 ? 'note' : 'notes'} in the condition list` : '';
  return `${pose.label}. ${spoken}${tail}`;
}

/** Framing changes are said briefly: a silent `+` key reads as a broken control, not as no change. */
export function framingText(zoom: number): string {
  return `framing ${zoom.toFixed(2)} times`;
}

export interface BlockNoticeText {
  readonly axis: 'azimuth' | 'polar' | 'zoom';
  readonly direction: -1 | 1;
}

/**
 * What to say when an input was refused. Saying it at all is the point: an orbit that stops without
 * explanation reads as a UI bug, and the honest reading — the photographs end here — is a condition
 * fact about the item.
 */
export function blockedText(blocked: BlockNoticeText): string {
  if (blocked.axis === 'zoom') {
    return blocked.direction > 0 ? 'closest the capture can show' : 'widest the capture can show';
  }
  const where = blocked.axis === 'polar' ? (blocked.direction > 0 ? 'under the case' : 'above the crystal') : 'around this side';
  return `edge of the photographs: ${where} was not captured`;
}

/** Injected so the debounce is testable without a timer mock and frame-accurate in the app. */
export type Scheduler = (task: () => void, delayMs: number) => () => void;

const defaultScheduler: Scheduler = (task, delayMs) => {
  const handle = setTimeout(task, delayMs);
  return () => clearTimeout(handle);
};

export interface Announcer {
  /** `null` cancels a pending announcement rather than emitting one. */
  announce(text: string | null): void;
  /** Writes anything pending immediately — used when the viewer unmounts or a pose settles. */
  flush(): void;
  cancel(): void;
  setLiveRegion(region: HTMLElement | null): void;
}

export interface AnnouncerOptions {
  readonly liveRegion?: HTMLElement | null;
  readonly delayMs?: number;
  readonly schedule?: Scheduler;
}

/**
 * A debounced writer into one polite live region. Rapid drags would otherwise speak every snapped
 * cell; polite plus debounce means the buyer hears where the gesture ended, which is the only
 * version of this that is not unintelligible.
 */
export function createAnnouncer(options: AnnouncerOptions = {}): Announcer {
  const delayMs = options.delayMs ?? 220;
  const schedule = options.schedule ?? defaultScheduler;
  let region: HTMLElement | null = options.liveRegion ?? null;
  let pending: string | null = null;
  let cancelTimer: (() => void) | null = null;
  // Alternates the invisible marker so two identical poses in a row are still two announcements.
  let nudge = false;

  const write = (text: string) => {
    if (!region) return;
    nudge = !nudge;
    region.textContent = nudge ? `${text}` : `${text}\u200B`;
  };

  return {
    announce(text: string | null) {
      pending = text;
      if (cancelTimer) cancelTimer();
      if (text === null) {
        cancelTimer = null;
        return;
      }
      cancelTimer = schedule(() => {
        cancelTimer = null;
        if (pending !== null) write(pending);
      }, delayMs);
    },
    flush() {
      if (cancelTimer) cancelTimer();
      cancelTimer = null;
      if (pending !== null) write(pending);
    },
    cancel() {
      if (cancelTimer) cancelTimer();
      cancelTimer = null;
      pending = null;
    },
    setLiveRegion(next: HTMLElement | null) {
      region = next;
      if (next && pending !== null && cancelTimer === null) write(pending);
    },
  };
}
