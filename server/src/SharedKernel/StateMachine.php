<?php

declare(strict_types=1);

namespace NasTech\SharedKernel;

/**
 * Declarative state machine.
 *
 * The value is not the plumbing, it is that an illegal transition is an
 * exception rather than a boolean nobody checked. v1.0 §14 defines order,
 * payment, dispute and payout state machines; this is the shape all of them
 * share, and the place where "PIN cannot mark paid" stops being a convention.
 */
final class StateMachine
{
    /** @var array<string, array<string, string>> from => [event => to] */
    private array $transitions = [];

    /** @var array<string, string> */
    private array $labels = [];

    /**
     * @param array<string, array<string, string>> $transitions from => [event => to]
     */
    public function __construct(
        private readonly string $name,
        array $transitions,
    ) {
        foreach ($transitions as $from => $byEvent) {
            foreach ($byEvent as $event => $to) {
                $this->transitions[$from][$event] = $to;
                $this->labels[$event] = $event;
            }
        }
    }

    public function can(string $from, string $event): bool
    {
        return isset($this->transitions[$from][$event]);
    }

    public function next(string $from, string $event): string
    {
        $to = $this->transitions[$from][$event] ?? null;
        if ($to === null) {
            $allowed = array_keys($this->transitions[$from] ?? []);
            sort($allowed);
            throw new IllegalTransition(sprintf(
                '%s: event "%s" is not valid from state "%s". Allowed: %s',
                $this->name,
                $event,
                $from,
                $allowed === [] ? '(none — terminal)' : implode(', ', $allowed),
            ));
        }

        return $to;
    }

    /**
     * @return list<string>
     */
    public function eventsAvailableFrom(string $from): array
    {
        $events = array_keys($this->transitions[$from] ?? []);
        sort($events);

        return $events;
    }

    /**
     * Assert that a transition is forbidden. Used by the tests that prove the
     * money rules cannot be bypassed.
     */
    public function assertForbidden(string $from, string $event): void
    {
        if ($this->can($from, $event)) {
            throw new \LogicException(
                "{$this->name}: expected {$from} + {$event} to be forbidden, but it is permitted"
            );
        }
    }
}
