<?php

declare(strict_types=1);

/**
 * Hand-rolled PSR-4 autoloader. Composer cannot run in this environment
 * (PHP 8.3 is built without ext-dom / ext-mbstring, both of which Composer
 * requires), so the mapping is explicit here.
 */
$prefixes = [
    'NasTech\\' => __DIR__ . '/../src/',
    'NasTech\\Tests\\' => __DIR__ . '/../tests/',
];

spl_autoload_register(static function (string $class) use ($prefixes): void {
    // Longest prefix first so NasTech\Tests\ wins over NasTech\
    uksort($prefixes, static fn (string $a, string $b): int => strlen($b) <=> strlen($a));

    foreach ($prefixes as $prefix => $baseDir) {
        if (!str_starts_with($class, $prefix)) {
            continue;
        }
        $relative = substr($class, strlen($prefix));
        $path = $baseDir . str_replace('\\', '/', $relative) . '.php';
        if (is_file($path)) {
            require $path;
            return;
        }
    }
});
