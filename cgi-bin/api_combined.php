<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

/*
 * Dashboard read endpoint.
 * Credentials, the secret, and table and column names live in config.php.
 * The frontend uses only access=READ with structured parameters.
 */
require_once __DIR__ . '/load_config.php';
$cfg = sensor_config();
$db_server = (string)$cfg['db_server'];
$db_user = (string)$cfg['db_user'];
$db_password = (string)$cfg['db_password'];
$db_name = (string)$cfg['db_name'];
$api_secret = (string)$cfg['api_secret'];
$api_key = (string)$cfg['api_key'];

$body = file_get_contents('php://input');
$data = json_decode($body, true);
if (!is_array($data) || !isset($data['secret']) || !hash_equals($api_secret, (string)$data['secret'])) {
    http_response_code(401);
    echo json_encode(['error' => 'Invalid Secret Key']);
    exit;
}
if (($data['key'] ?? '') !== $api_key || ($data['access'] ?? '') !== 'READ') {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid request']);
    exit;
}
$params = $data['params'] ?? null;
if (!is_array($params) || !isset($params['source'], $params['start_date'], $params['end_date'])) {
    http_response_code(400);
    echo json_encode(['error' => 'source, start_date, and end_date are required']);
    exit;
}
$roomId = (string)$params['source'];
$startDate = (string)$params['start_date'];
$endDate = (string)$params['end_date'];
$granularity = (string)($params['granularity'] ?? 'raw');
if (strtotime($startDate) === false || strtotime($endDate) === false || strtotime($startDate) > strtotime($endDate)) {
    http_response_code(400);
    echo json_encode(['error' => 'Invalid time range']);
    exit;
}

mysqli_report(MYSQLI_REPORT_OFF);
$conn = new mysqli($db_server, $db_user, $db_password, $db_name);
if ($conn->connect_error) {
    http_response_code(503);
    echo json_encode(['error' => 'Database connection failed']);
    exit;
}
$conn->set_charset('utf8mb4');

try {
    $readings = sensor_ident($cfg, 'table_readings');
    $ts = sensor_ident($cfg, 'col_timestamp');
    $temp = sensor_ident($cfg, 'col_temperature');
    $hum = sensor_ident($cfg, 'col_humidity');
    $src = sensor_ident($cfg, 'col_source');
} catch (InvalidArgumentException $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
    $conn->close();
    exit;
}

switch ($granularity) {
    case 'raw':
        $sql = "SELECT $ts AS timestamp, $temp AS temperature, $hum AS humidity FROM $readings WHERE $src = ? AND $ts BETWEEN ? AND ? ORDER BY $ts ASC";
        break;
    case 'day':
        $sql = "SELECT DATE($ts) AS DateGroup, AVG($temp) AS AvgTemp, AVG($hum) AS AvgHum, MIN($temp) AS MinTemp, MAX($temp) AS MaxTemp, MIN($hum) AS MinHum, MAX($hum) AS MaxHum FROM $readings WHERE $src = ? AND $ts BETWEEN ? AND ? GROUP BY DATE($ts) ORDER BY DateGroup ASC";
        break;
    case 'week':
        $sql = "SELECT DATE_SUB(DATE($ts), INTERVAL WEEKDAY($ts) DAY) AS YearWeekStart, AVG($temp) AS AvgTemp, AVG($hum) AS AvgHum, MIN($temp) AS MinTemp, MAX($temp) AS MaxTemp, MIN($hum) AS MinHum, MAX($hum) AS MaxHum FROM $readings WHERE $src = ? AND $ts BETWEEN ? AND ? GROUP BY YEARWEEK($ts, 3), DATE_SUB(DATE($ts), INTERVAL WEEKDAY($ts) DAY) ORDER BY YearWeekStart ASC";
        break;
    case 'month':
        $sql = "SELECT DATE_FORMAT($ts, '%Y-%m') AS YearMonthStart, AVG($temp) AS AvgTemp, AVG($hum) AS AvgHum, MIN($temp) AS MinTemp, MAX($temp) AS MaxTemp, MIN($hum) AS MinHum, MAX($hum) AS MaxHum FROM $readings WHERE $src = ? AND $ts BETWEEN ? AND ? GROUP BY YEAR($ts), MONTH($ts) ORDER BY YEAR($ts), MONTH($ts)";
        break;
    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid grouping']);
        $conn->close();
        exit;
}

$stmt = $conn->prepare($sql);
if (!$stmt) {
    http_response_code(500);
    echo json_encode(['error' => 'The SQL query could not be prepared']);
    $conn->close();
    exit;
}
$stmt->bind_param('sss', $roomId, $startDate, $endDate);
if (!$stmt->execute()) {
    http_response_code(500);
    echo json_encode(['error' => 'The SQL query failed']);
    $stmt->close();
    $conn->close();
    exit;
}
$result = $stmt->get_result();
$rows = $result ? $result->fetch_all(MYSQLI_ASSOC) : [];
echo json_encode(['SmarthomeResponses' => $rows], JSON_UNESCAPED_UNICODE);
$stmt->close();
$conn->close();
?>
