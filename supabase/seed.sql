-- Seed auth users for local development (OTP login)
-- App data (user profiles) is seeded via `pnpm db:seed` after migrations
--
-- Note: This file is read by `supabase db reset` and cannot read env vars.
-- It seeds a default `admin@example.com` auth user; the matching profile is
-- then created by `pnpm db:seed`, which honors SEED_ADMIN_EMAIL / SEED_ADMIN_NAME.
-- If you override those env vars, the TS seed will create a second profile.

DO $$
DECLARE
  user_id uuid;
  user_email text;
BEGIN
  FOR user_email IN SELECT unnest(ARRAY['admin@example.com'])
  LOOP
    IF EXISTS (SELECT 1 FROM auth.users WHERE email = user_email) THEN
      CONTINUE;
    END IF;

    user_id := gen_random_uuid();

    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      is_super_admin, role, aud, confirmation_token, email_change,
      email_change_token_new, recovery_token, phone, phone_change,
      phone_change_token, email_change_token_current, reauthentication_token
    ) VALUES (
      user_id, '00000000-0000-0000-0000-000000000000', user_email, '',
      now(), now(), now(), '{"provider": "email", "providers": ["email"]}',
      '{}', false, 'authenticated', 'authenticated', '', '', '', '', NULL, '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      user_id, user_id, user_email, 'email',
      jsonb_build_object('sub', user_id::text, 'email', user_email, 'email_verified', true, 'provider', 'email'),
      now(), now(), now()
    );
  END LOOP;
END $$;
