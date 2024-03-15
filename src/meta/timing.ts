export default class TimingCtx {
    #start?: number;
    #dataFetch?: number;

    #resolve: {
        easyUpdatesDone?: number;
        confusingUpdatesDone?: number;
        reportToDone?: number;
        creation?: number;
    } = {};

    #eurekaSync?: number;
    #end?: number;

    public get startTime() { return this.#start; }
    start() {
        if (this.#start) {
            throw new Error('TimingCtx already started');
        }
        this.#start = Date.now();
    }

    dataFetch() {
        if (this.#dataFetch) {
            throw new Error('dataFetch already called');
        }
        this.#dataFetch = Date.now();
    }

    easyUpdatesDone() {
        if (this.#resolve.easyUpdatesDone) {
            throw new Error('easyUpdatesDone already called');
        }
        this.#resolve.easyUpdatesDone = Date.now();
    }

    confusingUpdatesDone() {
        if (this.#resolve.confusingUpdatesDone) {
            throw new Error('confusingUpdatesDone already called');
        }
        this.#resolve.confusingUpdatesDone = Date.now();
    }

    reportToDone() {
        if (this.#resolve.reportToDone) {
            throw new Error('reportToDone already called');
        }
        this.#resolve.reportToDone = Date.now();
    }

    creationDone() {
        if (this.#resolve.creation) {
            throw new Error('creation already called');
        }
        this.#resolve.creation = Date.now();
    }

    eurekaSyncDone() {
        if (this.#eurekaSync) {
            throw new Error('eurekaSync already called');
        }
        this.#eurekaSync = Date.now();
    }

    public get endTime() { return this.#end; }
    end() {
        if (this.#end) {
            throw new Error('end already called');
        }
        this.#end = Date.now();
    }

    public get summary() {
        const totalDuration = this.#end! - this.#start!;
        const sheetFetchDuration = this.#dataFetch! - this.#start!;
        const diffResolveDuration = this.#resolve.creation! - this.#dataFetch!;
        const eurekaSyncDuration = this.#eurekaSync! - this.#resolve.creation!;

        return `Sync complete in ${totalDuration}ms (${sheetFetchDuration}ms data fetch, ${diffResolveDuration}ms diff resolve, ${eurekaSyncDuration}ms eureka sync)`;
    }
}
