import { type RPCOptions, XRPC, XRPCError, type XRPCOptions, type XRPCRequestOptions, type XRPCResponse } from "@atcute/client";
import type { At, ComAtprotoRepoApplyWrites, ComAtprotoRepoCreateRecord, ComAtprotoRepoGetRecord, ComAtprotoRepoListRecords, ComAtprotoRepoPutRecord, ComAtprotoSyncGetBlob, ComAtprotoSyncListBlobs, Procedures, Queries, Records } from "@atcute/client/lexicons";

interface GetRecordParams<K extends keyof Records> extends ComAtprotoRepoGetRecord.Params { collection: K; }
interface GetRecordOutput<K extends keyof Records> extends ComAtprotoRepoGetRecord.Output { value: Records[K]; }

interface PutRecordParams<K extends keyof Records> extends ComAtprotoRepoPutRecord.Input { collection: K; record: Records[K]; }
interface PutRecordOutput<K extends keyof Records> extends ComAtprotoRepoPutRecord.Output { }

interface CreateRecordParams<K extends keyof Records> extends ComAtprotoRepoCreateRecord.Input { collection: K; record: Records[K]; }
interface CreateRecordOutput<K extends keyof Records> extends ComAtprotoRepoCreateRecord.Output { }

interface ListRecordsParams<K extends keyof Records> extends ComAtprotoRepoListRecords.Params { collection: K; }
interface ListRecordsOutput<K extends keyof Records> extends ComAtprotoRepoListRecords.Output { records: ListRecordsRecord<K>[]; }
interface ListRecordsRecord<K extends keyof Records> extends ComAtprotoRepoListRecords.Record { value: Records[K]; }

export function isInvalidSwapError(err: unknown) {
    return err instanceof XRPCError && err.kind === 'InvalidSwap';
}

export function isRecordNotFoundError(err: unknown) {
    return err instanceof XRPCError && err.kind === 'RecordNotFound';
}

type OutputOf<T> = T extends { output: infer U; } ? U : void;

// WARNING: Evil TypeScript crimes
// This spread array nonsense allows .query and .call to have 1-3
// parameters based on only the generic type.
// 
// This cannot be done with overloads to my knowledge.
type ParamsThenData<T>
    = T extends { params: infer U }
        ? T extends { input: infer V }
            ? [params: U, data: V]
        : [params: U]
    : T extends { input: infer W }
        ? [params: undefined, data: W]
        : [];

type DataThenParams<T>
    = T extends { input: infer U }
        ? T extends { params: infer V }
            ? [data: U, params: V]
        : [data: U]
    : T extends { params: infer W }
        ? [data: undefined, params: W]
        : [];

// TODO use
export class KittyAgent<X extends XRPC = XRPC> {
    public readonly xrpc: X;

    constructor(opts: XRPCOptions | X) {
        this.xrpc = opts instanceof XRPC ? opts as X : new XRPC(opts) as X;
    }

    /** Makes a request to the XRPC service */
    async request(options: XRPCRequestOptions): Promise<XRPCResponse> {
        return await this.xrpc.request(options);
    }

    async query<K extends keyof Queries>(
        nsid: K,
        ...args: ParamsThenData<Queries[K]>
    ): Promise<OutputOf<Queries[K]>> {
        const [params, data] = args as unknown[];

        const { data: outData } = await this.xrpc.get(nsid, { params, data, } as any);

        return outData;
    }

    async call<K extends keyof Procedures>(
        nsid: K,
        ...args: DataThenParams<Procedures[K]>
    ): Promise<OutputOf<Procedures[K]>> {
        const [data, params] = args as unknown[];

        const { data: outData } = await this.xrpc.call(nsid, { params, data } as any);

        return outData;
    }

    async get<K extends keyof Records>(params: GetRecordParams<K>) {
        const data = await this.query('com.atproto.repo.getRecord', params);

        return data as GetRecordOutput<K>;
    }

    async getBlob(params: ComAtprotoSyncGetBlob.Params): Promise<Uint8Array> {
        const data = await this.query('com.atproto.sync.getBlob', params);

        return data;
    }

    async tryGet<K extends keyof Records>(params: GetRecordParams<K>) {
        try {
            return await this.get(params);
        } catch (err) {
            if (!isRecordNotFoundError(err)) throw err;
            return {
                uri: undefined,
                value: undefined,
                cid: undefined,
            };
        }
    }

    async list<K extends keyof Records>(params: ListRecordsParams<K>) {
        const data = await this.query('com.atproto.repo.listRecords', params);

        return data as ListRecordsOutput<K>;
    }

    async put<K extends keyof Records>(params: PutRecordParams<K>) {
        const data = await this.call('com.atproto.repo.putRecord', params);

        return data as PutRecordOutput<K>;
    }

    async uploadBlob(buf: Uint8Array | Blob) {
        const data = await this.call('com.atproto.repo.uploadBlob', buf);

        return data.blob;
    }

    async trySwap<K extends keyof Records>(params: PutRecordParams<K>) {
        try {
            await this.put(params);
            return true;
        } catch (err) {
            if (!isInvalidSwapError(err)) {
                throw err;
            }
            return false;
        }
    }

    async create<K extends keyof Records>(params: CreateRecordParams<K>) {
        const data = await this.call('com.atproto.repo.createRecord', params);

        return data as CreateRecordOutput<K>;
    }

    async paginatedList<K extends keyof Records>(params: {
        repo: string,
        collection: K,
        reverse?: boolean,
        limit?: number;
    }): Promise<ListRecordsOutput<K>> {
        const PER_PAGE = 100;
    
        const results: ListRecordsRecord<K>[] = [];

        let limit = params.limit;
    
        let cursor: string | undefined = undefined;
        do {
            const data: ComAtprotoRepoListRecords.Output
                = await this.query('com.atproto.repo.listRecords', {
                    repo: params.repo,
                    collection: params.collection,
                    limit: limit === undefined
                        ? PER_PAGE
                        : limit / PER_PAGE > 1
                            ? PER_PAGE
                            : limit,
                    reverse: params.reverse ?? true,
                    cursor
                });
    
            if (!data.records.length ||
                data.records.every(
                    e => results.find(e1 => e1.uri == e.uri)
                )
            ) {
                break;
            }

            if (limit !== undefined) {
                limit -= data.records.length;
            }
    
            results.push(...data.records as ListRecordsRecord<K>[]);
    
            cursor = data.cursor;
    
            if (!cursor) break;
        } while (cursor);
    
        return { records: results, cursor };
    }

    async paginatedListBlobs(params: {
        did: At.DID,
        limit?: number;
    }) {
        const PER_PAGE = 100;
    
        const cids: string[] = [];

        let limit = params.limit;
    
        let cursor: string | undefined = undefined;
        do {
            const data: ComAtprotoSyncListBlobs.Output
                = await this.query('com.atproto.sync.listBlobs', {
                    did: params.did,
                    limit: limit === undefined
                        ? PER_PAGE
                        : limit / PER_PAGE > 1
                            ? PER_PAGE
                            : limit,
                    cursor
                });
    
            if (!data.cids.length ||
                data.cids.every(
                    e => cids.find(e1 => e1 == e)
                )
            ) {
                break;
            }

            if (limit !== undefined) {
                limit -= data.cids.length;
            }
    
            cids.push(...data.cids);
    
            cursor = data.cursor;
    
            if (!cursor) break;
        } while (cursor);
    
        return { cids, cursor };
    }

    async batchWrite(params: ComAtprotoRepoApplyWrites.Input) {
        return await this.call('com.atproto.repo.applyWrites', params);
    }
}