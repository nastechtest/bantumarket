/**
 * `three` replacement for the NO_3D build. Only the members this codebase actually touches are
 * exported; that is deliberate — the list is the audit of where geometry escapes the fence, and an
 * unlisted member fails the build rather than silently shipping a stub that lies.
 */
export class CylinderGeometry { constructor(_rt?: number, _rb?: number, _h?: number, _rs?: number, _hs?: number, _op?: boolean, _sg?: number, _mg?: number) {} dispose() {} }
export class TorusGeometry { constructor(_r?: number, _t?: number, _rs?: number, _ts?: number) {} dispose() {} }
export class Group {}
export class Vector3 { constructor(public x = 0, public y = 0, public z = 0) {} }
export class Color { constructor(_c?: unknown) {} }
export const REVISION = 'no3d';
