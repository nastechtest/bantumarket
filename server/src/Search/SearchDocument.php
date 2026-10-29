<?php

declare(strict_types=1);

namespace NasTech\Search;

/**
 * One listing as the index holds it: a projection, never a source of truth.
 *
 * The column list is closed on purpose. It is the public shape of a result
 * tile — title, taxonomy path, price, condition, media presence, seller tier —
 * plus the source version the row was built from. It is not a listing row with
 * fields omitted; it is a different object whose constructor cannot accept a
 * seller name, a phone number, an address or a location. A projection that can
 * carry those fields will eventually carry them.
 *
 * `sourceVersion` is the listing's version at projection time. Two consequences
 * follow directly:
 *   - a row whose version is behind the source is stale, and `staleAgainst()`
 *     reports it;
 *   - re-indexing the same (listing, version, content) is a no-op, so a rebuild
 *     is idempotent rather than a rewrite of identical rows.
 */
final class SearchDocument
{
    /**
     * The only keys a producer may hand to `fromSource()`. Anything else is
     * refused; the index does not "store what it can" and drop the rest.
     *
     * @var list<string>
     */
    public const ALLOWED_SOURCE_FIELDS = [
        'listing_id',
        'title',
        'category_path',
        'price_cents',
        'condition',
        'seller_tier',
        'has_photo',
        'has_3d',
        'has_video',
        'active',
        'published_at',
        'source_version',
    ];

    /**
     * Field names that name a person or a way to reach one. Refused by name
     * before any value is read; the test suite also proves no such column
     * exists in the migration or the result view.
     *
     * @var list<string>
     */
    public const PERSONAL_FIELDS = [
        'seller_id',
        'seller_name',
        'seller_phone',
        'seller_email',
        'buyer_id',
        'buyer_name',
        'name',
        'full_name',
        'phone',
        'phone_number',
        'email',
        'address',
        'street_address',
        'location',
        'exact_location',
        'suburb',
        'city',
        'province',
        'postal_code',
        'latitude',
        'longitude',
        'lat',
        'lng',
        'coordinates',
        'geo',
        'contact_name',
    ];

