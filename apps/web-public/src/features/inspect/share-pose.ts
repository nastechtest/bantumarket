import type { Pose } from './scene-types.js';

/**
 * Share the exact view you are looking at.
 *
 * A pose is three finite numbers, so it is encoded into the URL *fragment* (`#pose=...`) rather than
 * a query string: the fragment never hits the server, never lands in an analytics path, and survives
 * the router's history push. The buyer who receives the link opens the same inspect route at the same
 * orbit — the pose is a view, not a claim, so nothing here implies a check happened.
 */

export const POSE_FRAGMENT_KEY = 'pose';

const ROUND = (n: number): number => Math.round(n * 100) / 100;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function encodePose(pose: Pose): string {
  const az = ROUND(clamp(pose.azimuthDeg, -360, 360));
  const polar = ROUND(clamp(pose.polarDeg, 0, 180));
  const zoom = ROUND(clamp(pose.zoom, 0.25, 4));
  return `${POSE_FRAGMENT_KEY}=${az},${polar},${zoom}`;
}

/** Parse a fragment like `#pose=30,75,1.5`. Invalid or absent input falls back to the default pose. */
export function decodePose(fragment: string, fallback: Pose): Pose {
  const cleaned = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const match = new RegExp(`${POSE_FRAGMENT_KEY}=(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)`).exec(cleaned);
  if (!match) return fallback;
  const azimuthDeg = Number(match[1]);
  const polarDeg = Number(match[2]);
  const zoom = Number(match[3]);
  if (![azimuthDeg, polarDeg, zoom].every(Number.isFinite)) return fallback;
  return {
    azimuthDeg: clamp(azimuthDeg, -360, 360),
    polarDeg: clamp(polarDeg, 0, 180),
    zoom: clamp(zoom, 0.25, 4),
  };
}

/** Build a shareable absolute URL from a pathname plus the current pose. Pure for the same reason. */
export function poseShareUrl(origin: string, pathname: string, pose: Pose): string {
  const base = `${origin.replace(/\/$/, '')}${pathname}`;
  return `${base}#${encodePose(pose)}`;
}
