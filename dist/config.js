// Use an ISO date with South Africa's UTC+02:00 offset, for example:
// weddingDate: '2026-11-14T08:30:00+02:00'
// Leave null until the actual wedding date is confirmed.
window.INVITATION_CONFIG = {
  weddingDate: '2026-12-12T08:30:00+02:00',
  // Public HTTPS address of the PHP email handler. SMTP credentials stay on that server.
  rsvpEndpoint: 'https://krugers2b.co.za/rsvp-api/rsvp.php'
};
