import { stripBase, type RouteDef } from '../router.js';
import { pathParam } from '../lib/path-param.js';
import { SaleDetailPage } from '../features/sales/sale-detail-page.js';

/** `/orders/:id` — class `app`. */
export default function SaleDetail({ route }: { route: RouteDef }) {
  const pathname = typeof window === 'undefined' ? '' : stripBase(window.location.pathname);
  return <SaleDetailPage saleId={pathParam(route.path, 'id', pathname)} />;
}
