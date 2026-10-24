/**
 * Station handshake.
 *
 * The rig presents three things and the pipeline checks each separately, because they fail
 * separately: the protocol version (a software upgrade), the station identity plus its key
 * fingerprint (a swapped or impersonated rig), and a single-use nonce (a replayed hello). A
 * handshake that only checked "the station id is known" would let an old agent reconnect after a
 * protocol change and a captured hello open a second session for the same job.
 *
 * `stationKeyFingerprint` is the digest of the station's public key, never the key itself. The
 * pipeline stores the digest at commissioning; the private half never leaves the rig.
 */

import { createHash } from 'node:crypto';
import { canonicalJson, makeEnvelope, PROTOCOL_VERSION, FRAMES_PER_SESSION, type StationEnvelope } from './protocol.js';
import { inputInvalid, stationProtocol } from '../errors.js';
import { profileFingerprint, type DeviceProfile } from './device-profile.js';

export interface RegisteredStation {
  readonly stationId: string;
  /** Digest of the station's public key. A fingerprint mismatch is a different machine. */
  readonly keyFingerprint: string;
  readonly profileFingerprint: string;
  readonly active: boolean;
}

export type StationRegistry = Readonly<Record<string, RegisteredStation>>;

export interface HelloBody {
  readonly stationId: string;
  readonly jobId: string;
  readonly nonce: string;
  readonly stationKeyFingerprint: string;
  readonly profileFingerprint: string;
  readonly protocolVersion: number;
  readonly agentVersion: string;
}

export interface WelcomeBody {
  readonly jobId: string;
  readonly sessionId: string;
  readonly serverTime: string;
  readonly protocolVersion: number;
  readonly framePlan: { readonly frames: number; readonly steps: number };
  readonly heartbeatSeconds: number;
  readonly ackEveryFrames: number;
}

export interface StationSession {
  readonly sessionId: string;
  readonly stationId: string;
  readonly jobId: string;
  readonly profileFingerprint: string;
  readonly openedAt: string;
}

/** A nonce seen once is spent. The interface is separate so the CLI can persist it across restarts. */
export interface NonceCache {
  /** True when the nonce was already present; recording is the caller's success path. */
  seen(nonce: string): boolean;
  remember(nonce: string): void;
}

export class MemoryNonceCache implements NonceCache {
  readonly #seen = new Set<string>();
  seen(nonce: string): boolean {
    return this.#seen.has(nonce);
  }
  remember(nonce: string): void {
    this.#seen.add(nonce);
  }
}

export interface HandshakeOptions {
  readonly registry: StationRegistry;
  readonly nonces: NonceCache;
  readonly deviceProfile: DeviceProfile;
  readonly now: Date;
  readonly expectedJobId?: string;
}

const MIN_NONCE_LENGTH = 16;
const HEX64 = /^[0-9a-f]{64}$/;

export function sessionIdFor(hello: HelloBody): string {
  return createHash('sha256')
    .update(canonicalJson({
      v: PROTOCOL_VERSION,
      stationId: hello.stationId,
      jobId: hello.jobId,
      nonce: hello.nonce,
      key: hello.stationKeyFingerprint,
      profile: hello.profileFingerprint,
    }), 'utf8')
    .digest('hex');
}

/**
 * Accept a hello. Every refusal names the field, because the operator at the rig can fix a
 * fingerprint and cannot fix "handshake failed".
 */
