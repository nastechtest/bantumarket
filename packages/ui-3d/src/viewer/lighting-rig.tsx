import { lightingTokens } from '@nastech/ui-3d/tokens';
import { ContactShadows } from '@react-three/drei';

/**
 * Studio lighting rig (07 §4.1 `viewer/`).
 *
 * Three lights plus a contact shadow, all read from `lightingTokens` — deliberately NO HDR
 * environment map: it is a 3 MB asset and the plan forbids it as the single largest avoidable
 * byte in a product-render pipeline. The rim light has no token position (tokens carry intensity
 * and colour only); the local constant below is flagged in the report for the tokens owner to
 * adopt, replace, or overrule.
 */

export interface LightSpec {
  readonly type: 'directional' | 'ambient';
  readonly intensity: number;
  readonly color: string;
  readonly position?: readonly [number, number, number];
}

const RIM_POSITION: readonly [number, number, number] = [-0.36, 0.18, -0.3];
const BOUNCE_INTENSITY = 0.18;

/** Pure so the token mapping is testable without a GL context or a reconciler. */
export function lightRigSpec(): readonly LightSpec[] {
  return [
    {
      type: 'directional',
      intensity: lightingTokens.keyIntensity,
      color: lightingTokens.keyColor,
      position: lightingTokens.keyPosition,
    },
    {
      type: 'directional',
      intensity: lightingTokens.fillIntensity,
      color: lightingTokens.fillColor,
      position: [0.18, 0.1, 0.42],
    },
    {
      type: 'directional',
      intensity: lightingTokens.rimIntensity,
      color: lightingTokens.keyColor,
      position: RIM_POSITION,
    },
    // Ambient is a token-less floor: with nothing here, unlit faces render pure black and a
    // watch case reads as a silhouette on dim phone screens.
    { type: 'ambient', intensity: BOUNCE_INTENSITY, color: lightingTokens.fillColor },
  ];
}

export function LightingRig() {
  const specs = lightRigSpec();
  const shadows = lightingTokens.shadow;
  return (
    <>
      {specs.map((spec, index) =>
        spec.type === 'ambient' ? (
          <ambientLight key={`ambient-${index}`} intensity={spec.intensity} color={spec.color} />
        ) : (
          <directionalLight
            key={`directional-${index}`}
            intensity={spec.intensity}
            color={spec.color}
            {...(spec.position ? { position: [...spec.position] } : {})}
          />
        ),
      )}
      {shadows.enabled ? (
        <ContactShadows
          position={[0, 0, 0]}
          blur={shadows.blurRadius}
          opacity={shadows.opacity}
          far={0.4}
          resolution={512}
        />
      ) : null}
    </>
  );
}
