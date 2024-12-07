/* eslint-disable */
// This file is automatically generated, do not edit!

import "@atcute/client/lexicons";

declare module "@atcute/client/lexicons" {
    namespace IoGithubObsidatFile {
        /** An Obsidian file. Its file path, vault name, and contents are encrypted using a randomly generated passphrase. The rkey is also randomly generated (base32) but unique per-file per-vault. */
        interface Record {
            $type: "io.github.obsidat.file";
            /** The AGE encrypted file contents. */
            body: At.Blob;
            /** The AGE encrypted CBOR record containing file metadata following the FileMetadata interface specification in `src\sync\index.ts` */
            metadata: At.Bytes;
            /** This record's creation date. */
            recordCreatedAt: string;
            /** A newer version file always overrides an older version file. `undefined` is the lowest version. */
            version?: number;
        }
    }

    namespace IoGithubObsidatGeneric {
        /** A generic JSON array value, serialized as an array of key-value pairs. */
        interface Array {
            [Brand.Type]?: "io.github.obsidat.generic#array";
            /** The values that comprise this array. */
            value: IoGithubObsidatGeneric.Generic[];
        }
        /** Represents a union of generic JSON-compatible types. */
        interface Generic {
            [Brand.Type]?: "io.github.obsidat.generic#generic";
            /** The value. A value of `undefined` is represented by a property with a value missing or `undefined`. */
            value?: Brand.Union<
                | IoGithubObsidatGeneric.Array
                | IoGithubObsidatGeneric.Null
                | IoGithubObsidatGeneric.Number
                | IoGithubObsidatGeneric.Object
                | IoGithubObsidatGeneric.String
            >;
        }
        /** Represents a key-value mapping whose value is a union of generic JSON-compatible types. */
        interface KeyValuePair {
            [Brand.Type]?: "io.github.obsidat.generic#keyValuePair";
            /** The key for this key-value mapping. */
            key: string;
            /** The value for this key-value mapping. A value of `undefined` is represented by a property with a value missing or `undefined`. */
            value?: Brand.Union<
                | IoGithubObsidatGeneric.Array
                | IoGithubObsidatGeneric.Null
                | IoGithubObsidatGeneric.Number
                | IoGithubObsidatGeneric.Object
                | IoGithubObsidatGeneric.String
            >;
        }
        /** A generic null value, boxed for unions. This is a marker type, and only its `$type` property is meaningful. */
        interface Null {
            [Brand.Type]?: "io.github.obsidat.generic#null";
        }
        /** A generic JSON number value, serialized as a string. */
        interface Number {
            [Brand.Type]?: "io.github.obsidat.generic#number";
            /** The number, encoded in JSON number format. */
            value: string;
        }
        /** A generic JSON object value, serialized as an array of key-value pairs. */
        interface Object {
            [Brand.Type]?: "io.github.obsidat.generic#object";
            /** The key-value pairs that comprise this object. */
            value: IoGithubObsidatGeneric.KeyValuePair[];
        }
        /** A generic string value, boxed for unions. */
        interface String {
            [Brand.Type]?: "io.github.obsidat.generic#string";
            /** The string. */
            value: string;
        }
        /** Represents a key-value mapping whose key is a string and whose value is an integer. */
        interface StringIntMapping {
            [Brand.Type]?: "io.github.obsidat.generic#stringIntMapping";
            /** The key for this key-value mapping. */
            key: string;
            /** The value for this key-value mapping. */
            value?: number;
        }
        /** A generic undefined value, boxed for unions. This is a marker type, and only its `$type` property is meaningful. Most unions are expected to use an optional property for representing `undefined`, however this type is also available for completeness. */
        interface Undefined {
            [Brand.Type]?: "io.github.obsidat.generic#undefined";
        }
    }

    namespace IoGithubObsidatPublicFile {
        /** An Obsidian file, publicly accessible with no encryption. Record Key is `lower(vaultName) || ':' || lower(filePath)` */
        interface Record {
            $type: "io.github.obsidat.publicFile";
            /** The contents of the file. */
            body: At.Blob;
            /** The file's creation or modification date. */
            fileLastCreatedOrModified: string;
            /** The path to the file inside the vault. */
            filePath: string;
            /** This record's creation date. */
            recordCreatedAt: string;
            /** The name of the vault the file is stored in. */
            vaultName: string;
            /** Aliases for the file, if any. */
            aliases?: string[];
            /** Link to a local or remote cover image for the file, if any. */
            cover?: string;
            /** File description, if any. */
            description?: string;
            /** The Markdown frontmatter, serialized as an array of keyValuePair objects. Will be `undefined` for non-Markdown or non-textual files. */
            frontmatter?: IoGithubObsidatGeneric.KeyValuePair[];
            /** Rendered HTML contents of the file, for Markdown files. */
            html?: string;
            /** A list of pages this page links to, alongside the link count. */
            resolvedLinks?: IoGithubObsidatPublicFile.PageAndLinkCount[];
            /** Tags for the file, if any. */
            tags?: string[];
            /** A descriptive title for the file, if any. */
            title?: string;
            /** A list of unresolved links from this page, alongside the link count. */
            unresolvedLinks?: IoGithubObsidatPublicFile.PageAndLinkCount[];
        }
        interface PageAndLinkCount {
            [Brand.Type]?: "io.github.obsidat.publicFile#pageAndLinkCount";
            /** The amount of links to the page present. */
            linkCount: number;
            /** The page that is being linked to. */
            page: string;
        }
    }

    namespace IoGithubObsidatVault {
        /** An Obsidian vault. The key is the scrypt hash of the passphrase + vault name as salt, in base32. Uses scrypt parameters { N: 2 ** 18, r: 8, p: 1, dkLen: 32 } */
        interface Record {
            $type: "io.github.obsidat.vault";
            /** The AGE encrypted CBOR record containing vault metadata following the VaultMetadata interface specification in `src\sync\index.ts` */
            metadata: At.Bytes;
            /** The vault's name. */
            name: string;
            /** This record's creation date. */
            recordCreatedAt: string;
            /** The vault's creation date. */
            vaultCreatedAt: string;
        }
    }

    interface Records {
        "io.github.obsidat.file": IoGithubObsidatFile.Record;
        "io.github.obsidat.publicFile": IoGithubObsidatPublicFile.Record;
        "io.github.obsidat.vault": IoGithubObsidatVault.Record;
    }

    interface Queries {}

    interface Procedures {}
}