export function acceptHello(
  hello: HelloBody,
  options: HandshakeOptions,
): { readonly session: StationSession; readonly welcome: StationEnvelope } {
  if (hello.protocolVersion !== PROTOCOL_VERSION) {
    throw stationProtocol(
      'Handshake',
      `station agent speaks protocol ${hello.protocolVersion}, pipeline speaks ${PROTOCOL_VERSION}`,
      'Update the agent on the rig, or run the pipeline version the rig was commissioned against. Do not bridge the two.',
    );
  }
  const registered = options.registry[hello.stationId];
  if (!registered) {
    throw stationProtocol('Handshake', `station "${hello.stationId}" is not commissioned`, 'Commission the station before its first job; an unregistered rig has no calibration history.');
  }
  if (!registered.active) {
    throw stationProtocol('Handshake', `station "${hello.stationId}" is decommissioned`, 'A decommissioned station may not open sessions; issue a new station id.');
  }
  if (hello.stationKeyFingerprint !== registered.keyFingerprint) {
    throw stationProtocol(
      'Handshake',
      `key fingerprint ${hello.stationKeyFingerprint.slice(0, 12)}… does not match the commissioned fingerprint ${registered.keyFingerprint.slice(0, 12)}…`,
      'This is a different machine or a rotated key. Re-commission it; do not update the registry from a hello.',
    );
  }
  if (!HEX64.test(hello.nonce) || hello.nonce.length < MIN_NONCE_LENGTH) {
    throw stationProtocol('Handshake', 'nonce is not a unique 64-hex value', 'Generate the nonce from the rig RNG per connection; a counter is replayable.');
  }
  if (options.nonces.seen(hello.nonce)) {
    throw stationProtocol('Handshake', 'nonce has already been used', 'A replayed hello is a duplicated or captured connection; close it and generate a fresh nonce.');
  }
  if (options.expectedJobId !== undefined && hello.jobId !== options.expectedJobId) {
    throw stationProtocol('Handshake', `station asked to capture job "${hello.jobId}", pipeline opened "${options.expectedJobId}"`, 'Open the job on the station for the item that is physically in front of it.');
  }
  const profilePrint = profileFingerprint(options.deviceProfile);
  if (hello.profileFingerprint !== profilePrint || options.deviceProfile.stationId !== hello.stationId) {
    throw stationProtocol(
      'Handshake',
      'station profile fingerprint does not match the profile on file for this station',
      'Re-run commissioning if the optics changed. A profile edited in place invalidates every calibration solved against it.',
    );
  }
  if (registered.profileFingerprint !== profilePrint) {
    throw stationProtocol(
      'Handshake',
      'the registered profile fingerprint is stale',
      'Re-commission the station: its optics changed since it was registered, and its old calibration no longer applies.',
    );
  }

  options.nonces.remember(hello.nonce);
  const sessionId = sessionIdFor(hello);
  const session: StationSession = {
    sessionId,
    stationId: hello.stationId,
    jobId: hello.jobId,
    profileFingerprint: profilePrint,
    openedAt: options.now.toISOString(),
  };
  const welcome = makeEnvelope(
    'welcome',
    1,
    sessionId,
    {
      jobId: hello.jobId,
      sessionId,
      serverTime: options.now.toISOString(),
      protocolVersion: PROTOCOL_VERSION,
      framePlan: { frames: FRAMES_PER_SESSION, steps: options.deviceProfile.turntableSteps },
      heartbeatSeconds: 15,
      ackEveryFrames: 8,
    },
    options.now.toISOString(),
  );
  return { session, welcome };
}

/** Station-side check: the session id in a welcome must be derivable from the hello it answers. */
export function verifyWelcome(hello: HelloBody, welcome: StationEnvelope): WelcomeBody {
  if (welcome.kind !== 'welcome') throw stationProtocol('Welcome', `expected kind "welcome", got "${welcome.kind}"`, 'Close the connection; the peer is not the pipeline.');
  const body = welcome.body as unknown as WelcomeBody;
  const expected = sessionIdFor(hello);
  if (body.sessionId !== expected || welcome.sessionId !== expected) {
    throw stationProtocol('Welcome', 'session id is not the digest of this hello', 'A session id that does not bind to the hello lets one station write into another session.');
  }
  if (body.jobId !== hello.jobId) throw stationProtocol('Welcome', `welcome is for job "${body.jobId}", hello asked for "${hello.jobId}"`, 'Reconnect and name the intended job again.');
  if (!Number.isInteger(body.framePlan.frames) || body.framePlan.frames < 12) {
    throw inputInvalid(`Welcome frame plan is ${body.framePlan.frames} frames.`, 'A plan below the static-path floor is not a capture plan.');
  }
  return body;
}

/** Parses the body of a decoded hello without trusting its shape. */
export function readHello(body: Readonly<Record<string, unknown>>): HelloBody {
  const str = (name: string): string => {
    const value = body[name];
    if (typeof value !== 'string' || !value.trim()) throw stationProtocol('Hello', `missing ${name}`, 'The rig agent must send its full identity in every hello.');
    return value;
  };
  const version = body['protocolVersion'];
  if (typeof version !== 'number' || !Number.isInteger(version)) throw stationProtocol('Hello', 'missing protocolVersion', 'Protocol version is an integer, not a range.');
  return {
    stationId: str('stationId'),
    jobId: str('jobId'),
    nonce: str('nonce'),
    stationKeyFingerprint: str('stationKeyFingerprint'),
    profileFingerprint: str('profileFingerprint'),
    protocolVersion: version,
    agentVersion: str('agentVersion'),
  };
}
