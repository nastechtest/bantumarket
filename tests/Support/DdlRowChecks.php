<?php

declare(strict_types=1);

namespace NasTech\Tests\Support;

/**
 * The row-level CHECK clauses of the migration, read as text and evaluated against
 * the rows the money path actually writes.
 *
 * Why this exists: no PostgreSQL is available here, so 001_money_path.sql has never
 * run. SchemaParityTest proves the two sides declare the same tables, columns and
 * indexes — but a CHECK can be declared, present, correctly named and simply wrong.
 * `CHECK (commission_cents >= 0)` on a table that also stores reversals reads as a
 * tightening and is in fact a refund that cannot commit. The only substitute for a
 * server is to hand the real rows to the real expressions.
 *
 * The grammar is deliberately narrow and refuses anything outside it. Every
 * unsupported construct raises UnsupportedCheck instead of returning true, so the
 * next person who adds `CHECK (some_function(x) = 'y')` is forced to either teach
 * this file or simplify the DDL — rather than watching the suite go green over a
 * clause nobody read.
 */
final class DdlRowChecks
{
    /**
     * Functions the evaluator knows the SQL meaning of. Kept to the string and
     * container helpers the launch schema actually uses in a CHECK.
     *
     * @var list<string>
     */
    private const FUNCTIONS = ['length', 'btrim', 'lower', 'upper', 'jsonb_typeof'];

