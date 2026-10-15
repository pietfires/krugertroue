<?php
// Store the real file OUTSIDE public_html at ~/rsvp-private/config.php.
// Set the password here on the hosting server only, or use RSVP_SMTP_PASSWORD.
return [
    'smtp_host' => 'cphost29.vpslocal.co.za',
    'smtp_port' => 465,
    'smtp_username' => 'admin@krugers2b.co.za',
    'smtp_password' => getenv('RSVP_SMTP_PASSWORD') ?: '',
    'recipient' => 'krugers2b@gmail.com',
    'allowed_origins' => [
        'https://ons-trou-12-desember-2026.shrewdchime256.chatgpt.site',
        'https://krugers2b.co.za',
        'https://www.krugers2b.co.za',
    ],
    'data_directory' => __DIR__ . '/data',
];
