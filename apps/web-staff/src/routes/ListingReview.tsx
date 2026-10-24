import { useState } from 'react';
import { tokens } from '@nastech/design-tokens';
import type { RouteDef } from '../router.js';
import type { PolicyCheck } from '../features/operations/fixtures-market.js';
import { LISTING_REVIEW } from '../features/operations/fixtures-market.js';
import type { Column } from '../features/operations/ui.js';
import { Amount, DataTable, Intro, Reference, StatusTag, TwoColumn } from '../features/operations/ui.js';
import { formatInstant } from '../shell/time.js';
import {
  ActionButton,
  CheckRow,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Section,
  TextArea,
} from '../shell/ui.js';

const RESULT_TONE = {
  pass: 'positive',
  warn: 'caution',
  fail: 'negative',
} as const;

const CHECK_COLUMNS: readonly Column<PolicyCheck>[] = [
  { key: 'check', header: 'Check', render: (row) => row.label },
  { key: 'result', header: 'Result', render: (row) => <StatusTag tone={RESULT_TONE[row.result]}>{row.result}</StatusTag> },
  { key: 'detail', header: 'What the check found', render: (row) => row.detail },
];

/** Route '/listings/:id', class 'app'. A single listing with its evidence and decision. */
export default function ListingReview({ route }: { route: RouteDef }) {
  const listing = LISTING_REVIEW;
  const [reason, setReason] = useState('');
  const [evidenceReviewed, setEvidenceReviewed] = useState(false);
  const reasonReady = reason.trim().length >= 12;
  const canTakeDown = reasonReady && evidenceReviewed;

  return (
    <>
      <PageHeader
        title={route.label}
        kicker="Catalogue decision"
        actions={<StatusTag tone="caution">Pending review</StatusTag>}
      />
      <Intro>
        Read the listing, its evidence and the seller’s record before recording a decision. A takedown is a public
        action: it needs a reason that names the policy and the evidence, and it is stamped with your account.
      </Intro>

      <TwoColumn>
        <Panel title="Listing">
          <KeyValue
            items={[
              { term: 'Listing', detail: <Reference>{listing.id}</Reference> },
              { term: 'Title', detail: listing.title },
              { term: 'Category', detail: listing.category },
              { term: 'Condition', detail: listing.condition },
              { term: 'Price', detail: <Amount cents={listing.priceCents} /> },
              { term: 'Submitted', detail: formatInstant(listing.submittedAt) },
              { term: 'Verification', detail: listing.tier },
              { term: 'Location', detail: listing.location },
              { term: 'Photos', detail: `${listing.photoCount} original photographs` },
              { term: 'Model claim', detail: listing.modelClaim },
            ]}
          />
          <p style={{ margin: `${tokens.layout.stack} 0 0`, fontSize: '0.875rem', lineHeight: 1.55 }}>
            {listing.description}
          </p>
          <p style={{ margin: '0 0 2px', fontSize: '0.875rem' }}>
            <a href={`/listings/${listing.id}/capture`} style={{ color: tokens.action.default }}>
              Open capture QC for this listing
            </a>
          </p>
        </Panel>

        <Panel title="Seller record">
          <KeyValue
            items={[
              { term: 'Handle', detail: listing.sellerHandle },
              { term: 'Name', detail: listing.sellerName },
              { term: 'Sales', detail: String(listing.seller.sales) },
              { term: 'Rating', detail: listing.seller.rating },
              { term: 'Member since', detail: listing.seller.memberSince },
              { term: 'Previous reviews', detail: String(listing.seller.previousReviews) },
              { term: 'Takedowns', detail: String(listing.seller.takedowns) },
              { term: 'Dispute rate', detail: listing.seller.disputeRate },
            ]}
          />
        </Panel>
      </TwoColumn>

      <Section title="Policy checks">
        <DataTable
          caption="Automated policy checks run against this listing"
          columns={CHECK_COLUMNS}
          rows={listing.checks}
          rowKey={(row) => row.id}
        />
      </Section>

      <Section title="Decision">
        <Panel tone="caution">
          <p style={{ margin: 0 }}>
            Taking this listing down notifies the seller and removes it from search. The reason below is copied into the
            audit trail and into the seller notice.
          </p>
          <TextArea
            id="listing-takedown-reason"
            label="Reason for takedown"
            value={reason}
            onChange={setReason}
            rows={3}
            hint="At least 12 characters. Name the policy and the evidence you relied on."
          />
          <CheckRow
            id="listing-evidence-reviewed"
            label="I have reviewed the photographs, description and seller record."
            checked={evidenceReviewed}
            onChange={setEvidenceReviewed}
          />
          <ActionButton
            label="Take down listing"
            tone="danger"
            onClick={() => undefined}
            disabled={!canTakeDown}
            disabledReason={
              !evidenceReviewed
                ? 'Confirm that you reviewed the listing evidence first.'
                : !reasonReady
                  ? 'Give a reason of at least 12 characters before taking the listing down.'
                  : undefined
            }
          />
        </Panel>
        <Notice tone="info" title="What approval records">
          An approval records your account, the role that granted the decision and the time in UTC. It does not record a
          photograph, a payment credential or any seller bank detail.
        </Notice>
      </Section>
    </>
  );
}
