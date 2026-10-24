<?php

declare(strict_types=1);

namespace NasTech\Messaging;

/**
 * Pattern detection over a message body. A pipeline of rules, never a verdict.
 *
 * Three properties are deliberate and each has a test:
 *
 *  1. Every rule is data — category, risk, description, regex — so adding a scam
 *     phrase is a reviewable line, not a code branch.
 *  2. The output is `confidence: pattern` and nothing else. The module cannot say
 *     a human was defrauded, only that a string matched a rule.
 *  3. Severity is split, because the brief's false positive is real: a watch shop's
 *     landline is a CONTACT_DETAILS finding at INFORMATIONAL risk and does not raise
 *     a safety event, while a mobile number or "let's talk on WhatsApp" is ELEVATED.
 *     Collapsing the two would make the safety queue ignore both.
 *
 * No mbstring: all patterns are ASCII classes over UTF-8 bytes, which is safe for
 * the words involved (the regexes are case-insensitive ASCII).
 */
final class ContactSafetyScanner
{
    /**
     * rule_id => [category, risk, pattern, why the rule exists]
     *
     * Ordered by rule id in scan() so two runs over one body always produce the
     * same list; the event payload is compared byte-for-byte in tests.
     *
     * @var array<string, array{category: SafetyCategory, risk: SafetyRisk, pattern: string, note: string}>
     */
    private const RULES = [
        'email_address' => [
            'category' => SafetyCategory::CONTACT_DETAILS,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/',
            'note' => 'An email moves the conversation off the platform and out of the evidence trail.',
        ],
        'off_platform_courier' => [
            'category' => SafetyCategory::OFF_PLATFORM_MIGRATION,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/\b(courier|delivery\s+label|my\s+friend\s+will\s+collect|send\s+someone\s+to\s+collect)\b/i',
            'note' => 'The fake-courier-label pattern: a third party collects, the platform never sees the handover.',
        ],
        'off_platform_meeting' => [
            'category' => SafetyCategory::OFF_PLATFORM_MIGRATION,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/\b(off\s+the\s+app|outside\s+the\s+app|not\s+on\s+the\s+platform|meet\s+me\s+outside)\b/i',
            'note' => 'Explicitly proposes leaving the recorded process.',
        ],
        'off_platform_messenger' => [
            'category' => SafetyCategory::OFF_PLATFORM_MIGRATION,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/\b(whats\s?app|telegram|signal|snapchat|instagram\s+dm|facebook\s+marketplace)\b/i',
            'note' => 'Names a channel the platform cannot read or export.',
        ],
        'payment_direct' => [
            'category' => SafetyCategory::PAYMENT_INSTRUCTION,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/\b(eft|bank\s+transfer|capitec|fnb|absa|nedbank|standard\s+bank|snapscan|pay\s+me\s+directly|cash\s+only)\b/i',
            'note' => 'Asks for money outside escrow; the platform cannot reverse what it never held.',
        ],
        'payment_proof_screenshot' => [
            'category' => SafetyCategory::PAYMENT_INSTRUCTION,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/\b(payment\s+proof|proof\s+of\s+payment|screenshot\s+of\s+the\s+transfer)\b/i',
            'note' => 'The reverse-scam pattern: a screenshot is offered as if it were a payment.',
        ],
        'phone_landline_sa' => [
            'category' => SafetyCategory::CONTACT_DETAILS,
            'risk' => SafetyRisk::INFORMATIONAL,
            'pattern' => '/(?:\+27|0)\s?[1-5][0-9](?:[\s\-]?[0-9]){7}/',
            'note' => 'A shop or venue landline is a legitimate contact detail; informational, no safety event.',
        ],
        'phone_mobile_sa' => [
            'category' => SafetyCategory::CONTACT_DETAILS,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/(?:\+27|0)\s?[6-8][0-9](?:[\s\-]?[0-9]){7}/',
            'note' => 'A mobile number is a private channel; the most common off-platform migration.',
        ],
        'web_url' => [
            'category' => SafetyCategory::CONTACT_DETAILS,
            'risk' => SafetyRisk::ELEVATED,
            'pattern' => '/(?:https?:\/\/|www\.)[^\s]+/i',
            'note' => 'A link can host a fake payment page or the same listing cheaper elsewhere.',
        ],
    ];

    /**
     * @return list<SafetyFinding>
     */
    public function scan(string $body): array
    {
        $findings = [];
        $rules = self::RULES;
        ksort($rules);

        foreach ($rules as $ruleId => $rule) {
            if (preg_match($rule['pattern'], $body, $matches) !== 1) {
                continue;
            }
            $findings[] = new SafetyFinding(
                $rule['category'],
                $ruleId,
                $rule['risk'],
                $matches[0],
            );
        }

        return $findings;
    }

    /**
     * Whether the findings justify telling Safety about this message. Only an
     * ELEVATED finding does: a venue landline is still scanned and stored, but it
     * does not put two accounts in front of a reviewer.
     *
     * @param list<SafetyFinding> $findings
     */
    public static function shouldRaiseEvent(array $findings): bool
    {
        foreach ($findings as $finding) {
            if ($finding->risk === SafetyRisk::ELEVATED) {
                return true;
            }
        }

        return false;
    }

    /**
     * The rule ids, for tests and for the README table. Data about the pipeline,
     * not a second description of it.
     *
     * @return list<string>
     */
    public static function ruleIds(): array
    {
        $ids = array_keys(self::RULES);
        sort($ids);

        return $ids;
    }
}
