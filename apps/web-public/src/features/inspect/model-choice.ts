/**
 * Which shipped model an asset manifest is for.
 *
 * The manifest carries an opaque `assetId`, so the choice is a named lookup rather than a guess. An id
 * this file does not recognise falls back to the procedural placeholder: rendering a parka for a watch
 * listing would be a visual claim about the item that is simply false, which is the one thing the
 * inspect surface exists to avoid.
 */
import type { AssetId } from '@nastech/ui-3d/assets';

const BY_TOKEN: readonly (readonly [RegExp, AssetId])[] = [
  [/watch|timepiece|chrono/i, 'wristwatch'],
  [/phone|mobile|handset/i, 'smartphone'],
  [/parka|jacket|coat|outerwear/i, 'parka'],
];

export function modelForAsset(assetId: string): AssetId | null {
  for (const [pattern, id] of BY_TOKEN) if (pattern.test(assetId)) return id;
  return null;
}
