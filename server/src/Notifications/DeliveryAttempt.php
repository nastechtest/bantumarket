<?php

declare(strict_types=1);

namespace NasTech\Notifications;

use NasTech\SharedKernel\Id;

/**
 * One recorded attempt to deliver a notification over one channel.
 *
 * The row is evidence, not a queue item: it is inserted after the attempt and
 * never updated. The unique key (notification_id, channel, attempt_no) is what
 * makes a retried worker run the same attempt rather than a second send.
 */
final class DeliveryAttempt
{
    private function __construct(
        public readonly string $id,
        public readonly string $notificationId,
        public readonly NotificationChannel $channel,
        public readonly int $attemptNo,
        public readonly DeliveryStatus $status,
        public readonly \DateTimeImmutable $attemptedAt,
    ) {
        self::opaque($this->id, 'attempt id');
        self::opaque($this->notificationId, 'notification id');
        if ($this->attemptNo < 1) {
            throw new NotificationRefused('A delivery attempt number starts at 1');
        }
    }

    public static function record(
        string $id,
        string $notificationId,
        NotificationChannel $channel,
        int $attemptNo,
        DeliveryStatus $status,
        \DateTimeImmutable $at,
    ): self {
        return new self($id, $notificationId, $channel, $attemptNo, $status, $at);
    }

    /**
     * @param array<string,mixed> $row
     */
    public static function fromRow(array $row): self
    {
        return new self(
            id: (string) $row['id'],
            notificationId: (string) $row['notification_id'],
            channel: NotificationChannel::parse((string) $row['channel']),
            attemptNo: (int) $row['attempt_no'],
            status: DeliveryStatus::parse((string) $row['status']),
            attemptedAt: new \DateTimeImmutable((string) $row['attempted_at']),
        );
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(): array
    {
        return [
            'id' => $this->id,
            'notification_id' => $this->notificationId,
            'channel' => $this->channel->value,
            'attempt_no' => $this->attemptNo,
            'status' => $this->status->value,
            'attempted_at' => $this->attemptedAt->format(\DateTimeInterface::ATOM),
        ];
    }

    private static function opaque(string $value, string $field): void
    {
        try {
            Id::fromString($value);
        } catch (\InvalidArgumentException) {
            throw new NotificationRefused(sprintf(
                'A %s must be an opaque reference of 1–64 url-safe characters',
                $field,
            ));
        }
    }
}
