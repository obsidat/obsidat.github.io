import { glob } from 'glob';
import { spawn } from 'child-process-promise';

(async () => {   
    const command = process.argv.slice(2);
    if (command.length === 0) {
        console.log('No command given to run.');
        process.exit(1);
        return;
    }

    const commands = await lib(command);

    console.log('>', ...commands)
    
    const cp = spawn(commands[0], commands.slice(1), {
        stdio: 'inherit'
    });

    process.on('exit', function() {
        cp.childProcess.kill('SIGHUP');
    });

    await cp;

    async function lib(args: string[]) {
        const outArgs: string[] = [];

        for (const arg of args) {
            if (arg.indexOf('*') > -1) {
                outArgs.push(...await glob(arg));
            } else {
                outArgs.push(arg);
            }
        }

        return outArgs;
    };
})();