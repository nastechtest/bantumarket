<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * One pattern match, with the rule that matched and the risk band it carries.
 *
 * `match` is the matched text, kept so a reviewer can see why a rule fired. It is
 * deliberately NOT part of any outbox payload: putting the phone number this class
 * detected into the event that Safety consumes would move the contact detail into a
 * second store and into whatever logs the consumer. The event carries rule_id only.
 */
final class SafetyFinding
{
    public function __construct(
        public readonly SafetyCategory $category,
        public readonly string $ruleId,
        public readonly SafetyRisk $risk,
        public readonly string $match,
    ) {
        if ($ruleId === '' || !preg_match('/^[a-z][a-z0-9_]{2,63}$/', $ruleId)) {
            throw new \InvalidArgumentException('A finding names its rule in snake_case');
        }
    }

    public function confidence(): SafetyConfidence
    {
        return SafetyConfidence::PATTERN;
    }

    /**
     * The event-safe projection. No matched text, no message body.
     *
     * @return array{category: string, rule_id: string, risk: string, confidence: string}
     */
    public function toEventPayload(): array
    {
        return [
            'category' => $this->category->value,
            'rule_id' => $this->ruleId,
            'risk' => $this->risk->value,
            'confidence' => $this->confidence()->value,
        ];
    }

    /**
     * The stored projection; the matched text is retained as evidence for a human
     * reviewer and never leaves this table through an event.
     *
     * @return array<string,mixed>
     */
    public function toRow(string $threadId, string $messageId, \DateTimeImmutable $at): array
    {
        return [
            'id' => \NasTech\SharedKernel\Id::generate('flg')->value(),
            'thread_id' => $threadId,
            'message_id' => $messageId,
            'category' => $this->category->value,
            'rule_id' => $this->ruleId,
            'risk' => $this->risk->value,
            'confidence' => $this->confidence()->value,
            'matched_text' => $this->match,
            'detected_at' => $at->format(\DateTimeInterface::ATOM),
        ];
    }
}