    /**
     * @return list<array{name: string, expression: string}>
     */
    public static function checksIn(string $ddl, string $qualifiedTable): array
    {
        $pattern = '/CREATE TABLE ' . preg_quote($qualifiedTable, '/') . ' \((.*?)\n\);/s';
        if (preg_match($pattern, $ddl, $matches) !== 1) {
            throw new UnsupportedCheck("the migration creates no table named {$qualifiedTable}");
        }

        $body = self::stripComments($matches[1]);
        $checks = [];

        if (preg_match_all('/\bCHECK\b/i', $body, $occurrences, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($occurrences[0] as $index => $occurrence) {
                $open = strpos($body, '(', $occurrence[1] + strlen($occurrence[0]));
                if ($open === false) {
                    throw new UnsupportedCheck("CHECK with no parenthesised expression in {$qualifiedTable}");
                }
                $close = self::matchingParen($body, $open);
                $expression = trim(substr($body, $open + 1, $close - $open - 1));

                // CONSTRAINT name sits immediately before the keyword; an unnamed
                // CHECK gets the database's own style of name so the failure still
                // says which clause broke.
                $before = rtrim(substr($body, 0, $occurrence[1]));
                $name = preg_match('/CONSTRAINT\s+([a-z_0-9]+)\s*$/i', $before, $m) === 1
                    ? $m[1]
                    : $qualifiedTable . '_check_' . ($index + 1);

                $checks[] = ['name' => $name, 'expression' => $expression];
            }
        }

        // A table with no CHECK clauses is a fact about the schema, not a failure of
        // this reader. The caller decides whether that is acceptable; the row test does
        // not silently stop checking.
        return $checks;
    }

    /**
     * Postgres semantics: a CHECK is satisfied when its expression is TRUE *or
     * NULL*. Returning the raw three-valued result keeps that visible to the tests
     * that need to assert it.
     */
    public static function evaluate(string $expression, array $row): ?bool
    {
        $tokens = self::tokenize($expression);
        $cursor = 0;
        $result = self::parseOr($tokens, $cursor, $row, $expression);

        if ($cursor !== count($tokens)) {
            throw new UnsupportedCheck("{$expression} does not parse as a row-level check");
        }

        return $result;
    }

    public static function passes(string $expression, array $row): bool
    {
        return self::evaluate($expression, $row) !== false;
    }

    // ------------------------------------------------------------------
    // Text
    // ------------------------------------------------------------------

    private static function stripComments(string $sql): string
    {
        return preg_replace('/--.*$/m', '', $sql) ?? $sql;
    }

    /**
     * Position of the ')' closing the '(' at $open, ignoring parentheses inside
     * string literals — '[)' is a range bound, not a balanced pair.
     */
    private static function matchingParen(string $text, int $open): int
    {
        $depth = 0;
        $length = strlen($text);
        $inString = false;

        for ($i = $open; $i < $length; $i++) {
            $char = $text[$i];

            if ($inString) {
                if ($char === "'") {
                    // SQL escapes a quote by doubling it; a doubled quote is not a close.
                    if (($text[$i + 1] ?? '') === "'") {
                        $i++;
                    } else {
                        $inString = false;
                    }
                }

                continue;
            }

            if ($char === "'") {
                $inString = true;
            } elseif ($char === '(') {
                $depth++;
            } elseif ($char === ')') {
                $depth--;
                if ($depth === 0) {
                    return $i;
                }
            }
        }

        throw new UnsupportedCheck('unbalanced parentheses in the DDL check being read');
    }

    /**
     * @return list<array{type: string, value: mixed}>
     */
    private static function tokenize(string $expression): array
    {
        $tokens = [];
        $length = strlen($expression);
        $i = 0;

        while ($i < $length) {
            $char = $expression[$i];

            if (ctype_space($char)) {
                $i++;
                continue;
            }

            if ($char === "'") {
                $end = $i + 1;
                $value = '';
                while ($end < $length) {
                    if ($expression[$end] === "'") {
                        if (($expression[$end + 1] ?? '') === "'") {
                            $value .= "'";
                            $end += 2;
                            continue;
                        }
                        break;
                    }
                    $value .= $expression[$end];
                    $end++;
                }
                if ($end >= $length) {
                    throw new UnsupportedCheck("unterminated string in: {$expression}");
                }
                $tokens[] = ['type' => 'string', 'value' => $value];
                $i = $end + 1;
                continue;
            }

            if (is_numeric($char) || ($char === '-' && is_numeric($expression[$i + 1] ?? ''))) {
                // \G, not just the offset argument: preg_match's offset says where to
                // start *searching*, not where the match must begin, so without it a
                // token further along the string is silently picked up here and $i is
                // advanced by the wrong amount.
                if (preg_match('/\G-?\d+(?:\.\d+)?/', $expression, $m, 0, $i) === 1) {
                    $tokens[] = [
                        'type' => 'number',
                        'value' => str_contains($m[0], '.') ? (float) $m[0] : (int) $m[0],
                    ];
                    $i += strlen($m[0]);
                    continue;
                }
            }

            if (preg_match('/\G[a-zA-Z_][a-zA-Z_0-9]*/', $expression, $m, 0, $i) === 1) {
                $tokens[] = ['type' => 'name', 'value' => strtolower($m[0])];
                $i += strlen($m[0]);
                continue;
            }

            foreach (['<=', '>=', '<>', '!=', '!~'] as $two) {
                if (substr($expression, $i, 2) === $two) {
                    $tokens[] = ['type' => 'op', 'value' => $two];
                    $i += 2;
                    continue 2;
                }
            }

            if (str_contains('=<>*+-/(),.~', $char)) {
                $tokens[] = ['type' => $char === '(' ? 'lparen' : ($char === ')' ? 'rparen' : ($char === ',' ? 'comma' : 'op')), 'value' => $char];
                $i++;
                continue;
            }

            throw new UnsupportedCheck("character {$char} in a CHECK the evaluator cannot read: {$expression}");
        }

        return $tokens;
    }

    // ------------------------------------------------------------------
    // Parse, and evaluate while parsing
    // ------------------------------------------------------------------

    private static function parseOr(array $tokens, int &$cursor, array $row, string $expression): ?bool
    {
        $left = self::parseAnd($tokens, $cursor, $row, $expression);

        while (self::peekKeyword($tokens, $cursor, 'or')) {
            $cursor++;
            $right = self::parseAnd($tokens, $cursor, $row, $expression);

            // Kleene OR: true dominates, null is contagious only over false.
            $left = match (true) {
                $left === true, $right === true => true,
                $left === false && $right === false => false,
                default => null,
            };
        }

        return $left;
    }

    private static function parseAnd(array $tokens, int &$cursor, array $row, string $expression): ?bool
    {
        $left = self::parseNot($tokens, $cursor, $row, $expression);

        while (self::peekKeyword($tokens, $cursor, 'and')) {
            $cursor++;
            $right = self::parseNot($tokens, $cursor, $row, $expression);

            $left = match (true) {
                $left === false, $right === false => false,
                $left === true && $right === true => true,
                default => null,
            };
        }

        return $left;
    }

    private static function parseNot(array $tokens, int &$cursor, array $row, string $expression): ?bool
    {
        if (self::peekKeyword($tokens, $cursor, 'not')) {
            $cursor++;
            $value = self::parseNot($tokens, $cursor, $row, $expression);

            return $value === null ? null : !$value;
        }

        if (self::peekIs($tokens, $cursor, 'lparen', '(')) {
            $cursor++;
            $value = self::parseOr($tokens, $cursor, $row, $expression);
            self::expect($tokens, $cursor, 'rparen', ')', $expression);

            return $value;
        }

        return self::parsePredicate($tokens, $cursor, $row, $expression);
    }

    private static function parsePredicate(array $tokens, int &$cursor, array $row, string $expression): ?bool
    {
        $left = self::parseAdditive($tokens, $cursor, $row, $expression);

        $token = $tokens[$cursor] ?? null;
        if ($token === null) {
            throw new UnsupportedCheck("{$expression} ends without a comparison");
        }

        if ($token['type'] === 'name' && $token['value'] === 'is') {
            $cursor++;
            $negated = self::takeKeyword($tokens, $cursor, 'not');
            self::expectKeyword($tokens, $cursor, 'null', $expression);
            $isNull = !self::isPresent($left);

            return $negated ? !$isNull : $isNull;
        }

        if ($token['type'] === 'name' && $token['value'] === 'in') {
            $cursor++;
            self::expect($tokens, $cursor, 'lparen', '(', $expression);

            $members = [];
            do {
                $members[] = self::parseAdditive($tokens, $cursor, $row, $expression);
            } while (self::take($tokens, $cursor, 'comma', ','));
            self::expect($tokens, $cursor, 'rparen', ')', $expression);

            if ($left === null) {
                return null;
            }
            foreach ($members as $member) {
                if (self::equal($left, $member)) {
                    return true;
                }
            }

            return false;
        }

        if ($token['type'] === 'name' && in_array($token['value'], ['like', 'ilike', 'similar'], true)) {
            throw new UnsupportedCheck(
                "pattern matching ({$token['value']}) in {$expression}: the evaluator cannot model Postgres LIKE, "
                . 'so a row-level rule using it stays unverified rather than guessed at'
            );
        }

        if ($token['type'] !== 'op') {
            throw new UnsupportedCheck("expected a comparison operator in: {$expression}");
        }
        $cursor++;

        $right = self::parseAdditive($tokens, $cursor, $row, $expression);

        if ($left === null || $right === null) {
            return null;
        }

        // ~ and !~ are the POSIX regex match; the patterns in this schema are plain
        // character classes, so PCRE with the same body is the same test.
        if ($token['value'] === '~' || $token['value'] === '!~') {
            if (!is_string($left) || !is_string($right)) {
                throw new UnsupportedCheck("regex applied to non-text in: {$expression}");
            }
            $matched = preg_match('/' . str_replace('/', '\/', $right) . '/', $left) === 1;

            return $token['value'] === '~' ? $matched : !$matched;
        }

        return match ($token['value']) {
            '=' => self::equal($left, $right),
            '<>', '!=' => !self::equal($left, $right),
            '<' => self::compare($left, $right, $expression) < 0,
            '<=' => self::compare($left, $right, $expression) <= 0,
            '>' => self::compare($left, $right, $expression) > 0,
            '>=' => self::compare($left, $right, $expression) >= 0,
            default => throw new UnsupportedCheck("operator {$token['value']} in: {$expression}"),
        };
    }

    private static function parseAdditive(array $tokens, int &$cursor, array $row, string $expression): mixed
    {
        $left = self::parseMultiplicative($tokens, $cursor, $row, $expression);

        while (self::peekIs($tokens, $cursor, 'op', '+') || self::peekIs($tokens, $cursor, 'op', '-')) {
            $operator = $tokens[$cursor]['value'];
            $cursor++;
            $right = self::parseMultiplicative($tokens, $cursor, $row, $expression);

            if ($left === null || $right === null) {
                return null;
            }
            $left = $operator === '+' ? $left + $right : $left - $right;
        }

        return $left;
    }

    private static function parseMultiplicative(array $tokens, int &$cursor, array $row, string $expression): mixed
    {
        $left = self::parseOperand($tokens, $cursor, $row, $expression);

        while (self::peekIs($tokens, $cursor, 'op', '*') || self::peekIs($tokens, $cursor, 'op', '/')) {
            $operator = $tokens[$cursor]['value'];
            $cursor++;
            $right = self::parseOperand($tokens, $cursor, $row, $expression);

            if ($left === null || $right === null) {
                return null;
            }
            $left = $operator === '*' ? $left * $right : intdiv((int) $left, (int) $right);
        }

        return $left;
    }

    private static function parseOperand(array $tokens, int &$cursor, array $row, string $expression): mixed
    {
        $token = $tokens[$cursor] ?? null;
        if ($token === null) {
            throw new UnsupportedCheck("{$expression} is missing an operand");
        }

        if ($token['type'] === 'number' || $token['type'] === 'string') {
            $cursor++;

            return $token['value'];
        }

        if ($token['type'] === 'name') {
            $cursor++;
            $name = $token['value'];

            if ($name === 'null') {
                return null;
            }
            if ($name === 'true' || $name === 'false') {
                return $name === 'true';
            }

            // A name followed by '(' is a call. Anything outside the short list of
            // string helpers is refused rather than approximated.
            if (self::peekIs($tokens, $cursor, 'lparen', '(')) {
                if (!in_array($name, self::FUNCTIONS, true)) {
                    throw new UnsupportedCheck(
                        "function {$name}() in {$expression}: not modelled. Teach the evaluator or simplify the check."
                    );
                }
                $cursor++;
                $argument = self::parseAdditive($tokens, $cursor, $row, $expression);
                self::expect($tokens, $cursor, 'rparen', ')', $expression);

                return self::apply($name, $argument);
            }

            if (!array_key_exists($name, $row)) {
                throw new UnsupportedCheck("column {$name} is referenced by {$expression} but is not in the row");
            }

            return $row[$name];
        }

        if ($token['type'] === 'lparen') {
            $cursor++;
            $value = self::parseAdditive($tokens, $cursor, $row, $expression);
            self::expect($tokens, $cursor, 'rparen', ')', $expression);

            return $value;
        }

        throw new UnsupportedCheck("unexpected {$token['type']} in: {$expression}");
    }

    private static function apply(string $function, mixed $argument): mixed
    {
        if ($argument === null) {
            return null;
        }

        return match ($function) {
            // Byte length. This environment has no mbstring, and every value the
            // launch schema puts through length() is an ASCII id, a reference or a
            // reason written by the application.
            'length' => is_string($argument) ? strlen($argument) : throw new UnsupportedCheck('length() of a non-string'),
            'btrim' => is_string($argument) ? trim($argument) : throw new UnsupportedCheck('btrim() of a non-string'),
            'lower' => strtolower((string) $argument),
            'upper' => strtoupper((string) $argument),
            'jsonb_typeof' => self::jsonType($argument),
            default => throw new UnsupportedCheck("{$function}() is not modelled"),
        };
    }

    /**
     * The JSON type of a jsonb column as the row holds it. A store that keeps the
     * decoded array and a store that keeps the encoded text are both plausible, and
     * the check means the same thing either way.
     */
    private static function jsonType(mixed $payload): string
    {
        if (is_array($payload)) {
            return array_is_list($payload) ? 'array' : 'object';
        }

        $decoded = json_decode((string) $payload, true);

        if ($decoded === null) {
            return 'null';
        }
        if (is_array($decoded)) {
            return array_is_list($decoded) ? 'array' : 'object';
        }

        return is_bool($decoded) ? 'boolean' : (is_numeric($decoded) ? 'number' : 'string');
    }

    // ------------------------------------------------------------------
    // Token helpers
    // ------------------------------------------------------------------

    /** @return ?array{type: string, value: mixed} */
    private static function peek(array $tokens, int $cursor): ?array
    {
        return $tokens[$cursor] ?? null;
    }

    private static function peekIs(array $tokens, int $cursor, string $type, string $value): bool
    {
        $token = $tokens[$cursor] ?? null;

        return $token !== null && $token['type'] === $type && $token['value'] === $value;
    }

    private static function peekKeyword(array $tokens, int $cursor, string $keyword): bool
    {
        $token = $tokens[$cursor] ?? null;

        return $token !== null && $token['type'] === 'name' && $token['value'] === $keyword;
    }

    private static function takeKeyword(array $tokens, int &$cursor, string $keyword): bool
    {
        if (!self::peekKeyword($tokens, $cursor, $keyword)) {
            return false;
        }
        $cursor++;

        return true;
    }

    private static function expectKeyword(array $tokens, int &$cursor, string $keyword, string $expression): void
    {
        if (!self::takeKeyword($tokens, $cursor, $keyword)) {
            throw new UnsupportedCheck("expected {$keyword} in: {$expression}");
        }
    }

    private static function take(array $tokens, int &$cursor, string $type, string $value): bool
    {
        if (self::peek($tokens, $cursor) !== ['type' => $type, 'value' => $value]) {
            return false;
        }
        $cursor++;

        return true;
    }

    private static function expect(array $tokens, int &$cursor, string $type, string $value, string $expression): void
    {
        if (!self::take($tokens, $cursor, $type, $value)) {
            throw new UnsupportedCheck("expected {$value} in: {$expression}");
        }
    }

    // ------------------------------------------------------------------
    // Values
    // ------------------------------------------------------------------

    private static function isPresent(mixed $value): bool
    {
        return $value !== null;
    }

    private static function equal(mixed $left, mixed $right): bool
    {
        if (is_bool($left) || is_bool($right)) {
            return (bool) $left === (bool) $right;
        }

        if (is_numeric($left) && is_numeric($right)) {
            return (float) $left == (float) $right;
        }

        return (string) $left === (string) $right;
    }

    /**
     * Numeric when both sides are numbers, byte order otherwise. Timestamps are
     * stored as ISO-8601, which sorts correctly as text — but only while every row
     * carries the same offset, so a mixed-offset write would be compared here as
     * text and the check would be reading the wrong thing.
     *
     * @return -1|0|1
     */
    private static function compare(mixed $left, mixed $right, string $expression): int
    {
        if (!is_numeric($left) || !is_numeric($right)) {
            if (is_string($left) && is_string($right)) {
                return strcmp($left, $right) <=> 0;
            }

            throw new UnsupportedCheck("ordering of non-numeric values in: {$expression}");
        }

        return (float) $left <=> (float) $right;
    }
}