    public const CATEGORY_PATH_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*)*$';

    public const MAX_TITLE_LENGTH = 200;

    private function __construct(
        public readonly string $listingId,
        public readonly string $title,
        public readonly string $categoryPath,
        public readonly int $priceCents,
        public readonly Condition $condition,
        public readonly SellerTier $sellerTier,
        public readonly bool $hasPhoto,
        public readonly bool $has3d,
        public readonly bool $hasVideo,
        public readonly bool $active,
        public readonly \DateTimeImmutable $publishedAt,
        public readonly int $sourceVersion,
    ) {
    }

    /**
     * The projection boundary. Called by the adapter that reads listing state
     * (or the rebuild job); not by the query path.
     *
     * @param array<string,mixed> $source
     */
    public static function fromSource(array $source): self
    {
        foreach ($source as $key => $_) {
            if (!is_string($key)) {
                throw new SearchProjectionRefused('Search projection keys must be strings');
            }

            $lower = strtolower($key);
            if (in_array($lower, self::PERSONAL_FIELDS, true)) {
                throw new PersonalDataRefused(sprintf(
                    'Search refuses to index personal field "%s". The index stores item facts only; '
                    . 'contact and location data belongs to Identity and the order, not to a public result page.',
                    $key,
                ));
            }
            if (!in_array($key, self::ALLOWED_SOURCE_FIELDS, true)) {
                throw new SearchProjectionRefused(sprintf(
                    'Search does not index "%s". Allowed projection fields: %s.',
                    $key,
                    implode(', ', self::ALLOWED_SOURCE_FIELDS),
                ));
            }
        }

        foreach (self::ALLOWED_SOURCE_FIELDS as $field) {
            if (!array_key_exists($field, $source)) {
                throw new SearchProjectionRefused(sprintf(
                    'Search projection is missing "%s"; the index does not invent a listing field.',
                    $field,
                ));
            }
        }

        $listingId = self::stringField($source, 'listing_id');
        if (preg_match('/^[A-Za-z0-9_-]{1,64}$/', $listingId) !== 1) {
            throw new SearchProjectionRefused("Search listing id is not an opaque id: {$listingId}");
        }

        $title = self::stringField($source, 'title');
        $title = trim($title);
        if ($title === '' || strlen($title) > self::MAX_TITLE_LENGTH) {
            throw new SearchProjectionRefused(sprintf(
                'Listing %s has no usable title; it must be 1–%d characters.',
                $listingId,
                self::MAX_TITLE_LENGTH,
            ));
        }
        self::refuseContactDetails($listingId, $title);

        $categoryPath = self::stringField($source, 'category_path');
        if (preg_match('~' . self::CATEGORY_PATH_PATTERN . '~', $categoryPath) !== 1) {
            throw new SearchProjectionRefused(sprintf(
                'Listing %s has category path "%s"; expected lowercase slug segments separated by "/".',
                $listingId,
                $categoryPath,
            ));
        }

        $priceCents = self::intField($source, 'price_cents');
        if ($priceCents < 0) {
            throw new SearchProjectionRefused("Listing {$listingId} has a negative price");
        }

        $condition = Condition::tryFrom(self::stringField($source, 'condition'))
            ?? throw new SearchProjectionRefused(sprintf(
                'Listing %s has condition "%s"; known conditions: %s.',
                $listingId,
                (string) $source['condition'],
                implode(', ', Condition::values()),
            ));

        $sellerTier = SellerTier::tryFrom(self::stringField($source, 'seller_tier'))
            ?? throw new SearchProjectionRefused(sprintf(
                'Listing %s has seller tier "%s"; known tiers: %s.',
                $listingId,
                (string) $source['seller_tier'],
                implode(', ', SellerTier::values()),
            ));

        $sourceVersion = self::intField($source, 'source_version');
        if ($sourceVersion < 1) {
            throw new SearchProjectionRefused(
                "Listing {$listingId} has source version {$sourceVersion}; a version starts at 1.",
            );
        }

        return new self(
            listingId: $listingId,
            title: $title,
            categoryPath: $categoryPath,
            priceCents: $priceCents,
            condition: $condition,
            sellerTier: $sellerTier,
            hasPhoto: self::boolField($source, 'has_photo'),
            has3d: self::boolField($source, 'has_3d'),
            hasVideo: self::boolField($source, 'has_video'),
            active: self::boolField($source, 'active'),
            publishedAt: self::timestampField($source, 'published_at'),
            sourceVersion: $sourceVersion,
        );
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            listingId: (string) $row['id'],
            title: (string) $row['title'],
            categoryPath: (string) $row['category_path'],
            priceCents: (int) $row['price_cents'],
            condition: Condition::from((string) $row['condition']),
            sellerTier: SellerTier::from((string) $row['seller_tier']),
            hasPhoto: (bool) $row['has_photo'],
            has3d: (bool) $row['has_3d'],
            hasVideo: (bool) $row['has_video'],
            active: (bool) $row['active'],
            publishedAt: new \DateTimeImmutable((string) $row['published_at']),
            sourceVersion: (int) $row['source_version'],
        );
    }

    /**
     * The row as stored. `id` is the listing id; there is no second listing_id
     * column that could disagree with the primary key.
     *
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->listingId,
            'title' => $this->title,
            'category_path' => $this->categoryPath,
            'price_cents' => $this->priceCents,
            'condition' => $this->condition->value,
            'seller_tier' => $this->sellerTier->value,
            'has_photo' => $this->hasPhoto,
            'has_3d' => $this->has3d,
            'has_video' => $this->hasVideo,
            'active' => $this->active,
            'published_at' => $this->publishedAt->format(\DateTimeInterface::ATOM),
            'source_version' => $this->sourceVersion,
        ];
    }

    /**
     * Whether two documents describe the same projection at the same version.
     * `indexed_at` is deliberately absent: it is bookkeeping, not content.
     */
    public function contentEquals(self $other): bool
    {
        return $this->toRow() === $other->toRow();
    }

    /**
     * @param array<string,mixed> $source
     */
    private static function stringField(array $source, string $field): string
    {
        $value = $source[$field] ?? null;
        if (!is_string($value)) {
            throw new SearchProjectionRefused(sprintf('Search projection field "%s" must be a string', $field));
        }

        return $value;
    }

    /**
     * @param array<string,mixed> $source
     */
    private static function intField(array $source, string $field): int
    {
        $value = $source[$field] ?? null;
        if (!is_int($value)) {
            throw new SearchProjectionRefused(sprintf(
                'Search projection field "%s" must be an integer; got %s',
                $field,
                get_debug_type($value),
            ));
        }

        return $value;
    }

    /**
     * @param array<string,mixed> $source
     */
    private static function boolField(array $source, string $field): bool
    {
        $value = $source[$field] ?? null;
        if (!is_bool($value)) {
            throw new SearchProjectionRefused(sprintf(
                'Search projection field "%s" must be true or false; got %s. '
                . 'A truthy string is how "false" becomes a filter that matches.',
                $field,
                get_debug_type($value),
            ));
        }

        return $value;
    }

    /**
     * @param array<string,mixed> $source
     */
    private static function timestampField(array $source, string $field): \DateTimeImmutable
    {
        $value = self::stringField($source, $field);

        try {
            return new \DateTimeImmutable($value);
        } catch (\Exception) {
            throw new SearchProjectionRefused(sprintf(
                'Search projection field "%s" is not an ISO-8601 timestamp: %s',
                $field,
                $value,
            ));
        }
    }

    /**
     * A title is seller-authored, so the field whitelist alone is not enough:
     * "call me on 082 ..." would walk a phone number into the index through an
     * allowed column. The scan is deliberately small and refuses at the
     * projection boundary, before a row exists to search.
     */
    private static function refuseContactDetails(string $listingId, string $title): void
    {
        if (preg_match('/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/', $title) === 1) {
            throw new PersonalDataRefused(
                "Listing {$listingId} is not indexed: its title carries an email address. "
                . 'Search stores item facts, not ways to contact a person.',
            );
        }

        if (preg_match('/(?:\+?\d[\s.\-]?){9,}\d/', $title) === 1) {
            throw new PersonalDataRefused(
                "Listing {$listingId} is not indexed: its title carries a phone number. "
                . 'Search stores item facts, not ways to contact a person.',
            );
        }
    }
}
