import { decode as decodeCbor, encode as encodeCbor } from "cbor-x";

class DefaultWeakMap<K extends WeakKey, V> extends WeakMap<K, V> {
    constructor(private readonly defaultFactory: (key: K) => V) {
        super();
    }
    /**
     * @returns a specified element.
     */
    get(key: K): V {
        let value = super.get(key);
        if (value) return value;
        value = this.defaultFactory(key);
        super.set(key, value);
        return value;
    }
}

class CborSettings {
    arr: CborProperty[] = []
    get(key: number): Partial<CborProperty> {
        return this.arr[key] ??= {
            propertyName: undefined!,
            key
        };
    }
}

export interface CborProperty {
    propertyName: string;
    key: number;
    deserializer?: typeof CborEntity;
}

const configs = new DefaultWeakMap<NewableFunction, CborSettings>(() => new CborSettings());

// NB: CANNOT USE CONFIGS STATICALLY!!! unless we migrate to a function again. and that doesnt give us 
// any benefits.
export class CborEntity<T extends CborEntity<T>> {
    /** Serialization constructor */
    constructor(input: Omit<T, keyof CborEntity<T>>) {
        // input is a plain object
        Object.assign(this, input);
    }

    toCbor(): Uint8Array {
        const output: unknown[] = [];

        for (const x of configs.get(this.constructor).arr) {
            if (x === undefined) continue;

            output[x.key] = (this as Record<string, unknown>)[x.propertyName];
        }

        return encodeCbor(output);
    }
}

export function fromCbor<T extends CborEntity<T>>(
    entity: new (input: Omit<T, keyof CborEntity<T>>) => T,
    input: Uint8Array | ArrayBuffer | ArrayLike<unknown>
) {
    const instance = new entity({} as Omit<T, keyof CborEntity<T>>);

    if (input instanceof ArrayBuffer && !(input instanceof Uint8Array)) {
        input = new Uint8Array(input);
    }

    // input is CBOR Uint8Array
    if (input instanceof Uint8Array) {
        input = decodeCbor(input);
    }

    // input is a deserialized array
    unpack(instance, input as ArrayLike<unknown>);

    return instance;
}

function unpack(self: CborEntity<any>, input: ArrayLike<unknown>) {
    for (const x of configs.get(self.constructor).arr) {
        if (x === undefined) continue;

        let value = input[x.key];
        if (x.deserializer) {
            value = new x.deserializer(value as Array<unknown>);
        }
        (self as unknown as Record<string, unknown>)[x.propertyName] = value;
    }
}

export function key<This extends CborEntity<any>, PropertyName extends keyof This & string>(key: number): any;
export function key<This extends CborEntity<any>, PropertyName extends keyof This & string>(props: Omit<CborProperty, 'propertyName'>): any;
export function key<This extends CborEntity<any>, PropertyName extends keyof This & string>(keyOrProps: number | Omit<CborProperty, 'propertyName'>): any {
    if (typeof keyOrProps === 'number') {
        keyOrProps = { key: keyOrProps };
    }
    return function (target: This, propertyName: PropertyName): void {
        Object.assign(
            configs.get(target.constructor).get(keyOrProps.key),
            {
                ...keyOrProps,
                propertyName: propertyName
            }
        );
    };
}
