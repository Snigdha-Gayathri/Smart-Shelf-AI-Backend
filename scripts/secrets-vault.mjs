#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

function usage() {
  console.log(`Usage:
  node scripts/secrets-vault.mjs encrypt --in <plaintext_file> --out <encrypted_file>
  node scripts/secrets-vault.mjs decrypt --in <encrypted_file> --out <plaintext_file>

Environment:
  SECRETS_PASSPHRASE   Passphrase used for encryption/decryption (required)
`)
}

function parseArgs(argv) {
  const args = { mode: null, in: null, out: null }
  const [mode, ...rest] = argv
  if (!mode || (mode !== 'encrypt' && mode !== 'decrypt')) return args
  args.mode = mode
  for (let i = 0; i < rest.length; i += 1) {
    const key = rest[i]
    const val = rest[i + 1]
    if (key === '--in') args.in = val
    if (key === '--out') args.out = val
  }
  return args
}

function deriveKey(passphrase, salt) {
  return crypto.scryptSync(passphrase, salt, 32)
}

function encrypt(plainBuffer, passphrase) {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveKey(passphrase, salt)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const ciphertext = Buffer.concat([cipher.update(plainBuffer), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from('SSV1'), salt, iv, tag, ciphertext])
}

function decrypt(encBuffer, passphrase) {
  const magic = encBuffer.subarray(0, 4).toString('utf8')
  if (magic !== 'SSV1') {
    throw new Error('Invalid encrypted file format')
  }
  const salt = encBuffer.subarray(4, 20)
  const iv = encBuffer.subarray(20, 32)
  const tag = encBuffer.subarray(32, 48)
  const ciphertext = encBuffer.subarray(48)
  const key = deriveKey(passphrase, salt)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

async function main() {
  const { mode, in: inputPath, out: outputPath } = parseArgs(process.argv.slice(2))
  const passphrase = process.env.SECRETS_PASSPHRASE

  if (!mode || !inputPath || !outputPath) {
    usage()
    process.exit(2)
  }
  if (!passphrase || passphrase.length < 16) {
    console.error('SECRETS_PASSPHRASE is required and must be at least 16 characters.')
    process.exit(2)
  }

  const absIn = path.resolve(inputPath)
  const absOut = path.resolve(outputPath)
  const input = fs.readFileSync(absIn)

  if (mode === 'encrypt') {
    const encrypted = encrypt(input, passphrase)
    fs.mkdirSync(path.dirname(absOut), { recursive: true })
    fs.writeFileSync(absOut, encrypted)
    console.log(`Encrypted: ${absIn} -> ${absOut}`)
    return
  }

  const decrypted = decrypt(input, passphrase)
  fs.mkdirSync(path.dirname(absOut), { recursive: true })
  fs.writeFileSync(absOut, decrypted)
  console.log(`Decrypted: ${absIn} -> ${absOut}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
