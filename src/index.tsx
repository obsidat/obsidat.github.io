import { App, Editor, FileView, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, TFolder, type MarkdownFileInfo } from 'obsidian';

import type { NodeSavedSession, NodeSavedState } from "@atproto/oauth-client-node";
import type { SessionManager } from "@atproto/api/dist/session-manager";
import type { FetchHandlerObject, XRPC } from '@atcute/client';
import type { At } from "@atcute/client/lexicons";
import { h } from '@jsx';

import { generatePassphrase } from "./encryption.ts";
import { ObsidianAtpOauthClientXPlat } from "./oauth-xplat.ts";
import { ATMOSPHERE_CLIENT, type Awaitable, memoize } from "./utils/index.ts";
import { doPush } from "./sync/push.ts";
import type { VaultMetadata } from "./sync/index.ts";
import { doPull } from "./sync/pull.ts";
import { doShare } from './sync/share.ts';
import { XRPCEx } from './utils/xrpc-ex.ts';
import { KittyAgent } from './utils/kitty-agent.ts';
import { doWipe } from './sync/wipe.ts';

// Remember to rename these classes and interfaces!

export interface MyPluginSettings {
    deleteMissingRemoteFiles: boolean;
    deleteMissingLocalFiles: boolean;
    dontOverwriteNewFiles: boolean;
    passphrase: string;
    bskyHandle?: string;
    auth: {
        state: Record<string, NodeSavedState>;
        session: Record<string, NodeSavedSession>;
    },
    vaultRkey?: string;
    vaultMetadataCache: VaultMetadata;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    deleteMissingRemoteFiles: true,
    deleteMissingLocalFiles: false,
    dontOverwriteNewFiles: false,
    passphrase: undefined!,
    auth: {
        state: {},
        session: {},
    },
    vaultMetadataCache: {
        files: {}
    },
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings = DEFAULT_SETTINGS;

    @memoize()
    private get session() {
        if (!this.settings.bskyHandle) throw new Error('No ATP handle defined in settings!');

        return (async () => {
            return await new ObsidianAtpOauthClientXPlat(this.app).authenticate(this.settings.bskyHandle!);
        })();
    }

    @memoize()
    private get agent() {
        return (async () => {
            const rpc = new XRPCEx({ handler: await this.session });

            return new KittyAgent<XRPCEx>(rpc);
        })();
    }

    @memoize()
    private get did() {
        return (async () => {
            const result = ((await this.session).sub
                ?? (this.settings.bskyHandle?.startsWith('did:') ? this.settings.bskyHandle : undefined!)
            ) as At.DID | undefined;

            if (!result) throw new Error('No DID!');

            return result;
        })();
    }

