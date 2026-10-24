import { materialPresets, physicalMaterialProps } from '@nastech/ui-3d/tokens';
import type { MaterialKind } from '@nastech/ui-3d/tokens';

/**
 * Material props for the authored placeholder, assembled entirely from the scene tokens.
 *
 * `@nastech/ui-3d/tokens` is a static, GL-free edge, so these numbers are readable here without
 * pulling the runtime; they are the exact fields `MeshPhysicalMaterial` responds to under the studio
 * rig. There is no `polished`/`brand-new` preset on purpose (brief-05): the placeholder must not be
 * able to make a worn case look new, because a render is not evidence and the written disclosure is
 * the record. Nothing here holds a colour literal — `resolvePresetColor` does, inside the package.
 */

export type MaterialProps = ReturnType<typeof physicalMaterialProps>;

export function materialPropsFor(kind: MaterialKind): MaterialProps {
  return physicalMaterialProps(materialPresets[kind]);
}

export const steel = (): MaterialProps => materialPropsFor('steel');
export const crystal = (): MaterialProps => materialPropsFor('crystal');
export const ceramic = (): MaterialProps => materialPropsFor('ceramic');
export const leather = (): MaterialProps => materialPropsFor('leather');
