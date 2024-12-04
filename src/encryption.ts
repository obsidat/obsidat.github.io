import { CrockfordBase32 } from 'crockford-base32';
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
    const { header, nonce, payload } = await e.encryptAsParts(data);
    
    return { passphrase, header: new TextDecoder().decode(header), nonce, payload };
}

export async function decryptData({ header: headerText, nonce, payload }: {
    header: string;
    nonce: Uint8Array;
    payload: Uint8Array;
}, passphrase: string) {
    const e = new Decrypter();
    e.addPassphrase(passphrase);
    
    const header = new TextEncoder().encode(headerText);
    
    // TODO improve this nonsense...
    const ciphertext = new Uint8Array(header.length + nonce.length + payload.length);
    ciphertext.set(header);
    ciphertext.set(nonce, header.length);
    ciphertext.set(payload, header.length + nonce.length);

    const plaintext = await e.decrypt(ciphertext);
    
    return plaintext;
}
