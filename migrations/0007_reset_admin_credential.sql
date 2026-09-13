-- Clear any database override so the configured ADMIN_PASSWORD_HASH secret
-- becomes the active administrator credential.
DELETE FROM admin_credentials WHERE id = 'primary';
