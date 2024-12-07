import { Encrypter, Decrypter } from './typage/index.ts';
import { randomBytes } from '@noble/hashes/utils';
import { toBase32 } from './utils/index.ts';

export function generatePassphrase(bits = 256) {
    return toBase32(randomBytes(Math.max(1, (bits / 8) | 0)));
}

export async function encryptData(data: Uint8Array, ...passphrases: string[]) {
    if (passphrases.length === 0)
        throw new Error('must specify at least one passphrase');

    const e = new Encrypter();
    for (const passphrase of passphrases)
        e.addPassphrase(passphrase);
    return await e.encrypt(data);
}

export async function decryptData(ciphertext: ArrayBufferLike, ...passphrases: string[]) {
    const d = new Decrypter();
    for (const passphrase of passphrases)
        d.addPassphrase(passphrase);
    const plaintext = await d.decrypt(new Uint8Array(ciphertext));
    
    return plaintext;
}
