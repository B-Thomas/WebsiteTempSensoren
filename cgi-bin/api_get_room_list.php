<?php
// api_get_room_list.php - Dedicated endpoint to fetch room names using mysqli

// ====================================================
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    http_response_code(200);
    exit();
}
// ====================================================


// --- 1. Database credentials ---
require_once __DIR__ . '/load_config.php';
$cfg = sensor_config();
$db_server = (string)$cfg['db_server'];
$db_user = (string)$cfg['db_user'];
$db_password = (string)$cfg['db_password'];
$db_name = (string)$cfg['db_name'];

// --- 2. Connection Setup (Using mysqli) ---

// Attempt connection using the successful method
$conn = new mysqli($db_server, $db_user, $db_password, $db_name);

if ($conn->connect_error) {
    http_response_code(503);
    echo json_encode(["success" => false, "error" => "Database Connection Failed. Error: " . $conn->connect_error]);
    exit();
}


// --- 3. Room Listing Logic (Using mysqli functions) ---

$roomData = [];
try {
    $rooms = sensor_ident($cfg, 'table_rooms');
    $src = sensor_ident($cfg, 'col_source');
    $roomName = sensor_ident($cfg, 'col_room_name');
} catch (InvalidArgumentException $e) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => $e->getMessage()]);
    $conn->close();
    exit();
}
$sql = "SELECT DISTINCT $src AS source, $roomName AS name FROM $rooms ORDER BY name ASC";
$result = $conn->query($sql); // Execute query

if ($result === false) {
    http_response_code(500);
    echo json_encode(["success" => false, "error" => "SQL Query failed: " . $conn->error]);
} else {
    // Fetch all results and structure the array
    $roomData = [];
    while ($row = $result->fetch_assoc()) {
        // Use htmlspecialchars() for safety when displaying room names in HTML
        $roomData[] = [
            'id' => $row['source'], 
            'name' => htmlspecialchars($row['name'])
        ];
    }

    // Success Output
    echo json_encode(["success" => true, "rooms" => $roomData]);
}


// --- 4. Cleanup ---
$conn->close();

?>