    async onload() {
        await this.loadSettings();

        // This creates an icon in the left ribbon.
        this.addRibbonIcon('arrow-up-from-line', 'Push changes to AT Protocol', async (evt: MouseEvent) => {
            doPush(await this.agent, this);
        });

        this.addRibbonIcon('arrow-down-from-line', 'Pull changes from AT Protocol', async (evt: MouseEvent) => {
            doPull(await this.agent, await this.did, this);
        });

        this.addCommand({
            id: 'wipe-repo',
            name: 'Delete remote synced vault',
            callback: () => {
                const settings = this.settings;
                const app = this.app;
                class VerifyPromptModal extends Modal {
                    constructor(app: App, onSubmit: () => void, onCancel: () => void) {
                        super(app);
                        this.setTitle(`Deleting ${app.vault.getName()} from the remote repository!`);

                        <div $parent={this.contentEl}>
                            <p>
                                This will delete <b>ALL FILES</b> from your synced repo. It will not affect
                                local files.
                            </p>
                        </div>

                        new Setting(this.contentEl)
                            .addButton(button =>
                                button
                                    .setButtonText('Submit')
                                    .setCta()
                                    .onClick(() => {
                                        this.close();
                                        onSubmit();
                                    }))
                            .addButton(button =>
                                button
                                    .setButtonText('Cancel')
                                    .setCta()
                                    .onClick(() => {
                                        this.close();
                                        onCancel();
                                    }));
                    }
                }

                new Promise<void>((resolve, reject) => {
                    new VerifyPromptModal(this.app, () => {
                        // submit
                        resolve();
                    }, () => {
                        // cancel
                        reject();
                    }).open();
                }).then(async () => {
                    await doWipe(await this.agent, this);
                });
            }
        })
        
        this.addCommand({
            id: 'open-synced-page',
            name: 'Open synchronized page on the ATmosphere',
            checkCallback: (checking: boolean) => {
                const fileView = this.app.workspace.getActiveViewOfType(FileView);
                if (!fileView) {
                    return false;
                }
                if (checking) {
                    return true;
                }

                const activeFile = fileView.file;

                if (!activeFile) {
                    new Notice('No file currently active!');
                    return;
                }

                window.open(
                    `${ATMOSPHERE_CLIENT}/private-page/${
                        this.settings.bskyHandle!
                    }/${
                        this.settings.vaultRkey + this.settings.vaultMetadataCache.files[activeFile.path].rkey
                    }/${
                        this.settings.vaultMetadataCache.files[activeFile.path].passphrase
                    }`,
                    '_blank',
                    'noopener,noreferrer',
                );
            }
        });
        

        this.addCommand({
            id: 'share-open-file',
            name: 'Share open file publically to the ATmosphere',
            checkCallback: (checking: boolean) => {
                const fileView = this.app.workspace.getActiveViewOfType(FileView);
                if (!fileView) {
                    return false;
                }
                if (checking) {
                    return true;
                }
                
                const activeFile = fileView.file;

                if (!activeFile) {
                    new Notice('No file currently active!');
                    return;
                }

                if (!(activeFile.path in this.app.metadataCache.resolvedLinks)) {
                    new Notice('No resolved links for active file...');
                    return;
                }

                const seenLinks = new Set<string>();
                seenLinks.add(activeFile.path);

                const recurseLinks = (resolvedLinks: Record<string, number>, allResolvedLinks: Record<string, number>) => {
                    for (const link of Object.keys(resolvedLinks)) { // be careful when replacing this with `in`
                        if (seenLinks.has(link)) continue;
                        seenLinks.add(link);

                        allResolvedLinks[link] ??= 0;
                        allResolvedLinks[link] += resolvedLinks[link];

                        if (link.endsWith('.md')) {
                            const subResolvedLinks = this.app.metadataCache.resolvedLinks[link];
                            recurseLinks(subResolvedLinks, allResolvedLinks);
                        }
                    }

                    return allResolvedLinks;
                };

                console.log(this.app.metadataCache.resolvedLinks, activeFile.path);

                const allResolvedLinks = recurseLinks(
                    this.app.metadataCache.resolvedLinks[activeFile.path],
                    {[activeFile.path]: 1}
                );

                const settings = this.settings;
                class VerifyPromptModal extends Modal {
                    constructor(app: App, onSubmit: () => void, onCancel: () => void) {
                        super(app);
                        this.setTitle(`Publishing ${activeFile!.path} to @${settings.bskyHandle}`);

                        <div $parent={this.contentEl}>
                            <h1>
                                Publishing {activeFile!.path} to @{settings.bskyHandle}
                            </h1>
                            <p>
                                This will make the following files PUBLICALLY VISIBLE ON THE AT PROTOCOL:
                                <ul>
                                    {Object.entries(allResolvedLinks).map(([k, v]) =>
                                        <li><b>{k}:</b> Linked to {v} times</li>
                                    )}
                                </ul>
                            </p>
                        </div>;

                        new Setting(this.contentEl)
                            .addButton(button =>
                                button
                                    .setButtonText('Submit')
                                    .setCta()
                                    .onClick(() => {
                                        this.close();
                                        onSubmit();
                                    }))
                            .addButton(button =>
                                button
                                    .setButtonText('Cancel')
                                    .setCta()
                                    .onClick(() => {
                                        this.close();
                                        onCancel();
                                    }));
                    }
                }

                new Promise<void>((resolve, reject) => {
                    new VerifyPromptModal(this.app, () => {
                        // submit
                        resolve();
                    }, () => {
                        // cancel
                        reject();
                    }).open();
                }).then(async () => {
                    await doShare(await this.agent, this, Object.keys(allResolvedLinks), fileView as MarkdownView);
                });
            }
        });

        // // Perform additional things with the ribbon
        // ribbonIconEl.addClass('my-plugin-ribbon-class');

        // // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        // const statusBarItemEl = this.addStatusBarItem();
        // statusBarItemEl.setText('Status Bar Text');

        // // This adds a simple command that can be triggered anywhere
        // this.addCommand({
        //     id: 'open-sample-modal-simple',
        //     name: 'Open sample modal (simple)',
        //     callback: () => {
        //         new SampleModal(this.app).open();
        //     }
        // });

        // // This adds an editor command that can perform some operation on the current editor instance
        // this.addCommand({
        //     id: 'sample-editor-command',
        //     name: 'Sample editor command',
        //     editorCallback: (editor: Editor, view: MarkdownView | MarkdownFileInfo) => {
        //         console.log(editor.getSelection());
        //         editor.replaceSelection('Sample Editor Command');
        //     }
        // });
        // // This adds a complex command that can check whether the current state of the app allows execution of the command
        // this.addCommand({
        //     id: 'open-sample-modal-complex',
        //     name: 'Open sample modal (complex)',
        //     checkCallback: (checking: boolean) => {
        //         // Conditions to check
        //         const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
        //         if (markdownView) {
        //             // If checking is true, we're simply "checking" if the command can be run.
        //             // If checking is false, then we want to actually perform the operation.
        //             if (!checking) {
        //                 new SampleModal(this.app).open();
        //             }
        //
        //             // This command will only show up in Command Palette when the check function returns true
        //             return true;
        //         }
        //     }
        // });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // // Using this function will automatically remove the event listener when this plugin is disabled.
        // this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
        //     console.log('click', evt);
        // });

        // // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, {
            passphrase: generatePassphrase(16*8), // 16 bytes, 128 bits
        }, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText('Woah!');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('@handle')
            .setDesc(
                'Your AT Protocol handle used for synchronization. ' +
                'It\'s the same as your Bluesky handle.')
            .addText(text => text
                .setPlaceholder('peepance.bsky.social')
                .setValue(this.plugin.settings.bskyHandle ?? '')
                .onChange(async (value) => {
                    this.plugin.settings.bskyHandle = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Repository Passphrase')
            .setDesc('The passphrase to encrypt your repository with. Choose a secure one!')
            .addText(text => text
                .setValue(this.plugin.settings.passphrase ?? '')
                .onChange(async (value) => {
                    this.plugin.settings.passphrase = value;
                    await this.plugin.saveSettings();
                }));

        // TODO: add 'trashed' records to atproto repo so this is less flaky
        new Setting(containerEl)
            .setName('Push: Delete files not at source')
            .setDesc('Whether or not to delete files in the ATProto repo if they are deleted locally')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteMissingRemoteFiles)
                .onChange(async (value) => {
                    this.plugin.settings.deleteMissingRemoteFiles = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Pull: Delete files not at destination')
            .setDesc('Whether or not to trash files locally if they are not found in the ATProto repo')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteMissingLocalFiles)
                .onChange(async (value) => {
                    this.plugin.settings.deleteMissingLocalFiles = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Sync: Don\'t overwrite newer files')
            .setDesc(
                'Whether or not to overwrite files in the ATProto repo if ' +
                ' the version in the repo is newer than what exists locally')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.dontOverwriteNewFiles)
                .onChange(async (value) => {
                    this.plugin.settings.dontOverwriteNewFiles = value;
                    await this.plugin.saveSettings();
                }));

    }
}
