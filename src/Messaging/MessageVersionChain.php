<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Folds an append-only sequence of message versions into the current transcript.
 *
 * The latest version of a message is the highest-sequence row in its supersession
 * chain. Lines are ordered by the sequence of the *first* version, so editing a
 * message does not move it to the bottom of the conversation — the reader saw it
 * where it was, and a transcript that reorders itself under an edit is a transcript
 * nobody can quote in a dispute.
 */
final class MessageVersionChain
{
    /**
     * @param list<Message> $rows every version, in any order
     * @return list<array{message: Message, first_sequence: int}>
     */
    public static function fold(array $rows): array
    {
        usort($rows, static fn (Message $a, Message $b): int => $a->sequence <=> $b->sequence);

        /** @var array<string, Message> $latestByRoot */
        $latestByRoot = [];
        /** @var array<string, string> $idToRoot */
        $idToRoot = [];
        /** @var array<string, int> $firstSequenceOfRoot */
        $firstSequenceOfRoot = [];

        foreach ($rows as $row) {
            $root = $row->supersedesId === null
                ? $row->id
                : ($idToRoot[$row->supersedesId] ?? $row->supersedesId);
            $idToRoot[$row->id] = $root;
            if (!isset($firstSequenceOfRoot[$root])) {
                $firstSequenceOfRoot[$root] = $row->sequence;
            }
            $latestByRoot[$root] = $row;
        }

        $folded = [];
        foreach ($latestByRoot as $root => $message) {
            $folded[] = [
                'message' => $message,
                'first_sequence' => $firstSequenceOfRoot[$root],
            ];
        }
        usort($folded, static fn (array $a, array $b): int =>
            $a['first_sequence'] <=> $b['first_sequence']
            ?: strcmp($a['message']->id, $b['message']->id));

        return $folded;
    }

    /**
     * @param list<Message> $rows
     * @return list<Message>
     */
    public static function latest(array $rows): array
    {
        return array_map(static fn (array $entry): Message => $entry['message'], self::fold($rows));
    }

    /**
     * The full export: every version, tombstoned versions included and labelled.
     *
     * @param list<Message> $rows
     * @return list<array<string,mixed>>
     */
    public static function export(array $rows): array
    {
        usort($rows, static fn (Message $a, Message $b): int => $a->sequence <=> $b->sequence);

        return array_map(static function (Message $message): array {
            $wire = $message->toWire();
            $wire['exported_state'] = $message->isDeleted() ? 'DELETED' : 'PRESENT';

            return $wire;
        }, $rows);
    }
}
