import syncAction, { ActionType } from "./actions";
import TeacherEntry from "./basic-structs";
import EurekaContext, { getTeachers } from "./eureka";
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

    public static async create(sheetId: string): Promise<BrocolliState> {
        const sheetContext = await SheetContext.create(sheetId);

        const CLIENT_ID = process.env.EUREKA_CLIENT_ID;
        const CLIENT_SECRET = process.env.EUREKA_CLIENT_SECRET;
        const URL = process.env.EUREKA_URL;

        if (!CLIENT_ID || !CLIENT_SECRET || !URL) throw new Error('Missing EUREKA env vars');

        const eurekaContext = new EurekaContext(CLIENT_ID, CLIENT_SECRET, URL);

        return new BrocolliState(eurekaContext, sheetContext, new Map());
    }

    public async sync() {
        const start = Date.now();
        console.info(`Starting sync (${(start - this.#lastSync.getTime()) / 1000} seconds after last sync)`);

        console.info("\nUpdating sheet id..");
        await this.#sheetContext.updateSheetId(this.#eurekaContext);


        console.log("\n\nFrom sheet and eureka");

        const sheetData = await this.#sheetContext.getSheetData();
        console.info("Got sheet data");

        const sheetFetchTime = Date.now();


        const eurekaTeachers = await getTeachers(this.#eurekaContext);
        console.info(`Got ${eurekaTeachers.length} teachers from Improved Eureka`);



        console.log("\n\nInternal updated and resolution");

        const newTeachers: Set<TeacherEntry> = new Set();
        const pendingTeachers: Set<Id> = new Set();
        const pendingRows: Set<number> = new Set();

        const actions: [ActionType, TeacherEntry][] = [];

        console.info("Performing easy teacher updates");
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
        console.info(`Performed ${this.#teachers.size - pendingTeachers.size} easy teacher updates`);

        let staleTeachers = 0;
        console.info("Performing confusing teacher updates");
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
        console.info(`Performed confusing teacher updates, ${staleTeachers} stale teachers`);


        console.info("Creating and matching 'new' teachers");
        for (const rowIdx of pendingRows) {
            const row = sheetData[rowIdx];
            const newTeacher = TeacherEntry.create(row, rowIdx);
            if (!newTeacher) {
                console.warn(`Failed to create teacher from row`, row);
                console.warn(`Skipping row ${rowIdx}`);
                pendingRows.delete(rowIdx);
                continue;
            }

            const matchingEurekaTeacher = eurekaTeachers.find(t => {
                const firstNameMatch = t.name.first === newTeacher.firstName;
                const lastNameMatch = t.name.last === newTeacher.lastName;
                const honorificMatch = t.name.honorific === newTeacher.honorific;

                return firstNameMatch && lastNameMatch && honorificMatch;
            });
            if (matchingEurekaTeacher) {
                console.log(`Found matching teacher ${newTeacher.formattedName}`);
                newTeacher.id = matchingEurekaTeacher.id;

                actions.push([ActionType.CHANGE_TEACHER_ABSENCE, newTeacher]);
                this.#teachers.set(matchingEurekaTeacher.id, newTeacher);
                continue;
            }

            console.log(`Created teacher ${newTeacher.formattedName}`);
            newTeachers.add(newTeacher);
        }
        console.info(`Created ${newTeachers.size} 'new' teachers and matched ${pendingRows.size - newTeachers.size} teachers`);

        const diffResolveTime = Date.now();


        console.log("\n\nTo Eureka");
        console.info(`Performing ${actions.length} non-create actions`);
        const newTeacherList = [...newTeachers.values()];
        const actionPromises = actions.map(async ([actionType, teacher]) => [
            await syncAction(this.#eurekaContext, actionType, teacher),
            [actionType, teacher],
        ]);
        const actionResults = await Promise.allSettled(actionPromises);
        console.info(`Performed ${actionResults.length} actions`);

        const actionResolveTime = Date.now();

        console.info(`Creating ${newTeacherList.length} new teachers`);
        const createPromises = newTeacherList.map(async teacher => {
            const teacherResult = await syncAction(this.#eurekaContext, ActionType.CREATE_TEACHER, teacher);
            this.#teachers.set(teacher.id!, teacher);
            [
                teacherResult,
                [ActionType.CREATE_TEACHER, teacher],
            ]
        });
        const createResults = await Promise.allSettled(createPromises);
        console.info(`Created ${createResults.length} new teachers`);

        const failedActions = actionResults.flatMap((result, idx) => result.status === 'rejected' ? [actions[idx]] : []);
        const failedCreates = createResults.flatMap((result, idx) => result.status === 'rejected' ? [[result.reason, newTeacherList[idx]] as const] : []);


        if (failedActions.length > 0) {
            for (const [action, teacher] of failedActions) {
                console.error(`Action failed: ${action} for`, teacher);
            }
        }

        if (failedCreates.length > 0) {
            for (const [result, teacher] of failedCreates) {
                console.error("Create failed for", teacher, ':', result);
            }
        }

        const end = Date.now();

        const sheetFetchDuration = sheetFetchTime - start;
        const diffResolveDuration = diffResolveTime - sheetFetchTime;
        const actionResolveDuration = actionResolveTime - diffResolveTime;
        const createDuration = end - actionResolveTime;
        const eurekaSyncDuration = actionResolveDuration + createDuration;

        const totalDuration = end - start;

        console.log("\n\nSummary");
        console.info(`Sync complete in ${totalDuration}ms (${sheetFetchDuration}ms sheet fetch, ${diffResolveDuration}ms diff resolve, ${eurekaSyncDuration}ms eureka sync)`);

        this.#lastSync = new Date(end);
    }
}