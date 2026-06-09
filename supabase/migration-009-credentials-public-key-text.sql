-- Fix WebAuthn credential storage.
--
-- The app writes the public key as a base64 string and reads it back with
-- Buffer.from(public_key, "base64"). The column was bytea, so the base64
-- string was stored as its raw ASCII bytes and never round-tripped — passkey
-- login failed with a malformed COSE key ("length not supported / not well
-- formatted"). Switch the column to text so the base64 round-trip is correct.
--
-- convert_from(public_key, 'UTF8') recovers the original base64 string from the
-- ASCII bytes currently stored, so existing credentials keep working.

alter table credentials
  alter column public_key type text using convert_from(public_key, 'UTF8');
