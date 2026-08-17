BEGIN;

-- Customer self-registration: e-poçt təsdiqi üçün tək istifadəlik açarlar.
-- Hesab `users.status = 'invited'` ilə yaradılır və yalnız keçərli açarla
-- `active`-ə keçir (password_reset_tokens ilə eyni forma, ayrı cədvəl saxlanılır
-- ki, şifrə bərpası axını ilə qarışmasın).
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_user_idx
  ON email_verification_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_verification_tokens_expiry_idx
  ON email_verification_tokens (expires_at) WHERE used_at IS NULL;

-- Administrator dəvət sistemi: açıq qeydiyyat yoxdur, yalnız mövcud
-- super administrator yeni admin dəvət edə bilər. İstifadəçi qeydi yalnız
-- dəvət qəbul edildikdə yaranır ki, çatdırılmayan dəvətlər `users`
-- cədvəlini natamam qeydlərlə doldurmasın.
CREATE TABLE IF NOT EXISTS admin_invites (
  id text PRIMARY KEY,
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  token_hash text NOT NULL UNIQUE,
  invited_by text REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_invites_pending_email_unique
  ON admin_invites (lower(email)) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS admin_invites_status_time_idx
  ON admin_invites (status, created_at DESC);

COMMIT;
