import type { At, Brand, ComAtprotoRepoApplyWrites } from "@atcute/client/lexicons";
import MyPlugin from "..";
import { chunks, rkey } from "../utils";
import { KittyAgent } from "../utils/kitty-agent";
import { getVaultMetadata } from "./vault-metadata";
import { Notice } from "obsidian";

export async function doWipe(agent: KittyAgent, plugin: MyPlugin) {
    const { app, settings } = plugin;

    const vaultMetadata = await getVaultMetadata(agent, plugin);

    const records = await agent.paginatedList({
        collection: 'io.github.obsidat.file',
        repo: settings.bskyHandle!,
    }).then(e => e.records);
    
    const filteredRecords = records
        .map(e => ({...e, rkey: rkey(e)}))
        .filter(e => e.rkey.startsWith(vaultMetadata.rkey));
    
    // const blobs = filteredRecrods
    //     .map(e => e.value.body.ref.$link);

    new Notice(`Deleting ${filteredRecords.length} pages.`);

    const deletes = filteredRecords.map(e => ({
        $type: 'com.atproto.repo.applyWrites#delete',
        collection: 'io.github.obsidat.file',
        rkey: e.rkey,
    } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Delete>));

    for (const chunk of chunks(deletes, 200)) {
        await agent.batchWrite({
            repo: settings.bskyHandle!,
            writes: chunk
        });
    }
    
    new Notice(`Deleted ${filteredRecords.length} pages.`);
}
