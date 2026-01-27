# Rhyming-Pairs

## Admin access configuration

Set `ADMIN_EMAIL_ALLOWLIST` in your Netlify environment variables to a
comma-separated list of email addresses allowed to use the admin tools (for
example: `ADMIN_EMAIL_ALLOWLIST=you@example.com`). The admin upload and admin
schedule endpoints will reject any authenticated user that is not in this list.
