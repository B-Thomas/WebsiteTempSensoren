<?php
/**
 * Loads cgi-bin/config.php and checks SQL identifiers before they are interpolated.
 */
function sensor_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }

    $path = __DIR__ . '/config.php';
    if (!is_file($path)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'cgi-bin/config.php is missing. Copy config.example.php to config.php and replace the placeholders.',
        ]);
        exit;
    }

    $loaded = require $path;
    if (!is_array($loaded)) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'cgi-bin/config.php must return an array.']);
        exit;
    }

    $cfg = $loaded;
    return $cfg;
}

function sensor_ident(array $cfg, string $key): string
{
    $name = (string)($cfg[$key] ?? '');
    if (!preg_match('/^[A-Za-z_][A-Za-z0-9_]*$/', $name)) {
        throw new InvalidArgumentException('Invalid SQL identifier in config.php: ' . $key);
    }
    return '`' . $name . '`';
}
