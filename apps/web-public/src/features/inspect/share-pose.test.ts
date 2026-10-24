import { describe, expect, it } from 'bun:test';
import { decodePose, encodePose, poseShareUrl } from './share-pose.js';
import type { Pose } from './scene-types.js';

const base: Pose = { azimuthDeg: 34, polarDeg: 72, zoom: 1.5 };

describe('share-pose', () => {
  it('round-trips a pose through the URL fragment', () => {
    const fragment = `#${encodePose(base)}`;
    expect(decodePose(fragment, { azimuthDeg: 0, polarDeg: 90, zoom: 1 })).toEqual(base);
  });

  it('falls back to the default when the fragment is absent or malformed', () => {
    const fallback: Pose = { azimuthDeg: 0, polarDeg: 90, zoom: 1 };
    expect(decodePose('', fallback)).toEqual(fallback);
    expect(decodePose('#other=1,2,3', fallback)).toEqual(fallback);
    expect(decodePose('#pose=NaN,x,1', fallback)).toEqual(fallback);
  });

  it('clamps out-of-range values instead of trusting a hand-edited link', () => {
    const p = decodePose('#pose=999,-999,99', { azimuthDeg: 0, polarDeg: 0, zoom: 1 });
    expect(p.azimuthDeg).toBeLessThanOrEqual(360);
    expect(p.polarDeg).toBeGreaterThanOrEqual(0);
    expect(p.polarDeg).toBeLessThanOrEqual(180);
    expect(p.zoom).toBeLessThanOrEqual(4);
  });

  it('builds an absolute share URL with the pose in the fragment, not the query', () => {
    const url = poseShareUrl('https://market.example/', '/item/lst_01/inspect', base);
    expect(url).toBe('https://market.example/item/lst_01/inspect#pose=34,72,1.5');
    expect(url).not.toContain('?');
  });
});
