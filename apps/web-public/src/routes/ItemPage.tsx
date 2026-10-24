/**
 * Route shell. The page implementation lives in `features/item/` — this file exists because the
 * controller's route table lazily imports `routes/ItemPage.js`, and it must stay a one-line
 * re-export: every byte of the item page is first-paint budget, and the fence test in
 * features/item/fence.test.ts scans this file too. It imports nothing from the scene runtime —
 * not even `@nastech/ui-3d/fallback`, which the pre-wave-B draft did (the fallback components
 * belong to the inspect route; here the photographs are the product, not a fallback for it).
 */
export { default } from '../features/item/index.js';
