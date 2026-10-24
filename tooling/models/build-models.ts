#!/usr/bin/env bun
/**
 * Geometry generator for the launch 3D assets.
 *
 * Run: `bun tooling/models/build-models.ts`
 *
 * Every asset is generated in code — no downloads, no companion `.bin`. The glTF 2.0 document
 * embeds one base64 buffer, so the file is self-contained and its JSON (node names, material
 * factors, animation channels) stays reviewable in a diff. Units are metres end to end:
 * `sceneTokens.unitsPerMeter` is 1, so a 38 mm case is authored at 0.038 m and needs no scale
 * correction at load time.
 *
 * The three products exercise the geometry styles the catalogue needs: a lathed cylinder with a
 * lofted strap (wristwatch), an extruded rounded profile (smartphone) and a quad loft (parka).
 * Every document carries one explicit clip named `inspect-turntable`: a 360° node rotation plus a
 * subtle translation bob on a camera-target node. The bob animates a NODE, not vertices — a morph
 * target would change the silhouette and misstate the item's geometry.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addBox,
  addCylinder,
  addDisc,
  addExtrudedProfile,
  addLoft,
  addRibbon,
  circleRing,
  createPart,
  ellipseRing,
  roundedRect,
  type MutablePart,
  type Vec3,
} from './geometry.js';
import { buildAsset, CLIP_NAME, GENERATOR, UNITS_PER_METER, type AssetSpec, type BuiltAsset } from './gltf.js';

export { CLIP_NAME, GENERATOR, UNITS_PER_METER };
export type { BuiltAsset, GltfDocument } from './gltf.js';

export const OUT_DIR = join(import.meta.dir, 'out');

export interface ManifestAssetEntry {
  readonly id: string;
  readonly file: string;
  readonly bytes: number;
  readonly triangles: number;
  readonly materials: number;
  readonly clip: string;
  readonly unitsPerMeter: number;
}

export interface ModelManifest {
  readonly schemaVersion: 1;
  readonly generator: string;
  readonly unitsPerMeter: number;
  readonly assets: readonly ManifestAssetEntry[];
}

// ---------------------------------------------------------------------------------------------
// Product geometry. Dimensions are metres.
// ---------------------------------------------------------------------------------------------

function watchParts(): MutablePart[] {
  const casePart = createPart('case', 0);
  addCylinder(casePart, [0, 0, 0], 0.019, 0.0055, 40);

  const dialPart = createPart('dial', 1);
  addDisc(dialPart, [0, 0, 0.0057], 0.0168, 40);

  const handPart = createPart('hands', 4);
  addBox(handPart, [0, 0.0055, 0.0061], [0.0011, 0.0125, 0.0006]);
  addBox(handPart, [0.0038, 0.0025, 0.0061], [0.0009, 0.0085, 0.0006]);

  const crystalPart = createPart('crystal', 2);
  addDisc(crystalPart, [0, 0, 0.0064], 0.0155, 40);

  const crownPart = createPart('crown', 4);
  addBox(crownPart, [0.0202, 0, 0], [0.0042, 0.0042, 0.0034]);

  const strapPart = createPart('strap', 3);
  for (const side of [1, -1] as const) {
    const rings: Vec3[][] = [];
    const segments = 9;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const y = side * (0.017 + 0.078 * t);
      const z = -0.034 * t * t;
      const tangent: Vec3 = [0, side * 0.078, -0.068 * t];
      const length = Math.hypot(tangent[1], tangent[2]);
      const outward: Vec3 = [0, -tangent[2] / length, tangent[1] / length];
      const halfWidth = 0.0095;
      const halfThickness = 0.0012;
      const at = (x: number, offset: number): Vec3 => [x, y + outward[1] * offset, z + outward[2] * offset];
      rings.push([
        at(halfWidth, halfThickness),
        at(-halfWidth, halfThickness),
        at(-halfWidth, -halfThickness),
        at(halfWidth, -halfThickness),
      ]);
    }
    addRibbon(strapPart, rings);
  }
  return [casePart, dialPart, handPart, crystalPart, crownPart, strapPart];
}

function phoneParts(): MutablePart[] {
  const outer = roundedRect(0.03575, 0.0735, 0.009, 7);
  const bodyPart = createPart('body', 0);
  addExtrudedProfile(bodyPart, outer, 0.0039, -0.0039);

  const screenProfile = roundedRect(0.0324, 0.0678, 0.006, 7);
  const screen = screenProfile.map(([x, y]): Vec3 => [x, y, 0.00395]);
  const screenPart = createPart('screen', 1);
  const center: Vec3 = [0, 0, 0.00395];
  for (let i = 0; i < screen.length; i += 1) {
    const a = screen[i]!;
    const b = screen[(i + 1) % screen.length]!;
    const start = screenPart.positions.length / 3;
    for (const point of [center, a, b]) {
      screenPart.positions.push(point[0], point[1], point[2]);
      screenPart.normals.push(0, 0, 1);
    }
    screenPart.indices.push(start, start + 1, start + 2);
  }

  const cameraPart = createPart('camera', 2);
  addCylinder(cameraPart, [0.016, 0.05, -0.0044], 0.0085, 0.0012, 28);

  const lensPart = createPart('lens', 3);
  addDisc(lensPart, [0.016, 0.05, -0.0057], 0.0058, 28, true);
  return [bodyPart, screenPart, cameraPart, lensPart];
}

function parkaParts(): MutablePart[] {
  const shellPart = createPart('shell', 0);
  const rings: Vec3[][] = [
    ellipseRing([0, 0.34, 0], 0.235, 0.155, 24),
    ellipseRing([0, 0.55, 0], 0.225, 0.15, 24),
    ellipseRing([0, 0.78, 0], 0.21, 0.145, 24),
    ellipseRing([0, 1.04, 0], 0.245, 0.17, 24),
    ellipseRing([0, 1.3, 0], 0.262, 0.176, 24),
    ellipseRing([0, 1.37, 0], 0.1, 0.09, 24),
    ellipseRing([0, 1.47, 0], 0.13, 0.12, 24),
    ellipseRing([0, 1.57, 0], 0.09, 0.085, 24),
  ];
  addLoft(shellPart, rings);

  for (const side of [1, -1] as const) {
    addLoft(shellPart, [
      circleRing([side * 0.255, 1.27, 0], 0.072, 16),
      circleRing([side * 0.29, 1.1, 0], 0.066, 16),
      circleRing([side * 0.318, 0.92, 0], 0.06, 16),
      circleRing([side * 0.338, 0.74, 0], 0.054, 16),
      circleRing([side * 0.342, 0.69, 0], 0.05, 16),
    ]);
  }

  const trimPart = createPart('trim', 1);
  addBox(trimPart, [0, 0.86, 0.164], [0.012, 0.96, 0.006]);
  addBox(trimPart, [0, 1.39, 0.095], [0.18, 0.014, 0.014]);
  for (const side of [1, -1] as const) {
    addBox(trimPart, [side * 0.342, 0.69, 0], [0.02, 0.024, 0.11]);
  }

  const zipPart = createPart('zipper', 2);
  addBox(zipPart, [0, 0.86, 0.168], [0.004, 0.94, 0.002]);
  return [shellPart, trimPart, zipPart];
}

const WATCH_MATERIALS = [
  { name: 'brushed-steel', color: '#C8CDD2', metallic: 0.95, roughness: 0.26 },
  { name: 'dial-ink', color: '#10161D', metallic: 0.2, roughness: 0.5 },
  { name: 'sapphire-crystal', color: '#E8F2FF', metallic: 0, roughness: 0.04, alpha: 0.28, doubleSided: true },
  { name: 'leather-strap', color: '#4A2E20', metallic: 0, roughness: 0.78, doubleSided: true },
  { name: 'gold-hands', color: '#C9A227', metallic: 1, roughness: 0.28 },
] as const;

const PHONE_MATERIALS = [
  { name: 'aluminium-frame', color: '#B7BEC7', metallic: 0.9, roughness: 0.32 },
  { name: 'glass-screen', color: '#05070A', metallic: 0, roughness: 0.08 },
  { name: 'camera-ring', color: '#6E747C', metallic: 0.85, roughness: 0.3 },
  { name: 'optical-lens', color: '#131820', metallic: 0.6, roughness: 0.15 },
] as const;

const PARKA_MATERIALS = [
  { name: 'waxed-nylon', color: '#243247', metallic: 0, roughness: 0.88, doubleSided: true },
  { name: 'webbing-trim', color: '#12161C', metallic: 0, roughness: 0.7, doubleSided: true },
  { name: 'metal-zipper', color: '#A6ADB5', metallic: 0.85, roughness: 0.4 },
] as const;

const SPECS: readonly AssetSpec[] = [
  {
    id: 'wristwatch',
    file: 'wristwatch.gltf',
    materials: WATCH_MATERIALS,
    parts: watchParts(),
    animation: { targetY: 0.021, bobMeters: 0.0015 },
  },
  {
    id: 'smartphone',
    file: 'smartphone.gltf',
    materials: PHONE_MATERIALS,
    parts: phoneParts(),
    animation: { targetY: 0, bobMeters: 0.002 },
  },
  {
    id: 'parka',
    file: 'parka.gltf',
    materials: PARKA_MATERIALS,
    parts: parkaParts(),
    animation: { targetY: 0.96, bobMeters: 0.004 },
  },
];

export function buildAssets(): BuiltAsset[] {
  return SPECS.map(buildAsset);
}

export function writeAssets(outDir: string = OUT_DIR): ModelManifest {
  mkdirSync(outDir, { recursive: true });
  const built = buildAssets();
  for (const asset of built) writeFileSync(join(outDir, asset.file), asset.bytes);
  const manifest: ModelManifest = {
    schemaVersion: 1,
    generator: 'tooling/models/build-models.ts',
    unitsPerMeter: UNITS_PER_METER,
    assets: built.map((asset) => ({
      id: asset.id,
      file: asset.file,
      bytes: asset.byteLength,
      triangles: asset.triangles,
      materials: asset.materialCount,
      clip: CLIP_NAME,
      unitsPerMeter: UNITS_PER_METER,
    })),
  };
  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

const isMain = (import.meta as ImportMeta & { main?: boolean }).main === true;
if (isMain) {
  const manifest = writeAssets();
  for (const asset of manifest.assets) {
    console.log(`${asset.file}: ${asset.bytes} bytes, ${asset.triangles} triangles, ${asset.materials} materials`);
  }
  console.log(`manifest.json: ${manifest.assets.length} assets, ${manifest.unitsPerMeter} unit = 1 m`);
}
