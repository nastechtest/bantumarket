/**
 * Geometry primitives for `build-models.ts`. Units are metres; every builder writes positions,
 * vertex normals and indices into a `MutablePart`, which the glTF encoder turns into one primitive.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export interface MutablePart {
  readonly name: string;
  readonly material: number;
  readonly positions: number[];
  readonly normals: number[];
  readonly indices: number[];
}

export function createPart(name: string, material: number): MutablePart {
  return { name, material, positions: [], normals: [], indices: [] };
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(v: Vec3): Vec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length === 0) return [0, 1, 0];
  return [v[0] / length, v[1] / length, v[2] / length];
}

function faceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  return normalize(cross(subtract(b, a), subtract(c, b)));
}

function addQuad(
  part: MutablePart,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  normals?: [Vec3, Vec3, Vec3, Vec3],
): void {
  const n = faceNormal(a, b, c);
  const start = part.positions.length / 3;
  const ns = normals ?? [n, n, n, n];
  for (const [index, point] of [a, b, c, d].entries()) {
    part.positions.push(point[0], point[1], point[2]);
    const normal = ns[index] ?? n;
    part.normals.push(normal[0], normal[1], normal[2]);
  }
  part.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function addTriangle(part: MutablePart, a: Vec3, b: Vec3, c: Vec3, normal?: Vec3): void {
  const n = normal ?? faceNormal(a, b, c);
  const start = part.positions.length / 3;
  for (const point of [a, b, c]) {
    part.positions.push(point[0], point[1], point[2]);
    part.normals.push(n[0], n[1], n[2]);
  }
  part.indices.push(start, start + 1, start + 2);
}

/** Closed cylinder around +Z. Used for the watch case and the phone camera ring. */
export function addCylinder(
  part: MutablePart,
  center: Vec3,
  radius: number,
  halfDepth: number,
  segments: number,
): void {
  const [cx, cy, cz] = center;
  const rings: Array<{ top: Vec3; bottom: Vec3; normal: Vec3 }> = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    rings.push({
      top: [cx + radius * cos, cy + radius * sin, cz + halfDepth],
      bottom: [cx + radius * cos, cy + radius * sin, cz - halfDepth],
      normal: [cos, sin, 0],
    });
  }
  for (let i = 0; i < segments; i += 1) {
    const current = rings[i]!;
    const next = rings[(i + 1) % segments]!;
    addQuad(part, current.bottom, next.bottom, next.top, current.top, [
      current.normal,
      next.normal,
      next.normal,
      current.normal,
    ]);
  }
  const frontCenter: Vec3 = [cx, cy, cz + halfDepth];
  const backCenter: Vec3 = [cx, cy, cz - halfDepth];
  const frontRing = rings.map((ring) => ring.top);
  const backRing = rings.map((ring) => ring.bottom).reverse();
  for (let i = 0; i < segments; i += 1) {
    addTriangle(part, frontCenter, frontRing[i]!, frontRing[(i + 1) % segments]!, [0, 0, 1]);
    addTriangle(part, backCenter, backRing[i]!, backRing[(i + 1) % segments]!, [0, 0, -1]);
  }
}

/** Flat disc facing +Z (or -Z when flipped). */
export function addDisc(part: MutablePart, center: Vec3, radius: number, segments: number, flip = false): void {
  const ring: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle), center[2]]);
  }
  const normal: Vec3 = flip ? [0, 0, -1] : [0, 0, 1];
  for (let i = 0; i < segments; i += 1) {
    if (flip) addTriangle(part, center, ring[(i + 1) % segments]!, ring[i]!, normal);
    else addTriangle(part, center, ring[i]!, ring[(i + 1) % segments]!, normal);
  }
}

