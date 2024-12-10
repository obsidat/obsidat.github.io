import MyPlugin from "..";
import { rkey } from "../utils";
import { KittyAgent } from "../utils/kitty-agent";
import { getVaultMetadata } from "./vault-metadata";

export async function doWipe(agent: KittyAgent, plugin: MyPlugin) {
    const vaultMetadata = await getVaultMetadata(agent, plugin);

    const records = await agent.paginatedList({
        collection: 'io.github.obsidat.file',
        repo: plugin.settings.bskyHandle!,
    }).then(e => e.records);
    const blobs = records
        .map(e => ({...e, rkey: rkey(e.uri)}))
        .filter(e => e.rkey.startsWith(plugin.settings.vaultRkey!))
}
