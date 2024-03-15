import TimingCtx from "../meta/timing";
import syncAction, { ActionType } from "../actions";
import TeacherEntry from "../consts/basic-structs";
import EurekaContext, { GetTeachersResult, getReportTo, getTeachers } from "./eureka";
import SheetContext from "./google";
import Logger from "../meta/logging";
import Resolver from "./resolver";


type Id = string;

export default class BrocolliState {
    #eurekaContext: EurekaContext;
    #sheetContext: SheetContext;
    #teachers: Map<Id, TeacherEntry>;

    #lastSync: Date;

    #stateLock: Promise<void> = Promise.resolve();

    private constructor(eurekaContext: EurekaContext, sheetContext: SheetContext, teachers: Map<Id, TeacherEntry>) {
        this.#eurekaContext = eurekaContext;
        this.#sheetContext = sheetContext;
        this.#teachers = teachers;

        this.#lastSync = new Date();
    }

    public static async create(): Promise<BrocolliState> {

        const CLIENT_ID = process.env.EUREKA_CLIENT_ID;
        const CLIENT_SECRET = process.env.EUREKA_CLIENT_SECRET;
        const URL = process.env.EUREKA_URL;

        if (!CLIENT_ID || !CLIENT_SECRET || !URL) throw new Error('Missing EUREKA env vars');

        const eurekaContext = new EurekaContext(CLIENT_ID, CLIENT_SECRET, URL);

        const sheetContext = await SheetContext.create("");
        await sheetContext.updateSheetId(eurekaContext);

        return new BrocolliState(eurekaContext, sheetContext, new Map());
    }

