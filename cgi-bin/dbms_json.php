<?php
// dbms_json.php
// This script handles JSON data sent via POST requests and interacts with a MySQL database.

// Set headers to allow cross-origin requests
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// --- 1. Database credentials ---
require_once __DIR__ . '/load_config.php';
$cfg = sensor_config();
$db_server = (string)$cfg['db_server'];
$db_user = (string)$cfg['db_user'];
$db_password = (string)$cfg['db_password'];
$db_name = (string)$cfg['db_name'];
$api_secret = (string)$cfg['api_secret'];
$api_key = (string)$cfg['api_key'];

// --- 2. Takes raw data from the request (Existing Logic) ---
$json = file_get_contents('php://input');
$data = json_decode($json, false);


if (!$data || !isset($data->secret) || !hash_equals($api_secret, (string)$data->secret)) {
    echo "Invalid Secret Key";
    exit();
}

if (isset($data->key) && hash_equals($api_key, (string)$data->key)) {
    
    // --- 3. Connection Setup ---
    $conn = new mysqli($db_server, $db_user, $db_password, $db_name);

    // Check connection
    if ($conn->connect_error) {
        die("Connection failed: " . $conn->connect_error);
    }
    
    // --- 4. Write Access Handler
    if($data->access === "WRITE")
    {
        // WARNING: Always use prepared statements for INSERT/UPDATE queries to prevent SQL Injection!
        $temp = $conn->real_escape_string($data->temperature);
        $humid = $conn->real_escape_string($data->humidity);
        $source = $conn->real_escape_string($data->source);

        try {
            $readings = sensor_ident($cfg, 'table_readings');
            $colTemp = sensor_ident($cfg, 'col_temperature');
            $colHum = sensor_ident($cfg, 'col_humidity');
            $colSource = sensor_ident($cfg, 'col_source');
        } catch (InvalidArgumentException $e) {
            echo json_encode(["status" => $e->getMessage()]);
            $conn->close();
            exit();
        }

        $sql = "INSERT INTO $readings ($colTemp, $colHum, $colSource) VALUES ('".$temp."','".$humid."','".$source."')";
        
        if ($conn->query($sql) === TRUE) {
            echo json_encode(["status" => "New record created successfully"]);
        } else {
            echo json_encode(["status" => "Error writing data: " . $conn->error]);
        }
    }

    $conn->close();

} else {
    // If key is missing or incorrect
    exit();
}
?>
