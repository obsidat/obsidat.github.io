import { CrockfordBase32 } from 'crockford-base32';
import { Encrypter, Decrypter } from './typage/index.ts';
import { randomBytes } from '@noble/hashes/utils';
import { encode as encode85, decode as decode85 } from 'base85';
import { toBuffer } from './utils.ts';

export function generatePassphrase() {
    return CrockfordBase32.encode(toBuffer(randomBytes(256 / 8))); // 256 bits of entropy
}

export async function encryptData(data: Uint8Array, passphrase?: string) {
    passphrase ??= generatePassphrase();

    const e = new Encrypter();
    e.setPassphrase(passphrase);
    const { header, nonce, payload } = await e.encryptAsParts(data);
    
    return { passphrase, header: new TextDecoder().decode(header), nonce: toBuffer(nonce), payload };
}

export async function decryptData(passphrase: string, { header: headerText, nonce, payload }: {
    header: string;
    nonce: Uint8Array;
    payload: Uint8Array;
}) {
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
