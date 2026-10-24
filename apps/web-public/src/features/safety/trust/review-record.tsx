import { useEffect, useState } from 'react';
import { TIER_LABELS } from '@nastech/api-contracts';
import { raw, tokens } from '@nastech/design-tokens';
import type { ReviewRecord as ReviewRecordData, SafetyTransport } from '../api/safety-transport.js';

/**
 * The paper trail behind a tier phrase: who did what, when, and — in this component's required
 * second line — what that action did not cover. A record without the `notCovered` line is the
 * exact shape §13.2 bans, so it renders whether or not the fixture bothers to be flattering.
 */

export function ReviewRecordPanel({ record }: { record: ReviewRecordData }) {
  return (
    <section
      className="safety-review-record"
      style={{ fontFamily: raw.type.familyText, color: tokens.text.primary, maxWidth: '62ch' }}
    >
      <h3 style={{ margin: `0 0 ${raw.space.s2}`, fontSize: '1.05rem' }}>
        Review record — listing {record.listingId}
      </h3>
      <p style={{ margin: `0 0 ${raw.space.s3}`, color: tokens.text.secondary, fontSize: '0.9rem' }}>
        Current seller-facing phrase: “{TIER_LABELS[record.sellerTier]}”. Below is everything that
        phrase was bought with.
      </p>
      <ol style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
        {record.entries.map((entry) => (
          <li
            key={`${entry.tier}-${entry.at}`}
            data-tier={entry.tier}
            style={{ marginBottom: raw.space.s4, fontSize: '0.92rem' }}
          >
            <p style={{ margin: 0, fontWeight: 600 }}>
              {TIER_LABELS[entry.tier]} · {entry.performedByRole}
            </p>
            <p style={{ margin: `${raw.space.s1} 0 0` }}>{entry.action}</p>
            <p style={{ margin: `${raw.space.s1} 0 0`, color: tokens.text.secondary }}>
              Did not cover: {entry.notCovered}
            </p>
            <p style={{ margin: `${raw.space.s1} 0 0`, fontSize: '0.8rem', color: tokens.text.disabled }}>
              {new Date(entry.at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Fetching wrapper for wired pages. Renders the record-only content it can without data — never a
 * spinner that replaces substance — so a slow network costs nothing to a nervous reader.
 */
export function ReviewRecord({
  transport,
  listingId,
}: {
  transport: SafetyTransport;
  listingId: string;
}) {
  const [record, setRecord] = useState<ReviewRecordData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    transport
      .fetchReviewRecord(listingId)
      .then((r) => {
        if (live) setRecord(r);
      })
      .catch(() => {
        if (live) setError('The review record for this listing could not be loaded.');
      });
    return () => {
      live = false;
    };
  }, [transport, listingId]);

  if (error) {
    return <p className="safety-review-record-error" style={{ color: raw.color.signalNegative }}>{error}</p>;
  }
  if (!record) {
    return (
      <p className="safety-review-record-loading" style={{ color: tokens.text.secondary }}>
        Loading the review record…
      </p>
    );
  }
  return <ReviewRecordPanel record={record} />;
}
