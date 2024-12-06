import { XRPC } from "@atcute/client";
import { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { decryptData, encryptData } from "../encryption";
import { arrayBufferToBase64, base64ToArrayBuffer, splitFirst } from ".";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";
import { type TFile } from "obsidian";

export async function encryptBlob(data: ArrayBufferLike, passphrase: string): Promise<Blob> {
    const encryptedData = await encryptData(new Uint8Array(data), passphrase);

    return new Blob([encryptedData], { type: 'application/octet-stream' });
}

export async function encryptFileName(file: TFile, passphrase: string): Promise<At.Bytes> {
    return await encryptInlineData(
        new TextEncoder().encode(`${file.vault.getName()}:${file.path}`),
        passphrase
    );
}

export async function encryptInlineData(data: ArrayBufferLike, passphrase: string): Promise<At.Bytes> {
    const encryptedData = await encryptData(
        new Uint8Array(data),
        passphrase
    );

    return {
        $bytes: arrayBufferToBase64(encryptedData),
    };
}

export async function decryptFileName(remoteFile: IoGithubObsidatFile.Record, passphrase: string): Promise<readonly [vaultName: string, filePath: string]> {
    const [vaultName, filePath] = await decryptInlineData(remoteFile.path, passphrase)
        .then(e => new TextDecoder().decode(e))
        .then(e => splitFirst(e, ':'));

    return [vaultName, filePath] as const;
}

export async function decryptInlineData(data: At.Bytes, passphrase: string) {
    return await decryptData(base64ToArrayBuffer(data.$bytes), passphrase);
}

export async function downloadFileBlob(did: At.DID, agent: XRPC, remoteFile: IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record) {
    const fileDataResponse = await agent.get('com.atproto.sync.getBlob', {
        params: {
            did,
            cid: 'payload' in remoteFile.body ? remoteFile.body.ref.$link : remoteFile.body.ref.$link
        }
    });

    return fileDataResponse.data;
}

export async function decryptBlob(data: Uint8Array, passphrase: string) {
    const fileData = await decryptData(data, passphrase);

    return fileData;
}
