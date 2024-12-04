import { parseArgs } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { parse as parseYaml } from 'yaml';
import { glob } from 'glob';

const { values: { input, output } } = parseArgs({
    options: {
        input: {
            type: "string",
            short: "i"
        },
        output: {
            type: "string",
            short: "o",
        },
    },
});

if (!input) {
    throw new Error('No input dickhead');
}

if (!output) {
    throw new Error('No output dickhead');
}

(async () => {
    await mkdir(output, { recursive: true });
    for (const entry of await glob(input)) {
        const yaml = await readFile(entry, 'utf-8');
        const parsed = parseYaml(yaml, {
            strict: true,
        });
        
        const dest = join(output, basename(entry, '.yml') + '.json');
        await writeFile(dest, JSON.stringify(parsed, null, 2));
    }
})();