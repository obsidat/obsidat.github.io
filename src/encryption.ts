import { Encrypter, Decrypter } from './typage/index.ts';
import { randomBytes } from '@noble/hashes/utils';
import { toBase32 } from './utils/index.ts';

export function generatePassphrase(bits = 256) {
    return toBase32(randomBytes(Math.max(1, (bits / 8) | 0)));
}

export async function encryptData(data: Uint8Array, passphrase?: string) {
    passphrase ??= generatePassphrase();

    const e = new Encrypter();
    e.setPassphrase(passphrase);
    return await e.encrypt(data);
}

export async function decryptData(ciphertext: ArrayBufferLike, passphrase: string) {
    const e = new Decrypter();
    e.addPassphrase(passphrase);
    const plaintext = await e.decrypt(new Uint8Array(ciphertext));
    
    return plaintext;
}
