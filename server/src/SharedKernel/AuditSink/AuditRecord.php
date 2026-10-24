<?php

declare(strict_types=1);

namespace NasTech\SharedKernel\AuditSink;

/**
 * What a module is allowed to say to the audit log.
 *
 * This type lives in SharedKernel, not in Audit, for the reason the audit module
 * exists at all: a module that had to import Audit to record something would make
 * the audit optional, and the one write that matters — the attempted authority that
 * failed — is the write made under pressure. An interface everybody can name and
 * only Audit can implement inverts that dependency.
 *
 * `before`/`after` are bounded arrays, not free text: the audit console renders a
 * diff, and a diff of a paragraph is a paragraph. A module that needs to record a
 * large document records its id and digest instead.
 */
final class AuditRecord
{
    /** A before/after payload larger than this is refused, not truncated. */
    public const MAX_DIFF_BYTES = 8192;

    /**
     * @param array<string,mixed>|null $before
     * @param array<string,mixed>|null $after
     */
    public function __construct(
        public readonly string $action,
        public readonly string $targetType,
        public readonly string $targetId,
        public readonly string $actorId,
        public readonly string $actorRole,
        public readonly ?string $sessionId,
        public readonly ?string $capability,
        public readonly ?array $before,
        public readonly ?array $after,
        public readonly ?string $reason,
        public readonly string $requestId,
        public readonly ?string $subjectId,
    ) {
        if (!preg_match('/^[a-z][a-z0-9_.]{2,63}$/', $action)) {
            throw new \InvalidArgumentException('Audit action names are lower-case dotted verbs, e.g. sanction.apply');
        }
        if ($targetType === '' || $targetId === '') {
            throw new \InvalidArgumentException('An audit row names its target type and id');
        }
        if ($actorId === '' || $actorRole === '') {
            throw new \InvalidArgumentException('An audit row names its actor and the role it acted in');
        }
        if ($requestId === '') {
            throw new \InvalidArgumentException('An audit row carries the request id that caused it');
        }
        self::assertBounded($before);
        self::assertBounded($after);
    }

    /**
     * @param array<string,mixed>|null $diff
     */
    private static function assertBounded(?array $diff): void
    {
        if ($diff === null) {
            return;
        }
        $encoded = json_encode($diff, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($encoded === false) {
            throw new \InvalidArgumentException('An audit diff must be JSON-encodable');
        }
        if (strlen($encoded) > self::MAX_DIFF_BYTES) {
            throw new \InvalidArgumentException(sprintf(
                'An audit diff is limited to %d bytes; record the id and digest of a larger payload instead',
                self::MAX_DIFF_BYTES,
            ));
        }
    }
}