    private async pullData(
        logger: Logger,
    ): Promise<{ sheetData: string[][], eurekaTeachers: GetTeachersResult, eurekaReportTo: string }> {
        const sheetData = await this.#sheetContext.getSheetData();
        logger.info("Got sheet data");

        const eurekaTeachers = await getTeachers(this.#eurekaContext);
        logger.info(
            "Got %O teachers from Improved Eureka",
            eurekaTeachers.length,
        );

        const eurekaReportTo = await getReportTo(this.#eurekaContext);
        logger.info(
            "Got reportTo %O from Improved Eureka",
            eurekaReportTo,
        );

        return { sheetData, eurekaTeachers, eurekaReportTo };

    }

    private async doNonCreate(logger: Logger, actions: [ActionType, TeacherEntry][]) {
        logger.info(
            "Performing %O non-create actions",
            actions.length,
        );
        const actionPromises = actions.map(async ([actionType, teacher]) => [
            await syncAction(this.#eurekaContext, actionType, teacher),
            [actionType, teacher],
        ]);
        const actionResults = await Promise.allSettled(actionPromises);
        logger.indented.info(
            "Performed %O non-create actions",
            actionResults.length,
        );

        return actionResults;
    }

    private async doCreate(logger: Logger, newTeacherList: TeacherEntry[]) {
        logger.info(
            "Creating %O new teachers",
            newTeacherList.length,
        );
        const createPromises = newTeacherList.map(async teacher => {
            const teacherResult = await syncAction(this.#eurekaContext, ActionType.CREATE_TEACHER, teacher);
            this.#teachers.set(teacher.id!, teacher);
            [
                teacherResult,
                [ActionType.CREATE_TEACHER, teacher],
            ]
        });
        const createResults = await Promise.allSettled(createPromises);
        logger.indented.info(
            "Created %O new teachers",
            createResults.length,
        );

        return createResults;
    }

    private async logFailedActions(
        logger: Logger,
        nonCreate: {
            results: PromiseSettledResult<unknown>[],
            actions: [ActionType, TeacherEntry][],
        },
        create: {
            results: PromiseSettledResult<unknown>[],
            newTeachers: TeacherEntry[],
        }
    ) {
        const failedActions = nonCreate.results.flatMap((result, idx) => {
            if (result.status === 'rejected') return [nonCreate.actions[idx]]
            else return [];
        });
        const failedCreates = create.results.flatMap((result, idx) => {
            if (result.status === 'rejected') return [[result.reason, create.newTeachers[idx]] as const];
            else return [];
        });


        if (failedActions.length > 0) {
            logger.error("Some non-create actions failed:");
            for (const [action, teacher] of failedActions) {
                logger.indented.error(
                    "Action failed: %O for",
                    action,
                    teacher,
                );
            }
        }

        if (failedCreates.length > 0) {
            logger.error("Some teachers failed to create:");
            for (const [result, teacher] of failedCreates) {
                logger.indented.error("Create failed for", teacher, ':', result);
            }
        }
    }

    public async getDiffs(logger: Logger, timingCtx?: TimingCtx) {
        try {
            timingCtx?.start();
            const timeDiff = ((timingCtx?.startTime ?? 0) - this.#lastSync.getTime()) / 1000;
            logger.info(
                "Starting sync (%O seconds after last sync)",
                timeDiff,
            );
            logger.blank();

            logger.indented.info("Updating sheet id..");
            await this.#sheetContext.updateSheetId(this.#eurekaContext);
            logger.blank();

            logger.indented.log("Pulling data from sheet and eureka");
            const { sheetData, eurekaTeachers, eurekaReportTo } = await this.pullData(logger.indented.indented);
            timingCtx?.dataFetch();

            logger.indented.log("Reverting internal teacher state");
            this.#teachers.forEach(teacher => {
                const eurekaTeacher = eurekaTeachers.find(t => t.id === teacher.id);
                if (!eurekaTeacher) return;
                teacher.revertToEureka(eurekaTeacher);
            });

            logger.indented.log("Internal updates and resolution");
            const resolver = new Resolver(
                logger.indented.indented,
                { sheetData, eurekaTeachers, eurekaReportTo },
                this.#eurekaContext,
                this.#teachers,
                timingCtx,
            );
            resolver.performEasyUpdates();
            resolver.performConfusingUpdates();
            resolver.updateReportTo();
            resolver.createAndMatchNewTeachers();

            return resolver.resolvedData;
        } catch (e) {
            logger.error('Sync failed — data pull & diff resolve:', e);
            return;
        }
    }
    public async performUpdates(
        { actions, newTeachers }: {
            actions: [ActionType, TeacherEntry][],
            newTeachers: Set<TeacherEntry>,
        },
        _logger: Logger,
        timingCtx?: TimingCtx,
        forceWrite?: boolean,
    ) {
        const logger = _logger.indented;
        try {
            const lastSheetChange = this.#sheetContext.lastUpdate.getTime();
            const secondsPassedSinceLastSheetChange = (Date.now() - lastSheetChange) / 1000;

            // Write to eureka if it's been more than 10 minutes since the last
            // sheet change and forceWrite is `undefined` or if forceWrite is
            // `true`
            /**
             * Write to eureka if
             * - it's been more than 10 minutes since the last sheet change and
             *   `forceWrite` is `undefined`
             * - if `forceWrite` is `true`
             */
            const willSync = forceWrite ?? secondsPassedSinceLastSheetChange > 60 * 10;
            logger.blank();

            if (willSync) {
                const actionResults = await this.doNonCreate(
                    logger.indented,
                    actions,
                );
        
                const newTeacherList = [...newTeachers.values()];
                const createResults = await this.doCreate(
                    logger.indented,
                    newTeacherList,
                );
        
                this.logFailedActions(
                    logger.indented,
                    { results: actionResults, actions },
                    { results: createResults, newTeachers: newTeacherList },
                );
            } else {
                _logger.info("Skipping writing data due to recent sheet changes");
                const secondsRemaining = 60 * 10 - secondsPassedSinceLastSheetChange;
                _logger.indented.info(
                    "Next data write in %O min %O sec",
                    Math.floor(secondsRemaining / 60),
                    Math.floor(secondsRemaining % 60),
                );
            }
    
            timingCtx?.end();
    
            logger.log("\n\nSummary");
            logger.indented.info(timingCtx?.summary);
    
            this.#lastSync = new Date(timingCtx?.endTime ?? Date.now());
        } catch (e) {
            logger.error('Sync failed — data update:', e);
        }
    }

    public async sync(
        logger: Logger,
        timingCtx?: TimingCtx,
        forceWrite?: boolean,
    ) {
        await this.#stateLock;
        const handler = new EventTarget();
        const newLock = new Promise<void>(resolve => {
            handler.addEventListener('SyncDone', () => resolve());
        });
        this.#stateLock = newLock;

        try {
            const diffs = await this.getDiffs(
                logger,
                timingCtx,
            );
            if (!diffs) {
                logger.error('Sync failed');
                return;
            }
    
            await this.performUpdates(
                diffs,
                logger,
                timingCtx,
                forceWrite,
            );
        } finally {
            handler.dispatchEvent(new Event('SyncDone'));
        }
    }

    public get summary() {
        let summary = "";
        const longestFullName = Math.max(
            ...[...this.#teachers.values()]
                .filter(t => t.absenceState.isAbsentAtAll)
                .map(t => t.prettyFullName.length),
        );

        for (const teacher of this.#teachers.values()) {
            if (teacher.absenceState.isAbsentAtAll) {
                summary += `${teacher.prettyFullName.padEnd(longestFullName, " ")} - ${teacher.absenceState}\n`;
            }
        }
        return summary;
    }

    public get lock() {
        return this.#stateLock.then(() => void 0);
    }
}
