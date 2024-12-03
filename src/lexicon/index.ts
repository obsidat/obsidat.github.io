/* eslint-disable */
// This file is automatically generated, do not edit!

type ObjectOmit<T, K extends keyof any> = Omit<T, K>;

/** Handles type branding in objects */
export declare namespace Brand {
    /** Symbol used to brand objects, this does not actually exist in runtime */
    const Type: unique symbol;

    /** Get the intended `$type` field */
    type GetType<T extends { [Type]?: string }> = NonNullable<T[typeof Type]>;

    /** Creates a union of objects where it's discriminated by `$type` field. */
    type Union<T extends { [Type]?: string }> = T extends any
        ? T & { $type: GetType<T> }
        : never;

    /** Omits the type branding from object */
    type Omit<T extends { [Type]?: string }> = ObjectOmit<T, typeof Type>;
}

/** Base AT Protocol schema types */
export declare namespace At {
    /** CID string */
    type CID = string;

    /** DID of a user */
    type DID = `did:${string}`;

    /** User handle */
    type Handle = string;

    /** URI string */
    type Uri = string;

    /** Object containing a CID string */
    interface CIDLink {
        $link: CID;
    }

    /** Object containing a base64-encoded bytes */
    interface Bytes {
        $bytes: string;
    }

    /** Blob interface */
    interface Blob<T extends string = string> {
        $type: "blob";
        mimeType: T;
        ref: {
            $link: string;
        };
        size: number;
    }
}
export declare namespace IoGithubObsidatFile {
    /** An Obsidian file. Its file path, vault name, and contents are encrypted using a passphrase stored in the settings of the atproto-obsidian-sync Obsidian plugin. Record Key is blake3 hash of `filePath || ':' || vaultName || ':' || passphrase || ':' || salt` The salt is currently hardcoded in the plugin but this may change in the future. */
    interface Record {
        $type: "io.github.obsidat.file";
        /** The encrypted file contents. */
        body: IoGithubObsidatFile.EncryptedData;
        /** The file's creation or modification date. */
        fileLastCreatedOrModified: string;
        /** The encrypted file path and vault name in the form `vaultName || ':' || filepath` */
        path: IoGithubObsidatFile.InlineEncryptedData;
        /** This record's creation date. */
        recordCreatedAt: string;
    }
    /** A reference to a blob containing data encrypted using ACE Encryption */
    interface EncryptedData {
        [Brand.Type]?: "io.github.obsidat.file#encryptedData";
        /** The ACE textual header. */
        header: string;
        /** A cryptographically random, non-repeating initialization vector (IV). */
        nonce: At.Bytes;
        /** The blob containing the ciphertext. */
        payload: At.Blob;
    }
    /** A data field encrypted using ACE Encryption */
    interface InlineEncryptedData {
        [Brand.Type]?: "io.github.obsidat.file#inlineEncryptedData";
        /** The ACE textual header. */
        header: string;
        /** A cryptographically random, non-repeating initialization vector (IV). */
        nonce: At.Bytes;
        /** The ciphertext. */
        payload: At.Bytes;
    }
}

export declare namespace IoGithubObsidatGeneric {
    /** Represents a union of generic JSON-compatible types. */
    interface Generic {
        [Brand.Type]?: "io.github.obsidat.generic#generic";
        /** The value. A value of `undefined` is represented by a property with a value missing or `undefined`. */
        value?: Brand.Union<
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
    /** A generic JSON object or array value, serialized as a string. */
    interface Object {
        [Brand.Type]?: "io.github.obsidat.generic#object";
        /** The object or array, encoded in JSON format. */
        value: string;
    }
    /** A generic string value, boxed for unions. */
    interface String {
        [Brand.Type]?: "io.github.obsidat.generic#string";
        /** The string. */
        value: string;
    }
    /** A generic undefined value, boxed for unions. This is a marker type, and only its `$type` property is meaningful. Most unions are expected to use an optional property for representing `undefined`, however this type is also available for completeness. */
    interface Undefined {
        [Brand.Type]?: "io.github.obsidat.generic#undefined";
    }
}

export declare namespace IoGithubObsidatPublicFile {
    /** An Obsidian file, publicly accessible with no encryption. Record Key is blake3 hash of `filePath || ':' || vaultName` */
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
        /** The Markdown frontmatter, serialized as an array of keyValuePair objects. Will be `undefined` for non-Markdown or non-textual files. */
        frontmatter?: IoGithubObsidatGeneric.KeyValuePair[];
        /** A descriptive title for the file, if any. */
        title?: string;
    }
}

export declare namespace IoGithubObsidatVault {
    /** An Obsidian vault. */
    interface Record {
        $type: "io.github.obsidat.vault";
        /** The vault's name. */
        name: string;
        /** This record's creation date. */
        recordCreatedAt: string;
        /** The vault's creation date. */
        vaultCreatedAt: string;
    }
}

export declare interface Records {
    "io.github.obsidat.file": IoGithubObsidatFile.Record;
    "io.github.obsidat.publicFile": IoGithubObsidatPublicFile.Record;
    "io.github.obsidat.vault": IoGithubObsidatVault.Record;
}

export declare interface Queries {}

export declare interface Procedures {}
