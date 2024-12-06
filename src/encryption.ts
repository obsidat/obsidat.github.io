import { CrockfordBase32 } from 'crockford-base32';
import { Encrypter, Decrypter } from './typage/index.ts';
import { randomBytes } from '@noble/hashes/utils';
import { toBase32 } from './utils/index.ts';
import { KeyAndSalt } from './typage/recipients.ts';

export function generatePassphrase(bits = 256) {
    return toBase32(randomBytes(Math.max(1, (bits / 8) | 0)));
}

export function getEncryptionKeyAndSalt(passphrase: string): KeyAndSalt {
    return new Encrypter().generateKeyAndSalt(passphrase);
}

export async function encryptData(data: Uint8Array, passphraseOrKeyAndSalt?: string | KeyAndSalt) {
    passphraseOrKeyAndSalt ??= generatePassphrase();

    const e = new Encrypter();
    if (typeof passphraseOrKeyAndSalt === 'string')
        e.setPassphrase(passphraseOrKeyAndSalt);
    else
        e.setKeyAndSalt(passphraseOrKeyAndSalt.key, passphraseOrKeyAndSalt.salt);

    return await e.encrypt(data);
}

export async function decryptData(ciphertext: Uint8Array, passphraseOrKey: string | Uint8Array) {
    const e = new Decrypter();
    if (typeof passphraseOrKey === 'string')
        e.addPassphrase(passphraseOrKey);
    else
        e.addKey(passphraseOrKey);

    return await e.decrypt(ciphertext);
}
