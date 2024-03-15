import { format, formatWithOptions, inspect } from "util";

export default class Logger {
    #indent: number = 0;

    constructor(indent: number = 0) {
        this.#indent = indent;
    }

    private get indentation() {
        return '    '.repeat(this.#indent);
    }

    blank() {
        console.log('');
    }

    log(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.log(indented);
    }

    error(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.error(indented);
    }

    warn(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.warn(indented);
    }

    info(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.info(indented);
    }

    debug(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.debug(indented);
    }

    trace(...params: unknown[]) {
        const formatted = formatWithOptions({ depth: null, showHidden: true, colors: true }, ...params);
        const indented = formatted.split('\n').map(part => `${this.indentation}${part}`).join('\n');
        console.trace(indented);
    }

    public get indented(): Logger {
        return new Logger(this.#indent + 1);
    }

    public get unindented(): Logger {
        return new Logger(Math.max(this.#indent - 1, 0));
    }

    public withIndented<T>(fn: (logger: Logger) => T): T {
        return fn(this.indented);
    }
}
