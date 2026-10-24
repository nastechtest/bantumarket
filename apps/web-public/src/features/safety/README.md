# safety — trust, reporting and meeting strangers

The feature that decides whether two people in different suburbs trust each other enough to hand
over a watch and R4,200 in a parking lot. It contains the platform's whole honest vocabulary:

- `safety-hub.tsx` — front door. Every section reachable, no account, no fast JS.
- `how-it-works.tsx` — the real ledger states (`AWAITING_PAYMENT → … → COMPLETED`, plus the refund
  pair), and a section listing what no state ever does.
- `meet-safely.tsx` — named Cape Town spots (police-station parking, mall security frontages), the
  rules that outrank any address, and an explicit "the platform is absent at this meeting".
- `scam-patterns.tsx` — the four patterns this market actually eats people with: over-payment /
  reverse scam, the payment-proof screenshot, the move to WhatsApp before handover, the printed
  courier label. Scene → why it works → tells → defence, each routed to a real report reason.
- `report-flow/` — subject picker (pre-filled from `flag-context.ts`, visible, changeable), reason
  list, evidence ranked by what the queue can read itself, the `what-happens-next` honesty gate,
  `submit.ts` validation, `use-report.ts` reducer. A report goes to a human queue with a response
  **target**; the person reported sees the reason and attachments; no screen promises an outcome.
- `blocking/` — mute is real suppression on the buyer's surface (listings hidden, their messages
  refused at delivery — the sender sees a notice) and the list says exactly that, in both directions.
- `trust/` — the five tier phrases come only from `TIER_LABELS` in `@nastech/api-contracts`.
  `what-tier-is-not.tsx` is the point of the directory.
- `policy/` — fees (10 %, charged at COMPLETED, and what it does *not* buy), prohibited items with
  the statutes behind each line, the POPIA note a safety feature deserves, and the 18 floor.
- `api/` — `safety-transport.ts` is the boundary (CONTRACT-GAP: no reports/mutes endpoints server-side
  yet; assumed endpoints are listed in its header). `fixtures.ts` implements it in memory.

## The review-blocking rule, made mechanical

Spec §13.2 bans any badge, glow or animation implying a check the platform did not perform.
`no-verified-affordance.test.tsx` enforces it in three layers: rendered-markup scan, attribute-value
scan (no class/style/aria-label dressed as an assurance affordance), and a comment-stripped source
scan of every `.ts`/`.tsx` in this tree that also fails any file duplicating a tier label string
instead of importing `TIER_LABELS`.

The banned words themselves are assembled in pieces in `api/safety-transport.ts`
(`FORBIDDEN_TRUST_WORDS`) so that defining the ban cannot trip the scan. `what-tier-is-not.tsx`
renders its rule sentence from those same constants. Do not "tidy" either into plain prose.

## Routes the controller needs to add

`/safety`, `/safety/how-it-works`, `/safety/meet-safely`, `/safety/scam-patterns`, `/safety/report`,
`/safety/trust`, `/safety/blocking`, `/safety/policy/fees`, `/safety/policy/prohibited`,
`/safety/policy/popia`, `/safety/policy/children` — all `first-paint` class. `index.ts` exports the
`SAFETY_SECTIONS` table and a default `SafetyPage({ route })`.

Tests run with `bun test apps/web-public/src/features/safety`.
