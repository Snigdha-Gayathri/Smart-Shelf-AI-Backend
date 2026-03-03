# Secrets Safety Guide

## 1) Never commit plaintext keys
- Put public frontend key in `frontend/.env.local`
- Put private backend keys in `backend/.env`
- `.gitignore` is configured to ignore `.env*` files (except `*.example` templates)

## 2) Rotate exposed keys immediately
If any key was pasted in chat, logs, screenshots, or commits, rotate it in provider dashboard.

## 3) Optional local encryption for `.env` files
Use the built-in vault script (`AES-256-GCM` with `scrypt` key derivation).

### Encrypt
```powershell
$env:SECRETS_PASSPHRASE="use-a-long-unique-passphrase"
node .\scripts\secrets-vault.mjs encrypt --in .\backend\.env --out .\secrets\backend.env.enc
node .\scripts\secrets-vault.mjs encrypt --in .\frontend\.env.local --out .\secrets\frontend.env.local.enc
```

### Decrypt (when needed)
```powershell
$env:SECRETS_PASSPHRASE="use-a-long-unique-passphrase"
node .\scripts\secrets-vault.mjs decrypt --in .\secrets\backend.env.enc --out .\backend\.env
node .\scripts\secrets-vault.mjs decrypt --in .\secrets\frontend.env.local.enc --out .\frontend\.env.local
```

## 4) Clerk-specific rule
- `VITE_CLERK_PUBLISHABLE_KEY` can be on frontend.
- `CLERK_SECRET_KEY` must stay backend-only.

## 5) Production
Use your host secret manager (Render/Netlify/Vercel/GitHub Actions secrets) instead of files.
