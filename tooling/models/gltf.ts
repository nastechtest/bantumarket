/**
 * glTF 2.0 encoding: one embedded buffer, PBR materials, and the `inspect-turntable` clip.
 * Kept separate from product geometry so the document contract (indices, accessors, animation
 * targets) is reviewable without scrolling past a parka loft.
 */

import type { MutablePart, Vec3 } from './geometry.js';

/** Mirrors `sceneTokens.unitsPerMeter`; asserted by the package registry test. */
export const UNITS_PER_METER = 1;
export const GENERATOR = 'nastech build-models 1.0';
export const CLIP_NAME = 'inspect-turntable';

type Vec4 = readonly [number, number, number, number];

export interface GltfDocument {
  asset: {
    version: '2.0';
    generator: string;
    extras: { assetId: string; unitsPerMeter: number; clip: string; triangles: number };
  };
  scene: number;
  scenes: Array<{ name: string; nodes: number[]; extras?: Record<string, unknown> }>;
  nodes: Array<{
    name: string;
    mesh?: number;
    children?: number[];
    translation?: Vec3;
    rotation?: Vec4;
  }>;
  meshes: Array<{
    name: string;
    primitives: Array<{ attributes: Record<string, number>; indices: number; material: number }>;
  }>;
  materials: Array<{
    name: string;
    pbrMetallicRoughness: {
      baseColorFactor: number[];
      metallicFactor: number;
      roughnessFactor: number;
    };
    alphaMode?: 'BLEND';
    doubleSided?: boolean;
  }>;
  accessors: Array<{
    bufferView: number;
    componentType: number;
    count: number;
    type: 'SCALAR' | 'VEC3' | 'VEC4';
    min?: number[];
    max?: number[];
  }>;
  bufferViews: Array<{ buffer: number; byteOffset: number; byteLength: number; target?: number }>;
  buffers: Array<{ byteLength: number; uri: string }>;
  animations: Array<{
    name: string;
    samplers: Array<{ input: number; output: number; interpolation: 'LINEAR' }>;
    channels: Array<{ sampler: number; target: { node: number; path: 'rotation' | 'translation' } }>;
  }>;
}

export interface BuiltAsset {
  readonly id: string;
  readonly file: string;
  readonly json: GltfDocument;
  readonly bytes: Uint8Array;
  readonly byteLength: number;
  readonly triangles: number;
  readonly materialCount: number;
}

export interface MaterialSpec {
  readonly name: string;
  readonly color: string;
  readonly metallic: number;
  readonly roughness: number;
  readonly alpha?: number;
  readonly doubleSided?: boolean;
}

export interface AnimationSpec {
  /** Base camera-target height in metres; the bob oscillates around it. */
  readonly targetY: number;
  /** Bob amplitude in metres — subtle by design. */
  readonly bobMeters: number;
}

export interface AssetSpec {
  readonly id: string;
  readonly file: string;
  readonly materials: readonly MaterialSpec[];
  readonly parts: readonly MutablePart[];
  readonly animation: AnimationSpec;
}

function srgbToLinear(hex: string): Vec3 {
  const value = hex.replace('#', '');
  const channel = (offset: number): number => {
    const srgb = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(2), channel(4)];
}

function materialJson(spec: MaterialSpec): GltfDocument['materials'][number] {
  const [r, g, b] = srgbToLinear(spec.color);
  return {
    name: spec.name,
    pbrMetallicRoughness: {
      baseColorFactor: [r, g, b, spec.alpha ?? 1],
      metallicFactor: spec.metallic,
      roughnessFactor: spec.roughness,
    },
    ...(spec.alpha !== undefined && spec.alpha < 1 ? { alphaMode: 'BLEND' as const } : {}),
    ...(spec.doubleSided ? { doubleSided: true } : {}),
  };
}

class BufferBuilder {
  private readonly chunks: Uint8Array[] = [];
  private length = 0;

