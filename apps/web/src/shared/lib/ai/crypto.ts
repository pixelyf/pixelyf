/**
 * [AI API 키 암호화 모듈]
 * AES-256-GCM으로 사용자 API 키를 암호화/복호화합니다.
 * 서버사이드 전용 — 클라이언트에서 절대 import하지 마세요.
 *
 * 출력 형식: "iv:tag:ciphertext" (각각 hex 인코딩)
 * 환경변수: AI_ENCRYPTION_KEY (32바이트 = 64자리 hex)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12  // 96비트 nonce (GCM 권장)
const TAG_LENGTH = 16

function getKey(): Buffer {
  const keyHex = process.env.AI_ENCRYPTION_KEY
  if (!keyHex || keyHex.length !== 64) {
    throw new Error(
      'AI_ENCRYPTION_KEY 환경변수가 설정되지 않았거나 길이가 올바르지 않습니다. ' +
      '`openssl rand -hex 32`로 생성한 64자리 hex 문자열이 필요합니다.'
    )
  }
  return Buffer.from(keyHex, 'hex')
}

/**
 * API 키를 AES-256-GCM으로 암호화합니다.
 * @returns "iv:tag:ciphertext" (각각 hex 인코딩)
 */
export function encryptApiKey(plainKey: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([
    cipher.update(plainKey, 'utf8'),
    cipher.final()
  ])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/**
 * 암호화된 API 키를 복호화합니다.
 * @param encryptedKey "iv:tag:ciphertext" 형식
 */
export function decryptApiKey(encryptedKey: string): string {
  const key = getKey()
  const parts = encryptedKey.split(':')
  if (parts.length !== 3) {
    throw new Error('잘못된 암호화 키 형식입니다. "iv:tag:ciphertext" 형식이 필요합니다.')
  }
  const [ivHex, tagHex, ciphertextHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf8')
}
