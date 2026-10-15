<?php
declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;

// PHP 7.4+ with OpenSSL. No password or SMTP error is returned to the browser.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function reply(int $code, bool $ok): void {
    http_response_code($code);
    echo json_encode(['ok' => $ok]);
    exit;
}

$configFile = getenv('RSVP_CONFIG_FILE') ?: dirname(__DIR__, 2) . '/rsvp-private/config.php';
if (!is_file($configFile)) reply(503, false);
$config = require $configFile;
if (!is_array($config) || empty($config['smtp_password'])) reply(503, false);

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (!in_array($origin, $config['allowed_origins'] ?? [], true)) reply(403, false);
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Max-Age: 600');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') reply(405, false);
if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) reply(415, false);
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 4096) reply(413, false);
$raw = file_get_contents('php://input', false, null, 0, 4097);
if ($raw === false || strlen($raw) > 4096) reply(413, false);
$input = json_decode($raw, true);
if (!is_array($input)) reply(400, false);
foreach (['name', 'surname', 'attendance', 'requestId'] as $field) {
    if (!isset($input[$field]) || !is_string($input[$field])) reply(422, false);
}
if (!empty($input['website'])) reply(422, false);
$name = trim($input['name']);
$surname = trim($input['surname']);
$attendance = $input['attendance'];
$requestId = $input['requestId'];
foreach ([$name, $surname] as $value) {
    if ($value === '' || strlen($value) > 400 || preg_match('/[\x00-\x1F\x7F]/', $value) || preg_match('//u', $value) !== 1) reply(422, false);
}
if (!in_array($attendance, ['yes', 'no'], true)) reply(422, false);
if (preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i', $requestId) !== 1) reply(422, false);

$directory = $config['data_directory'];
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) reply(503, false);
// Rate limits contain only timestamps and hashed IPs, never guest names.
$rateFile = fopen($directory . '/rate-limits.json', 'c+');
if ($rateFile === false || !flock($rateFile, LOCK_EX)) reply(503, false);
$rates = json_decode(stream_get_contents($rateFile), true) ?: [];
$now = time();
foreach ($rates as $key => $times) {
    $rates[$key] = array_values(array_filter((array)$times, static function ($t) use ($now) { return is_int($t) && $t > $now - 3600; }));
    if (!$rates[$key]) unset($rates[$key]);
}
$ipKey = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
$ipTimes = $rates[$ipKey] ?? [];
$globalTimes = $rates['global'] ?? [];
if (count($ipTimes) >= 10 || count($globalTimes) >= 200) {
    flock($rateFile, LOCK_UN);
    fclose($rateFile);
    header('Retry-After: 3600');
    reply(429, false);
}
$rates[$ipKey][] = $now;
$rates['global'][] = $now;
rewind($rateFile);
ftruncate($rateFile, 0);
fwrite($rateFile, json_encode($rates));
fflush($rateFile);
flock($rateFile, LOCK_UN);
fclose($rateFile);

// A retried request cannot send the same RSVP twice after SMTP accepted it.
$delivery = fopen($directory . '/delivery-' . strtolower($requestId) . '.json', 'c+');
if ($delivery === false || !flock($delivery, LOCK_EX)) reply(503, false);
$previous = json_decode(stream_get_contents($delivery), true);
$fingerprint = hash('sha256', json_encode([$name, $surname, $attendance]));
if (is_array($previous) && ($previous['sent'] ?? false)) {
    $matches = hash_equals((string)$previous['fingerprint'], $fingerprint);
    flock($delivery, LOCK_UN);
    fclose($delivery);
    reply($matches ? 200 : 409, $matches);
}

try {
    require __DIR__ . '/vendor/PHPMailer/Exception.php';
    require __DIR__ . '/vendor/PHPMailer/PHPMailer.php';
    require __DIR__ . '/vendor/PHPMailer/SMTP.php';
    $mail = new PHPMailer(true);
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = (int)$config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_username'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_SMTPS;
    $mail->SMTPDebug = 0;
    $mail->Timeout = 15;
    $mail->CharSet = 'UTF-8';
    $mail->setFrom($config['smtp_username'], 'Krugers se troue');
    $mail->addAddress($config['recipient']);
    $mail->Subject = 'Troue RSVP — ' . ($attendance === 'yes' ? 'Ja' : 'Nee');
    $mail->isHTML(false);
    $date = new DateTimeImmutable('now', new DateTimeZone('Africa/Johannesburg'));
    $mail->Body = "Nuwe RSVP vir 12 Desember 2026\r\n\r\nNaam: " . $name . "\r\nVan: " . $surname . "\r\nBywoning: " . ($attendance === 'yes' ? 'Ja' : 'Nee') . "\r\nOntvang: " . $date->format('Y-m-d H:i:s T') . "\r\n";
    $mail->send();
    rewind($delivery);
    ftruncate($delivery, 0);
    fwrite($delivery, json_encode(['sent' => true, 'fingerprint' => $fingerprint]));
    fflush($delivery);
    flock($delivery, LOCK_UN);
    fclose($delivery);
    reply(200, true);
} catch (Throwable $error) {
    // Keep detailed transport diagnostics and credentials out of responses/logs.
    error_log('RSVP email delivery failed. Reference: ' . $requestId);
    flock($delivery, LOCK_UN);
    fclose($delivery);
    reply(502, false);
}
