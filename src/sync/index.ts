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
    /** Base32 encoded, cryptographically secure random string (16 bytes) */
    rkey: string;
    /** Base32 encoded, cryptographically secure random string (32 bytes) */
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

export function getPublicFileRkey(file: TFile | { path: string, vaultName: string }): string {
    // lowercase for case-insensitive file naming
    return `${'vaultName' in file ? file.vaultName : file.vault.getName()}:${file.path}`.toLowerCase();
}

export async function getVaultRkey(vaultName: string, passphrase: string) {
    return await scryptToBase32Async(passphrase, vaultName);
}