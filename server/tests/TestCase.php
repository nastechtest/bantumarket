<?php

declare(strict_types=1);

namespace NasTech\Tests;

/**
 * Minimal xUnit base.
 *
 * PHPUnit is not installable in this environment — Composer needs ext-dom, which
 * this PHP build does not have — so the runner is forty lines rather than a
 * dependency. What it must keep is the discipline that matters: assertions that
 * fail loudly, and the ability to assert that an exception is the outcome.
 */
abstract class TestCase
{
    private int $assertionCount = 0;

    public function setUp(): void
    {
    }

    public function tearDown(): void
    {
    }

    protected function assertTrue(bool $condition, string $message = 'expected true'): void
    {
        $this->record();
        if ($condition !== true) {
            throw new AssertionFailed($message);
        }
    }

    protected function assertFalse(bool $condition, string $message = 'expected false'): void
    {
        $this->record();
        if ($condition !== false) {
            throw new AssertionFailed($message);
        }
    }

    protected function assertSame(mixed $expected, mixed $actual, string $message = ''): void
    {
        $this->record();
        if ($expected !== $actual) {
            throw new AssertionFailed(sprintf(
                '%sexpected %s, got %s',
                $message === '' ? '' : $message . ' — ',
                $this->describe($expected),
                $this->describe($actual),
            ));
        }
    }

    protected function assertNotSame(mixed $unexpected, mixed $actual, string $message = ''): void
    {
        $this->record();
        if ($unexpected === $actual) {
            throw new AssertionFailed(sprintf(
                '%sexpected something other than %s',
                $message === '' ? '' : $message . ' — ',
                $this->describe($actual),
            ));
        }
    }

    protected function assertStringContains(string $needle, string $haystack, string $message = ''): void
    {
        $this->record();
        if (!str_contains($haystack, $needle)) {
            throw new AssertionFailed(sprintf(
                '%sexpected the string to contain "%s", got "%s"',
                $message === '' ? '' : $message . ' — ',
                $needle,
                $haystack,
            ));
        }
    }

    protected function assertInstanceOf(string $expected, mixed $actual, string $message = ''): void
    {
        $this->record();
        if (!$actual instanceof $expected) {
            throw new AssertionFailed(sprintf(
                '%sexpected an instance of %s, got %s',
                $message === '' ? '' : $message . ' — ',
                $expected,
                get_debug_type($actual),
            ));
        }
    }

    /**
     * @param countable|array|\Traversable $haystack
     */
    protected function assertCount(int $expected, mixed $haystack, string $message = ''): void
    {
        $this->record();
        $actual = is_array($haystack) || $haystack instanceof \Countable
            ? count($haystack)
            : iterator_count($haystack);
        if ($actual !== $expected) {
            throw new AssertionFailed(sprintf(
                '%sexpected %d items, got %d',
                $message === '' ? '' : $message . ' — ',
                $expected,
                $actual,
            ));
        }
    }

    /**
     * Assert that running $callback throws $expected, and that the message says
     * something specific. An exception class alone proves too little: a rollback
     * caused by the wrong reason is not the invariant being tested.
     *
     * @param class-string<\Throwable> $expected
     */
    protected function assertThrows(string $expected, callable $callback, string $messageContains = ''): \Throwable
    {
        $this->record();
        try {
            $callback();
        } catch (\Throwable $thrown) {
            if (!$thrown instanceof $expected) {
                throw new AssertionFailed(sprintf(
                    'expected %s but got %s: %s',
                    $expected,
                    $thrown::class,
                    $thrown->getMessage(),
                ));
            }
            if ($messageContains !== '' && !str_contains($thrown->getMessage(), $messageContains)) {
                throw new AssertionFailed(sprintf(
                    "%s message did not contain \"%s\"; it said: %s",
                    $expected,
                    $messageContains,
                    $thrown->getMessage(),
                ));
            }

            return $thrown;
        }

        throw new AssertionFailed("expected {$expected} to be thrown, but nothing was");
    }

    protected function fail(string $message): never
    {
        throw new AssertionFailed($message);
    }

    private function record(): void
    {
        $this->assertionCount++;
    }

    public function assertionCount(): int
    {
        return $this->assertionCount;
    }

    private function describe(mixed $value): string
    {
        return match (true) {
            is_string($value) => '"' . $value . '"',
            $value === null => 'null',
            is_bool($value) => $value ? 'true' : 'false',
            is_scalar($value) => (string) $value,
            is_array($value) => 'array(' . count($value) . ')',
            is_object($value) => $value::class,
            default => get_debug_type($value),
        };
    }
}
