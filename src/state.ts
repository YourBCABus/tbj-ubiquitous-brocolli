import syncAction, { ActionType } from "./actions";
import TeacherEntry from "./basic-structs";
import EurekaContext, { GetTeachersResult, getReportTo, getTeachers, setReportTo } from "./eureka";
import SheetContext from "./google";
import { SKIP_ROWS } from "./rowlookup";


type Id = string;

export default class BrocolliState {
    #eurekaContext: EurekaContext;
    #sheetContext: SheetContext;
    #teachers: Map<Id, TeacherEntry>;

    #lastSync: Date;

    private constructor(eurekaContext: EurekaContext, sheetContext: SheetContext, teachers: Map<Id, TeacherEntry>) {
        this.#eurekaContext = eurekaContext;
        this.#sheetContext = sheetContext;
        this.#teachers = teachers;

        this.#lastSync = new Date(0);
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

    private async pullData(prefix: string): Promise<{ sheetData: string[][], eurekaTeachers: GetTeachersResult, eurekaReportTo: string }> {
        console.log(prefix + "Pulling data from sheet and eureka");

        const sheetData = await this.#sheetContext.getSheetData();
        console.info(prefix + "    Got sheet data");


        const eurekaTeachers = await getTeachers(this.#eurekaContext);
        console.info(prefix + `    Got ${eurekaTeachers.length} teachers from Improved Eureka`);

        const eurekaReportTo = await getReportTo(this.#eurekaContext);
        console.info(prefix + `    Got reportTo \`${eurekaReportTo}\` from Improved Eureka`);

        return { sheetData, eurekaTeachers, eurekaReportTo };
    }

    private async doNonCreate(prefix: string, actions: [ActionType, TeacherEntry][]) {
        console.info(`${prefix}Performing ${actions.length} non-create actions`);
        const actionPromises = actions.map(async ([actionType, teacher]) => [
            await syncAction(this.#eurekaContext, actionType, teacher),
            [actionType, teacher],
        ]);
        const actionResults = await Promise.allSettled(actionPromises);
        console.info(`${prefix}    Performed ${actionResults.length} non-create actions`);

        return actionResults;
    }
    private async doCreate(prefix: string, newTeacherList: TeacherEntry[]) {
        console.info(`${prefix}Creating ${newTeacherList.length} new teachers`);
        const createPromises = newTeacherList.map(async teacher => {
            const teacherResult = await syncAction(this.#eurekaContext, ActionType.CREATE_TEACHER, teacher);
            this.#teachers.set(teacher.id!, teacher);
            [
                teacherResult,
                [ActionType.CREATE_TEACHER, teacher],
            ]
        });
        const createResults = await Promise.allSettled(createPromises);
        console.info(`${prefix}    Created ${createResults.length} new teachers`);

        return createResults;
    }

    private async logFailedActions(
        prefix: string,
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
            console.error(prefix + "Some non-create actions failed:");
            for (const [action, teacher] of failedActions) {
                console.error(`${prefix}    Action failed: ${action} for`, teacher);
            }
        }

        if (failedCreates.length > 0) {
            console.error(prefix + "Some teachers failed to create:");
            for (const [result, teacher] of failedCreates) {
                console.error(prefix + "    Create failed for", teacher, ':', result);
            }
        }
    }

    public async sync() {
        try {
            const INDENT = "    ";
            const INDENT_2 = INDENT + INDENT;
            const INDENT_3 = INDENT_2 + INDENT;
    
            const start = Date.now();
            console.info(`Starting sync (${(start - this.#lastSync.getTime()) / 1000} seconds after last sync)`);
    
            console.info();
            console.info(INDENT + "Updating sheet id..");
            await this.#sheetContext.updateSheetId(this.#eurekaContext);
    
    
            console.log("\n");
            const { sheetData, eurekaTeachers, eurekaReportTo } = await this.pullData(INDENT);
            const dataFetchTime = Date.now();
    
    
            console.info('\n');
            console.log(INDENT + "Internal updates and resolution");
    
            const newTeachers: Set<TeacherEntry> = new Set();
            const pendingTeachers: Set<Id> = new Set();
            const pendingRows: Set<number> = new Set();
    
            const actions: [ActionType, TeacherEntry][] = [];
    
            console.info(INDENT_2 + "Performing easy teacher updates");
            for (let rowIdx = SKIP_ROWS; rowIdx < sheetData.length; rowIdx++) {
                const row = sheetData[rowIdx];
                const rowIsEmpty = row.slice(0, 3).every(cell => !cell);
                if (rowIsEmpty) continue;
    
                const homeTeacher = [...this.#teachers.values()].find(t => t.home.row === rowIdx);
    
                if (!homeTeacher) {
                    pendingRows.add(rowIdx);
                    continue;
                }
                if (homeTeacher.rowMatchesLax(row)) {
                    const updateActions = homeTeacher.update(row).map(actionType => [actionType, homeTeacher] as [ActionType, TeacherEntry]);
                    actions.push(...updateActions);
                    continue;
                } else {
                    const id = homeTeacher.id;
                    if (!id) throw new Error('Teacher in map has no ID');
    
                    pendingRows.add(rowIdx);
                    pendingTeachers.add(id);
                }
            }
            console.info(`${INDENT_3}Performed ${this.#teachers.size - pendingTeachers.size} easy teacher updates`);
    
            let staleTeachers = 0;
            console.info(INDENT_2 + "Performing confusing teacher updates");
            for (const teacher of pendingTeachers) {
                const thisTeacher = this.#teachers.get(teacher);
                if (!thisTeacher) throw new Error('Teacher in pendingTeachers not in map');
    
                const rowRankings = [...pendingRows.values()]
                    .map(rowIdx => [rowIdx, thisTeacher.rowMatchScore(sheetData[rowIdx])] as const) // Get the match score for the relevant row
                    .sort(([_, a], [__, b]) => b - a) // Sort descending by match score
                    .map(([rowIdx, _]) => rowIdx); // Get the row index
    
                
                if (rowRankings.length === 0) {
                    staleTeachers++;
                    continue;
                }
    
                thisTeacher.home.row = rowRankings[0];
                pendingRows.delete(rowRankings[0]);
                pendingTeachers.delete(teacher);
    
                const updateActions = thisTeacher
                    .update(sheetData[thisTeacher.home.row])
                    .map(actionType => [actionType, thisTeacher] as [ActionType, TeacherEntry]);
    
                actions.push(...updateActions);
            }
            console.info(`${INDENT_3}Performed confusing teacher updates, ${staleTeachers} stale teachers`);
    
            
            console.info(INDENT_2 + "Updating reportTo if neccessary");
            const sheetReportTo = sheetData[2][4]?.trim();
            if (sheetReportTo !== eurekaReportTo && sheetReportTo) {
                console.info(INDENT_3 + "reportTo change detected");
                console.info(INDENT_3 + `Updating reportTo from \`${eurekaReportTo}\` to \`${sheetReportTo}\``);
                setReportTo(this.#eurekaContext, sheetReportTo);
            } else {
                console.info(INDENT_3 + "reportTo unchanged");
            }
            const reportToTime = Date.now();
    
    
            console.info(INDENT_2 + "Creating and matching 'new' teachers");
            for (const rowIdx of pendingRows) {
                const row = sheetData[rowIdx];
                const newTeacher = TeacherEntry.create(row, rowIdx);
                if (!newTeacher) {
                    console.warn(INDENT_3 + `Failed to create teacher from row`, row);
                    console.warn(INDENT_3 + `Skipping row ${rowIdx}`);
                    pendingRows.delete(rowIdx);
                    continue;
                }
    
                const matchingEurekaTeacher = eurekaTeachers.find(t => {
                    const firstNameMatch = t.name.first === newTeacher.firstName;
                    const lastNameMatch = t.name.last === newTeacher.lastName;
                    const honorificMatch = t.name.honorific.toLowerCase().replace('.', '') === newTeacher.honorific.toLowerCase().replace('.', '');
    
                    return firstNameMatch && lastNameMatch && honorificMatch;
                });
                if (matchingEurekaTeacher) {
                    console.info(INDENT_3 + `Found matching teacher ${newTeacher.formattedName}`);
                    newTeacher.id = matchingEurekaTeacher.id;
    
                    actions.push([ActionType.CHANGE_TEACHER_ABSENCE, newTeacher]);
                    this.#teachers.set(matchingEurekaTeacher.id, newTeacher);
                    continue;
                }
    
                console.info(INDENT_3 + `Created teacher ${newTeacher.formattedName}`);
                newTeachers.add(newTeacher);
            }
            console.info(INDENT_3 + `Created ${newTeachers.size} 'new' teachers and matched ${pendingRows.size - newTeachers.size} teachers`);
    
            const diffResolveTime = Date.now();
    
            console.info('\n');
            console.log(INDENT + "To Eureka");
            const actionResults = await this.doNonCreate(INDENT_2, actions);
    
            const newTeacherList = [...newTeachers.values()];
            const createResults = await this.doCreate(INDENT_2, newTeacherList);
    
            this.logFailedActions(
                INDENT_2,
                { results: actionResults, actions },
                { results: createResults, newTeachers: newTeacherList },
            );
    
            const end = Date.now();
    
            const sheetFetchDuration = dataFetchTime - start;
            const diffResolveDuration = diffResolveTime - dataFetchTime;
            const eurekaSyncDuration = end - diffResolveTime;
    
            const totalDuration = end - start;
    
            console.log("\n\nSummary");
            console.info(`Sync complete in ${totalDuration}ms (${sheetFetchDuration}ms data fetch, ${diffResolveDuration}ms diff resolve, ${eurekaSyncDuration}ms eureka sync)`);
    
            this.#lastSync = new Date(end);
        } catch (e) {
            console.error('Sync failed:', e);
        }
    }
}
