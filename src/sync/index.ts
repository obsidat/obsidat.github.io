import { type TFile } from "obsidian";
import { toString } from 'uint8arrays/to-string'
import { hashToBase32, scryptToBase32, scryptToBase32Async } from "../utils";
import { CborEntity, key } from "../utils/cbor";

/**
 * Metadata to be serialized as CBOR and stored in AGE encrypted form in the vault record.
 */
export interface VaultMetadata {
    files: Record<string, VaultMetadataFile>;
    vaultRkey?: string;
}

export interface VaultMetadataFile {
    /** Crockford base32 encoded, cryptographically secure random string (16 bytes) */
    rkey: string;
    /** Crockford base32 encoded, cryptographically secure random string (32 bytes) */
    passphrase: string;
}

/**
 * Encrypted file metadata to be serialized as CBOR and encrypted with AGE to be included in the file record
 * as an inline byte stream.
 */
export interface FileMetadata {
    vaultName: string;
    filePath: string;
    referencedFilePassphrases?: Record<string, [rkey: string, passphrase: string]>;
    fileLastCreatedOrModified: Date;
}

// TODO: maybe wanna make this per-repo? or is that unnecessary?
const STATIC_SALT = new Uint8Array([0x5b, 0x5b, 0xe4, 0x8b, 0x43, 0x0d, 0x6d, 0x0f, 0x41, 0xb2, 0x34, 0x93, 0x7f, 0x26, 0x1c, 0x6b, 0xff, 0x49, 0x3b, 0x62, 0x9a, 0x21, 0x94, 0xee, 0x71, 0x5e, 0x91, 0xec, 0xe9, 0x38, 0x1f, 0x12, 0xa8, 0xdd, 0xfa, 0xe4, 0xcf, 0xf5, 0x28, 0xdd, 0xb4, 0x2e, 0x98, 0xd9, 0xd1 ]);

export function getPublicFileRkey(file: TFile | { path: string, vaultName: string }): string {
    // lowercase for case-insensitive file naming
    return `${'vaultName' in file ? file.vaultName : file.vault.getName()}:${file.path}`.toLowerCase();
}

export async function getVaultRkey(vaultName: string, passphrase: string) {
    return await scryptToBase32Async(passphrase, vaultName);
}