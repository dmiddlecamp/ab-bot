import pino from 'pino';
import * as fs from 'fs';

class Logger {

    private logger: pino.Logger;
    constructor() {
        this.logger = pino({
            prettyPrint: {
                colorize: true,
                translateTime: true,
                ignore: 'pid,hostname'
            }
        }, pino.destination());

    }

    debug(msg: string, ...args: any[]): void {
        this.logger['debug'](msg, ...args);
    }

    info(msg: string, ...args: any[]): void {
        this.logger['info'](msg, ...args);
    }

    warn(msg: string, ...args: any[]): void {
        this.logger['warn'](msg, ...args);
    }

    error(msg: string, ...args: any[]): void {
        this.logger['error'](msg, ...args);
    }

    fatal(msg: string, ...args: any[]): void {
        this.logger['error'](msg, ...args);
    }

    writeToFile(x: any) {
        const s = JSON.stringify(x) + "\r\n";
        fs.appendFile('log/bot.log', s, _ => {});
    }
}

const logger = new Logger();
export = logger