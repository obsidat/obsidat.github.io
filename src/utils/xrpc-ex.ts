import { XRPC, XRPCResponse } from "@atcute/client";
import { ComAtprotoRepoCreateRecord, ComAtprotoRepoGetRecord, ComAtprotoRepoListRecords, ComAtprotoRepoPutRecord, Records } from "@atcute/client/lexicons";

interface GetRecordParams<K extends keyof Records> extends ComAtprotoRepoGetRecord.Params { collection: K; }
interface GetRecordOutput<K extends keyof Records> extends ComAtprotoRepoGetRecord.Output { value: Records[K]; }

interface PutRecordParams<K extends keyof Records> extends ComAtprotoRepoPutRecord.Input { collection: K; }
interface PutRecordOutput<K extends keyof Records> extends ComAtprotoRepoPutRecord.Output { value: Records[K]; }

interface CreateRecordParams<K extends keyof Records> extends ComAtprotoRepoCreateRecord.Input { collection: K; }
interface CreateRecordOutput<K extends keyof Records> extends ComAtprotoRepoCreateRecord.Output { value: Records[K]; }

interface ListRecordsParams<K extends keyof Records> extends ComAtprotoRepoListRecords.Params { collection: K; }
interface ListRecordsOutput<K extends keyof Records> extends ComAtprotoRepoListRecords.Output { records: ListRecordsRecord<K>[]; }
interface ListRecordsRecord<K extends keyof Records> extends ComAtprotoRepoListRecords.Record { value: Records[K]; }

// TODO use
export class XRPCEx extends XRPC {
    async getRecord<K extends keyof Records>(params: GetRecordParams<K>) {
        const { data } = await this.get('com.atproto.repo.getRecord', {
            params
        });

        return data as GetRecordOutput<K>;
    }

    async listRecords<K extends keyof Records>(params: ListRecordsParams<K>) {
        const { data } = await this.get('com.atproto.repo.listRecords', {
            params
        });

        return data as ListRecordsOutput<K>;
    }

    async putRecord<K extends keyof Records>(params: PutRecordParams<K>) {
        const { data } = await this.call('com.atproto.repo.putRecord', {
            data: params
        });

        return data as PutRecordOutput<K>;
    }

    async createRecord<K extends keyof Records>(params: CreateRecordParams<K>) {
        const { data } = await this.call('com.atproto.repo.createRecord', {
            data: params
        });

        return data as CreateRecordOutput<K>;
    }

    async paginatedListRecords<K extends keyof Records>(params: {
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
            const result: XRPCResponse<ComAtprotoRepoListRecords.Output> = await this.get('com.atproto.repo.listRecords', {
                params: {
                    repo: params.repo,
                    collection: params.collection,
                    limit: limit === undefined
                        ? PER_PAGE
                        : limit / PER_PAGE > 1
                            ? PER_PAGE
                            : limit,
                    reverse: params.reverse ?? true,
                    cursor
                }
            });
    
            if (!result.data.records.length ||
                result.data.records.every(
                    e => results.find(e1 => e1.uri == e.uri)
                )
            ) {
                break;
            }

            if (limit !== undefined) {
                limit -= result.data.records.length;
            }
    
            results.push(...result.data.records as ListRecordsRecord<K>[]);
    
            cursor = result.data.cursor;
    
            if (!cursor) break;
        } while (cursor);
    
        return { records: results, cursor };
    }
}