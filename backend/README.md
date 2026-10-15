# RSVP email backend

The frontend sends only the guest's name, surname, attendance and an idempotency ID. SMTP credentials are never included in browser files or the website ZIP.

## cPanel deployment

1. Use PHP 7.4 or later with OpenSSL enabled.
2. Upload the **contents** of `public/` to `public_html/rsvp-api/` (including `vendor/PHPMailer/`).
3. Create `rsvp-private/` beside `public_html`, outside the web root. Copy `private/config.example.php` there as `config.php`. Enter the mail password on the hosting server in the `smtp_password` value, or set `RSVP_SMTP_PASSWORD` in the hosting environment. Restrict the private directory to the hosting account.
4. The backend needs permission to create `rsvp-private/data/` for rate limits and duplicate-delivery records.
5. Set `rsvpEndpoint` in the invitation's `dist/config.js` to the actual HTTPS URL, e.g. `https://krugers2b.co.za/rsvp-api/rsvp.php`, after verifying the domain and folder.
6. Submit a clearly identified test RSVP and confirm receipt in `krugers2b@gmail.com` before treating delivery as verified.

The handler uses authenticated implicit TLS on SMTP port 465 with certificate verification enabled. The recipient, sender and SMTP server are set on the server and cannot be changed through a form submission. Browser origins are restricted to the invitation and the wedding domain. Failed sends return an error and preserve guest input.

PHPMailer 7.1.1 is vendored from the official [PHPMailer repository](https://github.com/PHPMailer/PHPMailer/releases/tag/v7.1.1); its license is in `public/vendor/PHPMailer/LICENSE`.
