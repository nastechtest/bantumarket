<?php

declare(strict_types=1);

namespace NasTech\Listings;

use NasTech\SharedKernel\Money;

/**
 * An item offered for sale.
 *
 * The category and price are read here, not recomputed later: an order records
 * the category it was priced under, so moving a listing to another category after
 * a sale cannot re-price that sale's commission.
 */
final class Listing
{
    public const ACTIVE = 'ACTIVE';
    public const RESERVED = 'RESERVED';
    public const SOLD = 'SOLD';
    public const WITHDRAWN = 'WITHDRAWN';

    public function __construct(
        public readonly string $id,
        public readonly string $title,
        public readonly string $sellerId,
        public readonly string $category,
        public readonly Money $price,
        public readonly ?string $serialOrImei = null,
        public string $status = self::ACTIVE,
    ) {
        if (!$this->price->isPositive()) {
            throw new \InvalidArgumentException("Listing {$this->id} must have a positive price");
        }
    }

    /**
     * @return array<string,mixed>
     */
    public function toArray(): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'seller_id' => $this->sellerId,
            'category' => $this->category,
            'price_cents' => $this->price->cents,
            'currency' => $this->price->currency,
            'serial_or_imei' => $this->serialOrImei,
            'status' => $this->status,
        ];
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            title: (string) $row['title'],
            sellerId: (string) $row['seller_id'],
            category: (string) $row['category'],
            price: Money::fromCents((int) $row['price_cents'], (string) $row['currency']),
            serialOrImei: $row['serial_or_imei'] === null ? null : (string) $row['serial_or_imei'],
            status: (string) $row['status'],
        );
    }
}
