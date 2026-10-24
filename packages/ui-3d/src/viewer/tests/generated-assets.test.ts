import { describe, expect, test } from 'bun:test';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { budgets } from '@nastech/api-contracts';
import { buildAssets, type GltfDocument, type ModelManifest } from '../../../../../tooling/models/build-models.js';
import { sceneTokens } from '../../tokens/scene-tokens.js';
import { assetIds, generatedAssets } from '../../assets/registry.js';

const OUT_DIR = join(import.meta.dir, '../../../../../tooling/models/out');

function readDocument(file: string): GltfDocument {
  return JSON.parse(readFileSync(join(OUT_DIR, file), 'utf8')) as GltfDocument;
}

function expectAccessorInRange(doc: GltfDocument, index: number, label: string): void {
  expect(Number.isInteger(index)).toBe(true);
  expect(index, `${label}: accessor ${index}`).toBeGreaterThanOrEqual(0);
  expect(index, `${label}: accessor ${index}`).toBeLessThan(doc.accessors.length);
}

function expectBufferViewInRange(doc: GltfDocument, index: number, label: string): void {
  expect(Number.isInteger(index)).toBe(true);
  expect(index, `${label}: bufferView ${index}`).toBeGreaterThanOrEqual(0);
  expect(index, `${label}: bufferView ${index}`).toBeLessThan(doc.bufferViews.length);
}

describe('generated glTF assets', () => {
  test('the generator emits exactly the three registry entries', () => {
    const built = buildAssets();
    expect(built.map((asset) => asset.id)).toEqual([...assetIds]);
    for (const asset of built) {
      expect(generatedAssets[asset.id as keyof typeof generatedAssets].file).toBe(asset.file);
      expect(generatedAssets[asset.id as keyof typeof generatedAssets].bytes).toBe(asset.byteLength);
    }
  });

  for (const id of assetIds) {
    const entry = generatedAssets[id];

    test(`${id}: parses as glTF 2.0 with one embedded buffer`, () => {
      const doc = readDocument(entry.file);
      expect(doc.asset.version).toBe('2.0');
      expect(doc.asset.generator.length).toBeGreaterThan(0);
      expect(doc.buffers).toHaveLength(1);
      expect(doc.buffers[0]!.uri.startsWith('data:application/octet-stream;base64,')).toBe(true);
      expect(doc.buffers[0]!.byteLength).toBeGreaterThan(0);
      expect(doc.scenes[doc.scene]).toBeDefined();
      expect(doc.asset.extras.assetId).toBe(id);
      expect(doc.asset.extras.unitsPerMeter).toBe(sceneTokens.unitsPerMeter);
      expect(entry.unitsPerMeter).toBe(sceneTokens.unitsPerMeter);
    });

    test(`${id}: every bufferView and accessor index is in range`, () => {
      const doc = readDocument(entry.file);
      const buffer = doc.buffers[0]!;
      doc.bufferViews.forEach((view, index) => {
        expect(view.buffer, `bufferView[${index}]`).toBeLessThan(doc.buffers.length);
        expect(view.byteOffset, `bufferView[${index}] offset`).toBeGreaterThanOrEqual(0);
        expect(view.byteOffset % 4, `bufferView[${index}] alignment`).toBe(0);
        expect(view.byteOffset + view.byteLength).toBeLessThanOrEqual(buffer.byteLength);
      });
      doc.accessors.forEach((accessor, index) => {
        expectBufferViewInRange(doc, accessor.bufferView, `accessor[${index}]`);
        expect(accessor.count).toBeGreaterThan(0);
        expect([5123, 5126]).toContain(accessor.componentType);
        if (accessor.type === 'SCALAR') expect(accessor.count).toBeGreaterThanOrEqual(3);
      });
      for (const [meshIndex, mesh] of doc.meshes.entries()) {
        for (const [primitiveIndex, primitive] of mesh.primitives.entries()) {
          for (const [attribute, accessor] of Object.entries(primitive.attributes)) {
            expectAccessorInRange(doc, accessor, `mesh[${meshIndex}].primitive[${primitiveIndex}].${attribute}`);
            expect(doc.accessors[accessor]!.type).toBe('VEC3');
          }
          expectAccessorInRange(doc, primitive.indices, `mesh[${meshIndex}].primitive[${primitiveIndex}].indices`);
          expect(doc.accessors[primitive.indices]!.type).toBe('SCALAR');
          expect(primitive.material).toBeLessThan(doc.materials.length);
        }
      }
    });

    test(`${id}: the animation targets exist as nodes and the clip is explicit`, () => {
      const doc = readDocument(entry.file);
      expect(doc.animations).toHaveLength(1);
      const animation = doc.animations[0]!;
      expect(animation.name).toBe(entry.clip);
      expect(animation.channels.length).toBeGreaterThanOrEqual(2);
      for (const channel of animation.channels) {
        expect(channel.sampler).toBeLessThan(animation.samplers.length);
        expectAccessorInRange(doc, animation.samplers[channel.sampler]!.input, `channel ${channel.sampler} input`);
        expectAccessorInRange(doc, animation.samplers[channel.sampler]!.output, `channel ${channel.sampler} output`);
        expect(doc.accessors[animation.samplers[channel.sampler]!.input]!.type).toBe('SCALAR');
        expect(Number.isInteger(channel.target.node)).toBe(true);
        expect(channel.target.node).toBeGreaterThanOrEqual(0);
        expect(channel.target.node).toBeLessThan(doc.nodes.length);
      }
      const targets = animation.channels.map((channel) => doc.nodes[channel.target.node]!.name);
      expect(targets).toContain('turntable');
      expect(targets).toContain('inspect-target');
      expect(animation.channels.some((channel) => channel.target.path === 'rotation')).toBe(true);
      expect(animation.channels.some((channel) => channel.target.path === 'translation')).toBe(true);
    });

    test(`${id}: PBR materials, and the file is inside the scene asset budget`, () => {
      const doc = readDocument(entry.file);
      expect(doc.materials.length).toBe(entry.materials);
      for (const material of doc.materials) {
        expect(material.name.length).toBeGreaterThan(0);
        expect(material.pbrMetallicRoughness.baseColorFactor).toHaveLength(4);
        expect(material.pbrMetallicRoughness.metallicFactor).toBeGreaterThanOrEqual(0);
        expect(material.pbrMetallicRoughness.metallicFactor).toBeLessThanOrEqual(1);
        expect(material.pbrMetallicRoughness.roughnessFactor).toBeGreaterThanOrEqual(0);
        expect(material.pbrMetallicRoughness.roughnessFactor).toBeLessThanOrEqual(1);
      }
      const bytes = statSync(join(OUT_DIR, entry.file)).size;
      expect(bytes).toBe(entry.bytes);
      expect(bytes).toBeLessThan(budgets.sceneLodMaxBytes);
      expect(bytes).toBeLessThan(budgets.sceneAssetMb * 1024 * 1024);
    });
  }

  test('manifest.json lists each asset with its on-disk byte size', () => {
    const manifest = JSON.parse(readFileSync(join(OUT_DIR, 'manifest.json'), 'utf8')) as ModelManifest;
    expect(manifest.unitsPerMeter).toBe(sceneTokens.unitsPerMeter);
    expect(manifest.assets).toHaveLength(assetIds.length);
    for (const asset of manifest.assets) {
      expect(asset.bytes).toBe(statSync(join(OUT_DIR, asset.file)).size);
      expect(asset.bytes).toBe(generatedAssets[asset.id as keyof typeof generatedAssets].bytes);
      expect(asset.unitsPerMeter).toBe(sceneTokens.unitsPerMeter);
    }
  });
});
