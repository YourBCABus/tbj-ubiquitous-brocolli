import { ActionType } from "../actions";
import TeacherEntry from "../consts/basic-structs";
import EurekaContext, { GetTeachersResult, setReportTo } from "./eureka";
import Logger from "../meta/logging";
import { SKIP_ROWS } from "../consts/rowlookup";
import TimingCtx from "../meta/timing";

type Id = string;

export default class Resolver {
    public newTeachers = new Set<TeacherEntry>();
    public pendingTeachers = new Set<Id>();
    public pendingRows = new Set<number>();

    public actions: [ActionType, TeacherEntry][] = [];

    public staleTeachers = 0;

    public constructor(
        public readonly logger: Logger,
        public readonly data: {
            sheetData: string[][],
            eurekaTeachers: GetTeachersResult,
            eurekaReportTo: string,
        },

        private readonly eurekaCtx: EurekaContext,
        public readonly teachers: Map<Id, TeacherEntry>,
        public readonly timingCtx?: TimingCtx,
    ) {}

    public performEasyUpdates() {
        this.logger.info("Performing easy teacher updates");
        const logger = this.logger.indented;
        for (let rowIdx = SKIP_ROWS; rowIdx < this.data.sheetData.length; rowIdx++) {
            const row = this.data.sheetData[rowIdx];
            const rowIsEmpty = row.slice(0, 3).every(cell => !cell);
            if (rowIsEmpty) continue;

            const homeTeacher = [...this.teachers.values()].find(t => t.home.row === rowIdx);

            if (!homeTeacher) {
                this.pendingRows.add(rowIdx);
                continue;
            }
            if (homeTeacher.rowMatchesLax(row)) {
                const updateActions = homeTeacher.update(row).map(actionType => [actionType, homeTeacher] as [ActionType, TeacherEntry]);
                this.actions.push(...updateActions);
                continue;
            } else {
                const id = homeTeacher.id;
                if (!id) throw new Error('Teacher in map has no ID');

                this.pendingRows.add(rowIdx);
                this.pendingTeachers.add(id);
            }
        }
        logger.info(
            "Performed %O easy teacher updates",
            this.teachers.size - this.pendingTeachers.size,
        );
        this.timingCtx?.easyUpdatesDone();
    }

    public performConfusingUpdates() {
        this.logger.info("Performing confusing teacher updates");

        const logger = this.logger.indented;
        for (const teacher of this.pendingTeachers) {
            const thisTeacher = this.teachers.get(teacher);
            if (!thisTeacher) throw new Error('Teacher in pendingTeachers not in map');

            const rowRankings = [...this.pendingRows.values()]
                .map(rowIdx => [
                    rowIdx,
                    thisTeacher.rowMatchScore(this.data.sheetData[rowIdx]),
                ] as const) // Get the match score for the relevant row
                .sort(([_, a], [__, b]) => b - a) // Sort descending by match score
                .map(([rowIdx, _]) => rowIdx); // Get the row index

            
            if (rowRankings.length === 0) {
                this.staleTeachers++;
                continue;
            }

            thisTeacher.home.row = rowRankings[0];
            this.pendingRows.delete(rowRankings[0]);
            this.pendingTeachers.delete(teacher);

            const updateActions = thisTeacher
                .update(this.data.sheetData[thisTeacher.home.row])
                .map(actionType => [actionType, thisTeacher] as [ActionType, TeacherEntry]);

            this.actions.push(...updateActions);
        }
        logger.info(
            "Performed confusing teacher updates, %O stale teachers",
            this.staleTeachers,
        );
        this.timingCtx?.confusingUpdatesDone();
    }

    public updateReportTo() {
        this.logger.info("Updating reportTo if neccessary");

        const logger = this.logger.indented;
        const sheetReportTo = this.data.sheetData[2][4]?.trim();
        if (sheetReportTo !== this.data.eurekaReportTo && sheetReportTo) {
            logger.info("reportTo change detected");
            logger.info(
                "Updating reportTo from %O to %O",
                this.data.eurekaReportTo,
                sheetReportTo
            );
            setReportTo(this.eurekaCtx, sheetReportTo);
        } else {
            logger.info("reportTo unchanged");
        }
        this.timingCtx?.reportToDone();
    }

    public createAndMatchNewTeachers() {
        this.logger.info("Creating and matching 'new' teachers");

        const logger = this.logger.indented;
        for (const rowIdx of this.pendingRows) {
            const row = this.data.sheetData[rowIdx];
            const newTeacher = TeacherEntry.create(row, rowIdx);
            if (!newTeacher) {
                logger.warn(`Failed to create teacher from row`, row);
                logger.warn("Skipping row %O", rowIdx);
                this.pendingRows.delete(rowIdx);
                continue;
            }

            const matchingEurekaTeacher = this.data.eurekaTeachers.find(t => {
                const firstNameMatch = t.name.first === newTeacher.firstName;
                const lastNameMatch = t.name.last === newTeacher.lastName;
                const honorificMatch = t.name.honorific.toLowerCase().replace('.', '') === newTeacher.honorific.toLowerCase().replace('.', '');

                return firstNameMatch && lastNameMatch && honorificMatch;
            });
            if (matchingEurekaTeacher) {
                logger.info(
                    "Found matching teacher %O",
                    newTeacher.formattedName,
                );
                newTeacher.id = matchingEurekaTeacher.id;
                newTeacher.revertToEureka(matchingEurekaTeacher);

                const updateActions = newTeacher
                    .update(row)
                    .map(actionType => [actionType, newTeacher] as [ActionType, TeacherEntry]);
                
                this.actions.push(...updateActions);
                this.teachers.set(matchingEurekaTeacher.id, newTeacher);
                continue;
            }

            console.info(
                "Created teacher",
                newTeacher.formattedName,
            );
            this.newTeachers.add(newTeacher);
        }

        logger.info(
            "Created %O 'new' teachers and matched %O teachers",
            this.newTeachers.size,
            this.pendingRows.size - this.newTeachers.size,
        );
    }

    public get resolvedData() {
        return {
            actions: this.actions,
            newTeachers: this.newTeachers,
        };
    }
}
