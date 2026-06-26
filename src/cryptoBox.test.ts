import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret } from './cryptoBox'

describe('cryptoBox', () => {
  it('round-trips a secret with the right passphrase', async () => {
    const box = await encryptSecret('sk-test-secret', 'class-notes-passphrase')

    await expect(
      decryptSecret(box.ciphertext, box.salt, box.iv, 'class-notes-passphrase'),
    ).resolves.toBe('sk-test-secret')
  })

  it('rejects an incorrect passphrase', async () => {
    const box = await encryptSecret('sk-test-secret', 'correct-passphrase')

    await expect(decryptSecret(box.ciphertext, box.salt, box.iv, 'wrong-passphrase')).rejects.toThrow()
  })
})
