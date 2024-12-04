import { XRPC, XRPCResponse } from "@atcute/client";
import type { At, Brand, ComAtprotoRepoListRecords, IoGithubObsidatGeneric, IoGithubObsidatPublicFile, Records } from "@atcute/client/lexicons";

/*!
The MIT License (MIT)

Copyright (c) Feross Aboukhadijeh

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/
export function toBuffer(arr: ArrayBufferLike) {
    return ArrayBuffer.isView(arr)
        // To avoid a copy, use the typed array's underlying ArrayBuffer to back
        // new Buffer, respecting the "view", i.e. byteOffset and byteLength
        ? Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength)
        // Pass through all other types to `Buffer.from`
        : Buffer.from(arr);
}

export type Awaitable<T> = Awaited<T> | Promise<Awaited<T>>;

interface ListRecordsRecord<K extends keyof Records> {
    [Brand.Type]?: 'com.atproto.repo.listRecords#record';
    cid: At.CID;
    uri: At.Uri;
    value: Records[K];
    rkey: string;
}

export async function paginatedListRecords<K extends keyof Records>(agent: XRPC, repo: string, collection: K) {
    const results: ListRecordsRecord<K>[] = [];

    let cursor: string | undefined = undefined;
    do {
        const result: XRPCResponse<ComAtprotoRepoListRecords.Output> = await agent.get('com.atproto.repo.listRecords', {
            params: {
                repo,
                collection,
                limit: 100,
                reverse: true,
                cursor
            }
        });

        if (!result.data.records.length || result.data.records.every(e => results.find(e1 => e1.uri == e.uri))) {
            break;
        }

        results.push(...result.data.records.map(e => ({
            ...e,
            value: e.value as Records[K],
            rkey: e.uri.slice(e.uri.lastIndexOf('/') + 1),
        })));

        cursor = result.data.cursor;

        if (!cursor) break;
    } while (cursor);

    return results;
}

export function* chunks<T>(arr: T[], chunkSize = 10): Generator<T[]> {
    for (let i = 0; i < arr.length; i += chunkSize) {
        yield arr.slice(i, i + chunkSize);
    }
}

export function truncate(text: string, len = 250) {
    if (text.length <= len) return text;
    return text.slice(0, len - 3) + '...';
}

//create an empty mime-type:
import { DuplicationProcessWay, type IMimeTypes, MimeType } from 'mime-type';
import db from 'mime-db';
const mime = new MimeType(db as IMimeTypes, DuplicationProcessWay.dupDefault);

export function detectMimeType(pathOrExtension: string) {
    let result = mime.lookup(pathOrExtension);
    if (!result) return 'application/octet-stream';
    if (Array.isArray(result)) result = result[0];
    return result;
}

import { sha256 } from '@noble/hashes/sha256';
import { parse as parseCid, create as createCid, format as formatCid } from '@atcute/cid';
import { CrockfordBase32 } from "crockford-base32";
import { blake3 } from "@noble/hashes/blake3";
import { DidDocument } from "@atcute/client/utils/did";

export function isCidMatching(data: ArrayBufferLike, blob: At.Blob) {
    const cid = parseCid(blob.ref.$link);
    const digest = cid.digest.digest;

    const actualDigest = sha256(new Uint8Array(data));

    return isEqualBytes(digest, actualDigest);
}

// https://stackoverflow.com/a/77736145
export function isEqualBytes(bytes1: Uint8Array, bytes2: Uint8Array): boolean {
    if (typeof indexedDB !== 'undefined' && indexedDB.cmp) {
        return indexedDB.cmp(bytes1, bytes2) === 0;
    }

    if (bytes1.length !== bytes2.length) {
        return false;
    }

    for (let i = 0; i < bytes1.length; i++) {
        if (bytes1[i] !== bytes2[i]) {
            return false;
        }
    }

    return true;
}

export function toBase32(buffer: ArrayBufferLike) {
    return CrockfordBase32.encode(toBuffer(buffer));
}

export function fromBase32(string: string) {
    return new Uint8Array(CrockfordBase32.decode(string));
}

export function hashFileName(...segments: string[]) {
    return toBase32(blake3(segments.join('')));
}

export function toPageAndLinkCounts(linksAndCounts: Record<string, number>): IoGithubObsidatPublicFile.PageAndLinkCount[] {
    return Object.entries(linksAndCounts)
        .map(([link, count]) => ({
            page: link,
            linkCount: count,
        } satisfies IoGithubObsidatPublicFile.PageAndLinkCount))
}

export function toKeyValuePairs(data?: undefined): undefined;
export function toKeyValuePairs(data: Record<string, unknown>): IoGithubObsidatGeneric.KeyValuePair[];
export function toKeyValuePairs(data?: Record<string, unknown>): IoGithubObsidatGeneric.KeyValuePair[] | undefined;
export function toKeyValuePairs(data?: Record<string, unknown>): IoGithubObsidatGeneric.KeyValuePair[] | undefined {
    if (!data) return undefined;
    return Object.entries(data).map(toKeyValuePair);
}

export function toKeyValuePair(data: [key: string, value: unknown]): IoGithubObsidatGeneric.KeyValuePair {
    return {
        key: data[0],
        value: toGenericValue(data[1]),
    } satisfies IoGithubObsidatGeneric.KeyValuePair;
}

export function toGenericValue(value: unknown): Brand.Union<
    | IoGithubObsidatGeneric.Null
    | IoGithubObsidatGeneric.Number
    | IoGithubObsidatGeneric.Object
    | IoGithubObsidatGeneric.String
> | undefined {
    if (value === undefined) return undefined;
    if (value === null) return { $type: 'io.github.obsidat.generic#null' };
    if (typeof value === 'number') return {
        $type: 'io.github.obsidat.generic#number',
        value: JSON.stringify(value),
    };
    if (typeof value === 'string') return {
        $type: 'io.github.obsidat.generic#string',
        value,
    };
    if (typeof value === 'object') return {
        $type: 'io.github.obsidat.generic#object',
        value: JSON.stringify(value),
    };
    throw new Error('Unsupported type: ' + typeof value);
}

export const ATMOSPHERE_CLIENT = `https://obsidat.github.io/#`;

export function splitFirst(string: string, separator: string): [left: string, right: string] {
    const idx = string.indexOf(separator);
    if (idx === -1) return [string, ''];
    return [string.slice(0, idx), string.slice(idx + 1)];
}

export function getDid(didDoc: DidDocument): At.DID {
    return didDoc.id as At.DID;
}

export function getHandle(didDoc: DidDocument) {
    return didDoc.alsoKnownAs
        ?.find(handle => handle.startsWith('at://'))
        ?.slice('at://'.length);
}
