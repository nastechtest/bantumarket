<?php

declare(strict_types=1);

namespace NasTech\Reporting\Export;

/**
 * Opaque, signed export cursor.
 *
 * Base64url alone is not a cursor — a client can edit the offset and skip rows,
 * and a CSV full of holes is worse than a refusal. The HMAC binds the cursor to
 * the report and snapshot it was issued for, so a cursor from another export is
 * rejected rather than silently paginating the wrong table.
 */
final class ExportCursor
{
    /**
     * @param array<string,mixed> $payload
     */
    private function __construct(
        public readonly string $report,
        public readonly string $snapshotId,
        public readonly int $offset,
        private readonly string $token,
    ) {
    }

    public static function issue(
        string $report,
        string $snapshotId,
        int $offset,
        string $secret,
    ): self {
        if ($offset < 0) {
            throw new \InvalidArgumentException('An export offset cannot be negative');
        }
        $payload = json_encode([
            'v' => 1,
            'r' => $report,
            's' => $snapshotId,
            'o' => $offset,
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
        $encoded = self::base64Url($payload);
        $mac = hash_hmac('sha256', $encoded, $secret);

        return new self($report, $snapshotId, $offset, $encoded . '.' . self::base64Url($mac));
    }

    public static function parse(string $token, string $secret): self
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            throw new InvalidExportCursor('Export cursor is not in the issued format');
        }
        [$encoded, $mac] = $parts;
        $expected = self::base64Url(hash_hmac('sha256', $encoded, $secret));
        if (!hash_equals($expected, $mac)) {
            throw new InvalidExportCursor('Export cursor signature does not verify');
        }
        $decoded = self::base64UrlDecode($encoded);
        $payload = json_decode($decoded, true);
        if (!is_array($payload) || ($payload['v'] ?? null) !== 1) {
            throw new InvalidExportCursor('Export cursor payload is not version 1');
        }
        $report = $payload['r'] ?? null;
        $snapshot = $payload['s'] ?? null;
        $offset = $payload['o'] ?? null;
        if (!is_string($report) || !is_string($snapshot) || !is_int($offset) || $offset < 0) {
            throw new InvalidExportCursor('Export cursor payload is incomplete');
        }

        return new self($report, $snapshot, $offset, $token);
    }

    public function token(): string
    {
        return $this->token;
    }

    private static function base64Url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $value): string
    {
        $padded = $value . str_repeat('=', (4 - strlen($value) % 4) % 4);
        $decoded = base64_decode(strtr($padded, '-_', '+/'), true);
        if ($decoded === false) {
            throw new InvalidExportCursor('Export cursor is not valid base64url');
        }

        return $decoded;
    }
}
