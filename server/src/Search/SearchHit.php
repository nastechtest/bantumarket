<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * One result tile: the projection row plus its explanation.
 *
 * The document is exposed as fields, not as a listing aggregate, so a presenter
 * cannot reach through it into seller or order data. `toArray()` is the tile
 * contract and deliberately carries no contact or location field.
 */
final class SearchHit
{
    public function __construct(
        public readonly SearchDocument $document,
        public readonly SearchExplanation $explanation,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'listing_id' => $this->document->listingId,
            'title' => $this->document->title,
            'category_path' => $this->document->categoryPath,
            'price_cents' => $this->document->priceCents,
            'condition' => $this->document->condition->value,
            'seller_tier' => $this->document->sellerTier->value,
            'has_photo' => $this->document->hasPhoto,
            'has_3d' => $this->document->has3d,
            'has_video' => $this->document->hasVideo,
            'published_at' => $this->document->publishedAt->format(\DateTimeInterface::ATOM),
            'source_version' => $this->document->sourceVersion,
            'score' => $this->explanation->score,
            'matched_terms' => $this->explanation->matchedTerms,
            'matched_filters' => $this->explanation->matchedFilters,
        ];
    }
}
