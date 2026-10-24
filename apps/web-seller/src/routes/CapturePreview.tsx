import { stripBase, type RouteDef } from '../router.js';
import { pathParam } from '../lib/path-param.js';
import { CapturePreviewPage } from '../features/listings/capture-preview-page.js';

/** `/listings/:id/capture` — class `scene`. The review screen itself uses no scene runtime. */
export default function CapturePreview({ route }: { route: RouteDef }) {
  const pathname = typeof window === 'undefined' ? '' : stripBase(window.location.pathname);
  return <CapturePreviewPage listingId={pathParam(route.path, 'id', pathname)} />;
}
