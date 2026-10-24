/**
 * First-touch attribution, and nothing else.
 *
 * "Where did this buyer come from" is a legitimate question for a one-city pilot, and it is also the
 * place where marketplace analytics normally becomes cross-site tracking. The four constraints here
 * are what keep it on the legitimate side:
 *
 *  1. **First touch only.** No last-touch chain, no journey, no per-page referrer log. A chain of
 *     sources is a behavioural profile; one host is a marketingspend input.
 *  2. **Host, never URL.** A referrer arrives as something like
 *     `https://www.google.com/search?q=rolex+116710bl+for+sale` — the query is a buyer's search text,
 *     which is the most identifying thing a referrer can carry. Only the hostname is kept, so the URL
 *     is discarded on the way in rather than "not displayed".
 *  3. **No cross-site identifiers, at all.** `gclid`, `fbclid`, `ttclid`, `msclkid`, `mc_eid`, `_ga` in
 *     a query string are handles a third party uses to join our sessions to their ad profile. They are
 *     not read, not stored, not hashed "for matching", and the blocklist is asserted by a test rather
 *     than implied by an allowlist happening not to include them — a campaign parameter *not* on the
 *     allowlist is dropped silently, which is the other half of the same rule.
 *  4. **It dies with the session.** Stored in session storage and erased on withdrawal or rotation.
 *     A first touch that outlives the session it belongs to is a persistent profile by another name.
 */
import type { ConsentStorage } from '../../lib/consent/types.js';
import { memoryStorage } from '../../lib/consent/storage.js';

export interface FirstTouch {
  readonly sourceHost: string;
  readonly landingRoutePattern: string;
  readonly capturedAt: number;
  /** Only ever a value from `CAMPAIGN_ALLOW_LIST`; never a raw query parameter. */
  readonly campaign?: string;
}

/** Params that mean "a third party wants to be told when this person arrived". Read of, never into. */
export const CROSS_SITE_PARAMS: readonly string[] = [
  'gclid', 'gbraid', 'wbraid', 'fbclid', 'ttclid', 'twclid', 'li_fat_id', 'msclkid', 'mc_eid',
  'yclid', '_ga', '_gl', 'dclid', 'igshid', 's_kwcid',
];

/** Campaigns we actually run. Anything else in `utm_source` is somebody else's identifier. */
export const CAMPAIGN_ALLOW_LIST: readonly string[] = ['newsletter', 'partner-sa', 'radio-jobs', 'flyer-qr'];

const TOUCH_STORAGE_KEY = 'ntm.attribution.v1';
const MAX_HOST_LENGTH = 253;

export interface AttributionDeps {
  /** Injectable so a test does not need a document and an SSR render does not need a guard. */
  readonly location: { readonly pathname: string; readonly search: string } | null;
  readonly referrer: string | null;
  readonly ownHost: string;
  readonly now: () => number;
  readonly storage?: ConsentStorage;
  /** Consent check at capture time. The reader checks again, because consent can arrive after a landing. */
  readonly allowed: () => boolean;
  /** Maps a resolved path to the router's pattern so `landing_route_pattern` is never an id. */
  readonly routePatternFor: (pathname: string) => string;
}

export interface FirstTouchReader {
  current(): FirstTouch | null;
  /** Idempotent within a session: a reload or a second landing must not rewrite the first touch. */
  capture(): FirstTouch | null;
  erase(): void;
}

function hostOf(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host.length === 0 || host.length > MAX_HOST_LENGTH) return null;
    // A referrer with userinfo (`https://me@host/`) is either malformed or someone smuggling data.
    if (url.username.length > 0 || url.password.length > 0) return null;
    return host;
  } catch {
    return null;
  }
}

export function createAttribution(deps: AttributionDeps): FirstTouchReader {
  const storage = deps.storage ?? memoryStorage();
  let cached: FirstTouch | null = null;
  let loaded = false;

  function readStored(): FirstTouch | null {
    if (loaded) return cached;
    loaded = true;
    try {
      const raw = storage.read(TOUCH_STORAGE_KEY);
      if (raw === null) return (cached = null);
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.sourceHost !== 'string' || typeof parsed.landingRoutePattern !== 'string' || typeof parsed.capturedAt !== 'number') {
        return (cached = null);
      }
      const campaign = typeof parsed.campaign === 'string' && CAMPAIGN_ALLOW_LIST.includes(parsed.campaign) ? parsed.campaign : undefined;
      const touch: FirstTouch = {
        sourceHost: parsed.sourceHost,
        landingRoutePattern: parsed.landingRoutePattern,
        capturedAt: parsed.capturedAt,
        ...(campaign !== undefined ? { campaign } : {}),
      };
      cached = touch;
      return touch;
    } catch {
      return (cached = null);
    }
  }

  function write(touch: FirstTouch): void {
    cached = touch;
    loaded = true;
    try {
      storage.write(TOUCH_STORAGE_KEY, JSON.stringify(touch));
    } catch {
      /* in-page only: losing the touch is a smaller failure than a write that throws into a route change */
    }
  }

  return {
    current() {
      // Read again rather than cache blindly: consent may have been withdrawn in another tab, and a
      // touch captured under consent that no longer exists must not keep riding on events.
      if (!deps.allowed()) return null;
      return readStored();
    },

    capture() {
      if (!deps.allowed()) return null;
      if (readStored() !== null) return cached; // first touch means exactly one, from the start of the session
      if (deps.location === null) return null;

      const sourceHost = deps.referrer === null || deps.referrer.length === 0 ? null : hostOf(deps.referrer);
      // No referrer (typed a URL, opened a bookmark, referrer-policy stripped it) is "direct", and
      // "direct" is a conclusion we would rather not draw from an absence.
      if (sourceHost === null || sourceHost === deps.ownHost.toLowerCase()) return null;

      // Params are inspected only to *drop* them: a campaign value has to be on the allowlist to be
      // kept, and every cross-site identifier is discarded whatever it says.
      const params = new URLSearchParams(deps.location.search);
      for (const forbidden of CROSS_SITE_PARAMS) {
        if (params.has(forbidden)) params.delete(forbidden);
      }
      const rawCampaign = params.get('utm_source');
      const campaign = rawCampaign !== null && CAMPAIGN_ALLOW_LIST.includes(rawCampaign) ? rawCampaign : undefined;

      const touch: FirstTouch = {
        sourceHost,
        landingRoutePattern: deps.routePatternFor(deps.location.pathname),
        capturedAt: deps.now(),
        ...(campaign !== undefined ? { campaign } : {}),
      };
      write(touch);
      return touch;
    },

    erase() {
      cached = null;
      loaded = true;
      try {
        storage.remove(TOUCH_STORAGE_KEY);
      } catch {
        /* nothing */
      }
    },
  };
}

/**
 * Exposed for `attribution.test.ts` and for the app shell: the value a URL *would* have produced,
 * with no storage involved. Useful for a "how did you get here" debug read that must not persist.
 */
export function describeSource(referrer: string | null, ownHost: string): { sourceHost: string | null; kept: boolean } {
  const host = referrer === null ? null : hostOf(referrer);
  if (host === null) return { sourceHost: null, kept: false };
  if (host === ownHost.toLowerCase()) return { sourceHost: host, kept: false };
  return { sourceHost: host, kept: true };
}

export const ATTRIBUTION_STORAGE_KEY = TOUCH_STORAGE_KEY;
