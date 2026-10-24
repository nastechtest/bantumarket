<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A reference to a media object, never its bytes and never a URL.
 *
 * Messaging has no edge to Media, and that is correct rather than an omission: an
 * attachment is an opaque id the client resolves through Media's own signed-read
 * path with its own audience. If this class stored a URL it would store a credential
 * with a TTL in a thread that is exported, searched in a dispute and read by audit.
 */
final class MessageAttachment
{
    public const PHOTO = 'PHOTO';
    public const VIDEO = 'VIDEO';
    public const DOCUMENT = 'DOCUMENT';

    /** @var list<string> */
    public const KINDS = [self::PHOTO, self::VIDEO, self::DOCUMENT];

    public const MAX_PER_MESSAGE = 4;

    public function __construct(
        public readonly string $mediaId,
        public readonly string $kind,
        public readonly int $position,
    ) {
        if (!preg_match('/^[A-Za-z0-9_\-]{1,64}$/', $mediaId)) {
            throw new MessageRefused('An attachment is a media id, not a path or a URL');
        }
        if (!in_array($kind, self::KINDS, true)) {
            throw new MessageRefused('Unknown attachment kind: ' . $kind);
        }
        if ($position < 0 || $position >= self::MAX_PER_MESSAGE) {
            throw new MessageRefused('Attachment positions are 0..3');
        }
    }

    /**
     * @param list<array{media_id: string, kind: string, position: int}> $attachments
     * @return list<self>
     */
    public static function listFromRaw(array $attachments): array
    {
        if (count($attachments) > self::MAX_PER_MESSAGE) {
            throw new MessageRefused('A message carries at most four attachments');
        }
        $built = [];
        $media = [];
        $positions = [];
        foreach ($attachments as $raw) {
            $attachment = new self(
                (string) ($raw['media_id'] ?? ''),
                (string) ($raw['kind'] ?? ''),
                (int) ($raw['position'] ?? -1),
            );
            if (isset($media[$attachment->mediaId])) {
                throw new MessageRefused('The same media id appears twice on one message');
            }
            if (isset($positions[$attachment->position])) {
                throw new MessageRefused('Two attachments claim the same position');
            }
            $media[$attachment->mediaId] = true;
            $positions[$attachment->position] = true;
            $built[] = $attachment;
        }
        usort($built, static fn (self $a, self $b): int => $a->position <=> $b->position);

        return $built;
    }

    /**
     * @return array<string,mixed>
     */
    public function toRow(string $messageId): array
    {
        return [
            'id' => \NasTech\SharedKernel\Id::generate('att')->value(),
            'message_id' => $messageId,
            'media_id' => $this->mediaId,
            'kind' => $this->kind,
            'position' => $this->position,
        ];
    }
}
