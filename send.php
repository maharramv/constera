<?php

declare(strict_types=1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Location: ./index.html#contact');
    exit;
}

$lang = ($_POST['lang'] ?? 'en') === 'ru' ? 'ru' : 'en';
$redirectBase = './index.html';

$name = trim((string)($_POST['name'] ?? ''));
$company = trim((string)($_POST['company'] ?? ''));
$email = trim((string)($_POST['email'] ?? ''));
$message = trim((string)($_POST['message'] ?? ''));

$hasErrors =
    mb_strlen($name) < 2 ||
    ($company !== '' && mb_strlen($company) < 2) ||
    $email === '' ||
    !filter_var($email, FILTER_VALIDATE_EMAIL) ||
    mb_strlen($message) < 10;

if ($hasErrors) {
    header('Location: ' . $redirectBase . '?status=validation&lang=' . $lang . '#contact');
    exit;
}

$to = 'sales@constera.ru';
$subject = 'CONSTERA website inquiry';

$lines = [
    'New inquiry from CONSTERA website',
    '',
    'Name: ' . ($name !== '' ? $name : '-'),
    'Company: ' . ($company !== '' ? $company : '-'),
    'Email: ' . $email,
    '',
    'Message:',
    $message,
];

$body = implode(PHP_EOL, $lines);
$headers = [
    'From: CONSTERA Website <no-reply@constera.ru>',
    'Reply-To: ' . $email,
    'Content-Type: text/plain; charset=UTF-8',
];

$success = @mail($to, $subject, $body, implode("\r\n", $headers));
$status = $success ? 'success' : 'error';

header('Location: ./index.html?status=' . $status . '&lang=' . $lang . '#contact');
exit;
