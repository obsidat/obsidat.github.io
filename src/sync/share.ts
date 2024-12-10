import { App, MarkdownView, Notice, TFile } from "obsidian";
import { paginatedListRecords, isCidMatching, detectMimeType, chunks, toKeyValuePairs, ATMOSPHERE_CLIENT, toPageAndLinkCounts, rkey } from "../utils";
import { XRPC } from "@atcute/client";
import { Brand, type ComAtprotoRepoApplyWrites, type IoGithubObsidatPublicFile } from "@atcute/client/lexicons";
import MyPlugin, { type MyPluginSettings } from "..";
import { CaseInsensitiveMap } from "../utils/cim";
import { MyMarkdownRenderer } from "../markdown-renderer/renderer";
import { getPublicFileRkey } from ".";
import type { KittyAgent } from "../utils/kitty-agent";

export async function doShare(agent: KittyAgent, app: App, plugin: MyPlugin, settings: MyPluginSettings, files: string[]) {
    const currentDate = new Date();

    const collection = 'io.github.obsidat.publicFile';

    const { records: remoteFiles } = await agent.paginatedList({
        repo: settings.bskyHandle!,
        collection
    });

    const remoteFilesByRkey = CaseInsensitiveMap.toMap(
        remoteFiles,
        file => rkey(file), file => file.value
    );

    const writes: Brand.Union<
        ComAtprotoRepoApplyWrites.Create |
        ComAtprotoRepoApplyWrites.Delete |
        ComAtprotoRepoApplyWrites.Update
    >[] = [];

    new Notice(`Sharing ${files.length} files to @${settings.bskyHandle}...`);

    const allFiles = new Map(app.vault.getAllLoadedFiles().map(e => [e.path, e]));

    const localFileList = files.map(file => allFiles.get(file)!);

    const localFilesByRkey = CaseInsensitiveMap.toMap(
        localFileList.filter(e => e instanceof TFile),
        file => getPublicFileRkey(file),
        file => ({
            ...file,
            fileLastCreatedOrModified: Math.max(file.stat.ctime, file.stat.mtime),
        })
    );

    for (const [rkey, file] of localFilesByRkey.entries()) {
        let renderedHtml: string | undefined;

        const fileData = await file.vault.readBinary(file);

        if (file.extension === 'md' || file.extension === '.md') {
            console.log(`processing frontmatter for ${file.path}`);
            try {
                await app.fileManager.processFrontMatter(file, (frontmatter) => {
                    frontmatter["share-url"] = `${ATMOSPHERE_CLIENT}/page/${settings.bskyHandle}/${encodeURIComponent(rkey)}`;
                });
            } catch (err) {
                console.error('error processing frontmatter', err);
            }
            console.log(`processed frontmatter for ${file.path}`);

            const markdown = new TextDecoder().decode(fileData);

            console.log(`decoded ${file.path}`);

            ({ html: renderedHtml } = await new MyMarkdownRenderer(app, plugin, {
                addExtensionsToInternalLinks: '',
                displayYAMLFrontmatter: true,
                customCSSFile: null,
                highDPIDiagrams: true,
                injectAppCSS: 'none',
                linkStrippingBehaviour: 'link',
            }).render({ data: markdown } as MarkdownView, markdown, file.path));
        }

        const remoteFile = remoteFilesByRkey.get(rkey);

        if (remoteFile) {
            if (fileData.byteLength === remoteFile.body.size && isCidMatching(fileData, remoteFile.body)) {
                // files are identical! dont upload!
                continue;
            }
        }

        const blob = await agent.uploadBlob(
            new Blob([fileData], { type: detectMimeType(file.path) })
        );

        const fileCache = app.metadataCache.getFileCache(file);

        const value = {
            $type: 'io.github.obsidat.publicFile',
            body: blob,
            filePath: file.path,
            vaultName: file.vault.getName(),
            title: fileCache?.frontmatter?.title ?? fileCache?.frontmatter?.name,
            tags: fileCache?.tags?.map(e => e.tag) ?? fileCache?.frontmatter?.tags ?? fileCache?.frontmatter?.tag,
            aliases: fileCache?.frontmatter?.aliases ?? fileCache?.frontmatter?.alias,
            cover: fileCache?.frontmatter?.cover ?? fileCache?.frontmatter?.image,
            description: fileCache?.frontmatter?.description ?? fileCache?.frontmatter?.desc,
            resolvedLinks: toPageAndLinkCounts(app.metadataCache.resolvedLinks[file.path]),
            unresolvedLinks: toPageAndLinkCounts(app.metadataCache.unresolvedLinks[file.path]),
            frontmatter: toKeyValuePairs(fileCache?.frontmatter),
            recordCreatedAt: currentDate.toISOString(),
            fileLastCreatedOrModified: new Date(file.fileLastCreatedOrModified).toISOString(),
            html: renderedHtml,
        } satisfies IoGithubObsidatPublicFile.Record;

        writes.push({
            $type: remoteFile ? 'com.atproto.repo.applyWrites#update' : 'com.atproto.repo.applyWrites#create',
            collection,
            rkey,
            value
        } satisfies Brand.Union<ComAtprotoRepoApplyWrites.Update | ComAtprotoRepoApplyWrites.Create>);
    }

    for (const chunk of chunks(writes, 200)) {
        await agent.batchWrite({
            repo: settings.bskyHandle!,
            writes: chunk
        });
    }

    new Notice(`Shared ${files.length} files to @${settings.bskyHandle}`);
}
