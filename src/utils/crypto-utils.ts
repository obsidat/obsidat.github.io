import { XRPC } from "@atcute/client";
import type { At, IoGithubObsidatFile, IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import { decryptData, encryptData } from "../encryption";
import { arrayBufferToBase64, base64ToArrayBuffer, splitFirst } from ".";
import { getPdsEndpoint, type DidDocument } from "@atcute/client/utils/did";
import type { TFile } from "obsidian";
import type { KittyAgent } from "./kitty-agent";

export async function encryptBlob(data: ArrayBufferLike, passphrase: string): Promise<Blob> {
    const encryptedData = await encryptData(new Uint8Array(data), passphrase);

    return new Blob([encryptedData], { type: 'application/octet-stream' });
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

export async function decryptInlineData(data: At.Bytes, passphrase: string) {
    return await decryptData(base64ToArrayBuffer(data.$bytes), passphrase);
}

export async function downloadFileBlob(did: At.DID, agent: KittyAgent, remoteFile: IoGithubObsidatFile.Record | IoGithubObsidatPublicFile.Record) {
    const fileDataResponse = await agent.getBlob({
        did,
        cid: 'payload' in remoteFile.body ? remoteFile.body.ref.$link : remoteFile.body.ref.$link
    });

    return fileDataResponse;
}

export async function decryptBlob(data: Uint8Array, passphrase: string) {
    const fileData = await decryptData(data, passphrase);

    return fileData;
}
