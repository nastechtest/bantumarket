<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * A page of messages, pulled by cursor. The cursor is the last sequence the client
 * has, not a page number: messages are appended while a reader is paging, and an
 * offset would skip or repeat a message every time someone typed.
 */
final class MessagePage
{
    /**
     * @param list<Message> $messages ascending by sequence
     */
    public function __construct(
        public readonly string $threadId,
        public readonly array $messages,
        public readonly ?int $nextSequence,
    ) {
    }

    /**
     * @return array<string,mixed>
     */
    public function toWire(): array
    {
        return [
            'thread_id' => $this->threadId,
            'messages' => array_map(static fn (Message $m): array => $m->toWire(), $this->messages),
            'next_cursor' => $this->nextSequence === null ? null : (string) $this->nextSequence,
        ];
    }
}
