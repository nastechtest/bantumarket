<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Messages are append-only, so an edit and a delete are rows, not mutations.
 *
 * MESSAGE is the first version, EDIT is a later version that supersedes an earlier
 * row, TOMBSTONE is the version that says the content was deleted. The old row is
 * kept in every case: a thread is evidence of what was said even when the author
 * exercised a right to have the text removed from the current view.
 */
enum MessageKind: string
{
    case MESSAGE = 'MESSAGE';
    case EDIT = 'EDIT';
    case TOMBSTONE = 'TOMBSTONE';

    public function hasBody(): bool
    {
        return $this !== self::TOMBSTONE;
    }

    /** @return list<string> */
    public static function values(): array
    {
        return array_map(static fn (self $kind): string => $kind->value, self::cases());
    }
}