export function addBox(part: MutablePart, center: Vec3, size: Vec3): void {
  const [cx, cy, cz] = center;
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const p = (sx: number, sy: number, sz: number): Vec3 => [cx + sx * hx, cy + sy * hy, cz + sz * hz];
  addQuad(part, p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1));
  addQuad(part, p(1, -1, -1), p(-1, -1, -1), p(-1, 1, -1), p(1, 1, -1));
  addQuad(part, p(1, -1, 1), p(1, -1, -1), p(1, 1, -1), p(1, 1, 1));
  addQuad(part, p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), p(-1, 1, -1));
  addQuad(part, p(-1, 1, 1), p(1, 1, 1), p(1, 1, -1), p(-1, 1, -1));
  addQuad(part, p(-1, -1, -1), p(1, -1, -1), p(1, -1, 1), p(-1, -1, 1));
}

/** Loft between equal-length rings; rings are ordered bottom to top. */
export function addLoft(part: MutablePart, rings: Vec3[][]): void {
  const count = rings[0]?.length ?? 0;
  for (let r = 0; r < rings.length - 1; r += 1) {
    const lower = rings[r]!;
    const upper = rings[r + 1]!;
    for (let i = 0; i < count; i += 1) {
      const j = (i + 1) % count;
      addQuad(part, lower[i]!, upper[i]!, upper[j]!, lower[j]!);
    }
  }
}

/** Loft a rectangular cross-section along a path (4 points per ring). */
export function addRibbon(part: MutablePart, rings: Vec3[][]): void {
  for (let r = 0; r < rings.length - 1; r += 1) {
    const current = rings[r]!;
    const next = rings[r + 1]!;
    for (let i = 0; i < current.length; i += 1) {
      const j = (i + 1) % current.length;
      addQuad(part, current[i]!, next[i]!, next[j]!, current[j]!);
    }
  }
  const first = rings[0];
  const last = rings[rings.length - 1];
  if (first) addQuad(part, first[0]!, first[1]!, first[2]!, first[3]!);
  if (last) addQuad(part, last[3]!, last[2]!, last[1]!, last[0]!);
}

export function roundedRect(halfWidth: number, halfHeight: number, radius: number, arcSegments: number): Vec2[] {
  const points: Vec2[] = [];
  const corners: Array<[number, number, number]> = [
    [halfWidth - radius, halfHeight - radius, 0],
    [-(halfWidth - radius), halfHeight - radius, 90],
    [-(halfWidth - radius), -(halfHeight - radius), 180],
    [halfWidth - radius, -(halfHeight - radius), 270],
  ];
  for (const [cx, cy, startDeg] of corners) {
    for (let i = 0; i <= arcSegments; i += 1) {
      const angle = ((startDeg + (i / arcSegments) * 90) * Math.PI) / 180;
      const point: Vec2 = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
      const previous = points[points.length - 1];
      if (!previous || Math.hypot(previous[0] - point[0], previous[1] - point[1]) > 1e-9) points.push(point);
    }
  }
  return points;
}

/** Extrude a rounded-rectangle profile between two Z planes (CCW profile). */
export function addExtrudedProfile(part: MutablePart, profile: Vec2[], zFront: number, zBack: number): void {
  const frontCenter: Vec3 = [0, 0, zFront];
  const backCenter: Vec3 = [0, 0, zBack];
  const front = profile.map(([x, y]): Vec3 => [x, y, zFront]);
  const back = profile.map(([x, y]): Vec3 => [x, y, zBack]);
  for (let i = 0; i < profile.length; i += 1) {
    const j = (i + 1) % profile.length;
    addTriangle(part, frontCenter, front[i]!, front[j]!, [0, 0, 1]);
    addTriangle(part, backCenter, back[j]!, back[i]!, [0, 0, -1]);
    addQuad(part, front[i]!, back[i]!, back[j]!, front[j]!);
  }
}

export function ellipseRing(center: Vec3, radiusX: number, radiusZ: number, segments: number): Vec3[] {
  const ring: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([center[0] + radiusX * Math.cos(angle), center[1], center[2] + radiusZ * Math.sin(angle)]);
  }
  return ring;
}

export function circleRing(center: Vec3, radius: number, segments: number): Vec3[] {
  const ring: Vec3[] = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    ring.push([center[0] + radius * Math.cos(angle), center[1], center[2] + radius * Math.sin(angle)]);
  }
  return ring;
}
