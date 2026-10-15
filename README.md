# Wedding invitation

Buildless HTML, CSS and JavaScript. The complete website is in `dist/`.

## Preview

From the project folder run `npm run dev`, then visit http://127.0.0.1:8080.
On desktop the invitation stays within a phone-width frame. On phones it fills the viewport.

## Local RSVP simulation

The Node server uses built-in Node modules; no dependency installation is required. It serves the invitation and provides `POST /api/rsvp`. While running locally it overrides the email endpoint in the served configuration without changing the production configuration file.

Submit the RSVP form to create a simulated email addressed to `krugers2b@gmail.com`. No SMTP connection is made and no real email is sent. View submissions at http://127.0.0.1:8080/__dev/outbox and download each generated `.eml` email. The records are stored in `.local/rsvp-outbox/`, which is ignored by Git. Invalid submissions are rejected, and retrying the same request ID does not create another email.

Run `npm test` to verify submission handling. Stop the local server with Ctrl+C. The server listens only on this computer's loopback interface.

## Complete the countdown

- The countdown screen uses a solid white background.
- The countdown is configured for 12 December 2026 at 08:30 in South Africa (`+02:00`). Edit `weddingDate` in `dist/config.js` if this changes.

The opening screen shows only a PNG preview of the video. Tap anywhere on it (or press Enter/Space) to start playback. Navigation is hidden and all section changes are blocked until the video finishes, then the invitation automatically advances to the countdown. Returning to the opening screen resets this behavior. If the tab is hidden, playback pauses and another tap resumes it.

After the intro, swipe up/left for the next page; down/right for the previous page. Page dots, the next arrow, keyboard arrows and mouse wheel also work. Swipes inside Spotify's iframe are controlled by Spotify; use the surrounding background or page dots.

Images retain their entire composition, with white space on screens whose proportions differ from the PNG files. The Spotify background fills its section and its 352px player is centered horizontally and vertically.

The Google Maps text has an accessible tap area aligned with the venue artwork. It opens the supplied Maps link in a new tab.

The RSVP button opens a form styled with the countdown fonts. It collects name, surname and exactly one Yes/No attendance answer. The live frontend uses `https://krugers2b.co.za/rsvp-api/rsvp.php`; the uploaded PHP handler sends through the configured SMTP server to `krugers2b@gmail.com`. The server accepted a labelled test email on 15 October 2026. Inbox receipt must be confirmed by the mailbox owner. Local Node development still overrides this endpoint with the simulation. SMTP credentials belong only in the private server configuration, outside the web root. Backend files and hosting instructions are in `backend/`.

Google Fonts and Spotify require an internet connection. The countdown fonts have local fallbacks. Host all files in `dist/` together on a static web host.
