/**
 * @nastech/api-client — browser client for the NasTech Market backend.
 *
 * Build the API surfaces around an injected `Transport` (transport.ts). In production that is
 * `fetchTransport({ baseUrl })`; in tests it is a deterministic fake; later it can be an
 * auth-refreshing wrapper. Nothing here implies a live endpoint: the PHP backend has no HTTP
 * layer yet (ADR 0002), so all paths and status mappings in this package are asserted, and the
 * one authority for state names and transitions is `nastech-market-php/src/Orders/Order.php` —
 * mirrored in orders.ts, not invented.
 */

export type {
  HttpMethod,
  Transport,
  TransportRequest,
  FetchTransportOptions,
  RetryOptions,
} from './transport.js';
export {
  DEFAULT_TIMEOUT_MS,
  fetchTransport,
  execute,
  executeWithRetry,
  hasIdempotencyKey,
} from './transport.js';

export type { ApiErrorKind, ApiErrorInit } from './errors.js';
export {
  ApiError,
  isApiError,
  errorKindFromStatus,
  apiErrorFromStatus,
  parseRetryAfter,
} from './errors.js';

export type { MediaApi, MediaApiOptions, SignedUrl } from './media.js';
export { createMediaApi, MAX_SIGNED_URL_CACHE_MS } from './media.js';

export type {
  SearchParams,
  SearchOutcome,
  SearchFacet,
  SearchFacetValue,
} from './catalogue.js';
export { searchCatalogue, getListingSummary } from './catalogue.js';

export type {
  OrderStatus,
  OrderEvent,
  OrderView,
  HandoverConfirmation,
  CreateOrderInput,
  OrdersApi,
  OrdersApiOptions,
} from './orders.js';
export {
  ORDER_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  MONEY_BEARING_ORDER_EVENTS,
  nextOrderStatus,
  canApplyOrderEvent,
  isTerminalOrderStatus,
  createOrdersApi,
} from './orders.js';

export type { IntentId } from './idempotency.js';
export { IdempotencyKeys, generateIdempotencyKey, orderIntent } from './idempotency.js';