  add(bytes: Uint8Array): { offset: number; byteLength: number } {
    const padding = (4 - (this.length % 4)) % 4;
    if (padding > 0) {
      this.chunks.push(new Uint8Array(padding));
      this.length += padding;
    }
    const offset = this.length;
    this.chunks.push(bytes);
    this.length += bytes.byteLength;
    return { offset, byteLength: bytes.byteLength };
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
}

interface Encoder {
  readonly json: GltfDocument;
  readonly buffer: BufferBuilder;
}

function createEncoder(assetId: string): Encoder {
  return {
    buffer: new BufferBuilder(),
    json: {
      asset: {
        version: '2.0',
        generator: GENERATOR,
        extras: { assetId, unitsPerMeter: UNITS_PER_METER, clip: CLIP_NAME, triangles: 0 },
      },
      scene: 0,
      scenes: [{ name: `${assetId}-scene`, nodes: [0], extras: { unitsPerMeter: UNITS_PER_METER } }],
      nodes: [],
      meshes: [],
      materials: [],
      accessors: [],
      bufferViews: [],
      buffers: [{ byteLength: 0, uri: '' }],
      animations: [],
    },
  };
}

function accessorBounds(values: readonly number[], components: number): { min: number[]; max: number[] } {
  const min = new Array<number>(components).fill(Number.POSITIVE_INFINITY);
  const max = new Array<number>(components).fill(Number.NEGATIVE_INFINITY);
  for (let i = 0; i < values.length; i += components) {
    for (let c = 0; c < components; c += 1) {
      const value = values[i + c] ?? 0;
      if (value < min[c]!) min[c] = value;
      if (value > max[c]!) max[c] = value;
    }
  }
  return { min, max };
}

function pushAccessor(
  encoder: Encoder,
  view: { offset: number; byteLength: number },
  componentType: number,
  type: 'SCALAR' | 'VEC3' | 'VEC4',
  count: number,
  bounds: { min: number[]; max: number[] } | null,
  target?: number,
): number {
  encoder.json.bufferViews.push({
    buffer: 0,
    byteOffset: view.offset,
    byteLength: view.byteLength,
    ...(target !== undefined ? { target } : {}),
  });
  encoder.json.accessors.push({
    bufferView: encoder.json.bufferViews.length - 1,
    componentType,
    count,
    type,
    ...(bounds ? { min: bounds.min, max: bounds.max } : {}),
  });
  return encoder.json.accessors.length - 1;
}

function addAccessor(
  encoder: Encoder,
  values: readonly number[],
  componentType: 5126 | 5123,
  type: 'SCALAR' | 'VEC3' | 'VEC4',
  withBounds: boolean,
  target?: number,
): number {
  const typed = componentType === 5126 ? new Float32Array(values) : new Uint16Array(values);
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const view = encoder.buffer.add(bytes);
  const components = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4;
  const bounds = withBounds ? accessorBounds(values, components) : null;
  return pushAccessor(encoder, view, componentType, type, values.length / components, bounds, target);
}

function addAnimationAccessor(
  encoder: Encoder,
  values: readonly number[],
  type: 'SCALAR' | 'VEC3' | 'VEC4',
  withBounds: boolean,
): number {
  const typed = new Float32Array(values);
  const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  const view = encoder.buffer.add(bytes);
  const components = type === 'SCALAR' ? 1 : type === 'VEC3' ? 3 : 4;
  const bounds = withBounds ? accessorBounds(values, components) : null;
  return pushAccessor(encoder, view, 5126, type, values.length / components, bounds);
}

function addInspectAnimation(encoder: Encoder, spec: AnimationSpec): void {
  const duration = 10;
  const keys = 9;
  const times: number[] = [];
  const rotations: number[] = [];
  const translations: number[] = [];
  for (let i = 0; i < keys; i += 1) {
    const t = (i / (keys - 1)) * duration;
    const angle = (i / (keys - 1)) * Math.PI * 2;
    times.push(t);
    rotations.push(0, Math.sin(angle / 2), 0, Math.cos(angle / 2));
    translations.push(0, spec.targetY + spec.bobMeters * Math.sin((Math.PI * 2 * t) / 5), 0);
  }
  const input = addAnimationAccessor(encoder, times, 'SCALAR', true);
  const rotationOutput = addAnimationAccessor(encoder, rotations, 'VEC4', false);
  const translationOutput = addAnimationAccessor(encoder, translations, 'VEC3', false);
  encoder.json.animations.push({
    name: CLIP_NAME,
    samplers: [
      { input, output: rotationOutput, interpolation: 'LINEAR' },
      { input, output: translationOutput, interpolation: 'LINEAR' },
    ],
    channels: [
      { sampler: 0, target: { node: 1, path: 'rotation' } },
      { sampler: 1, target: { node: 3, path: 'translation' } },
    ],
  });
  // Node 1 is the turntable; node 3 is the camera target. Both exist by construction in buildAsset.
  encoder.json.nodes[1]!.rotation = [0, 0, 0, 1];
  encoder.json.nodes[3]!.translation = [0, spec.targetY, 0];
}

export function buildAsset(spec: AssetSpec): BuiltAsset {
  if (spec.parts.length === 0) throw new Error(`${spec.id}: no geometry`);
  const encoder = createEncoder(spec.id);
  encoder.json.materials.push(...spec.materials.map(materialJson));

  let triangles = 0;
  const primitives: GltfDocument['meshes'][number]['primitives'] = [];
  for (const part of spec.parts) {
    const maxIndex = Math.max(...part.indices);
    if (maxIndex > 65535) throw new Error(`${part.name}: index ${maxIndex} exceeds Uint16`);
    if (part.positions.length !== part.normals.length) throw new Error(`${part.name}: position/normal mismatch`);
    const position = addAccessor(encoder, part.positions, 5126, 'VEC3', true, 34962);
    const normal = addAccessor(encoder, part.normals, 5126, 'VEC3', false, 34962);
    const indices = addAccessor(encoder, part.indices, 5123, 'SCALAR', false, 34963);
    primitives.push({ attributes: { POSITION: position, NORMAL: normal }, indices, material: part.material });
    triangles += part.indices.length / 3;
  }
  encoder.json.meshes.push({ name: `${spec.id}-mesh`, primitives });
  encoder.json.nodes.push(
    { name: `${spec.id}-root`, children: [1, 3] },
    { name: 'turntable', children: [2] },
    { name: `${spec.id}-model`, mesh: 0 },
    { name: 'inspect-target' },
  );
  addInspectAnimation(encoder, spec.animation);

  encoder.json.asset.extras.triangles = triangles;
  const buffer = encoder.buffer.toUint8Array();
  encoder.json.buffers[0] = {
    byteLength: buffer.byteLength,
    uri: `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`,
  };
  const text = `${JSON.stringify(encoder.json, null, 2)}\n`;
  const bytes = new TextEncoder().encode(text);
  return {
    id: spec.id,
    file: spec.file,
    json: encoder.json,
    bytes,
    byteLength: bytes.byteLength,
    triangles,
    materialCount: spec.materials.length,
  };
}
