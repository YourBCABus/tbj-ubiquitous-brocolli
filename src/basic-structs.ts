import { inspect } from "util";
import { ActionType } from "./actions";
import COLS from "./rowlookup";

export default class TeacherEntry {
    #id: string | null;
    #home: { row: number };

    #honorific: string;
    #firstName: string;
    #lastName: string;

    #absenceState: AbsenceState;

    private constructor(
        home: number,
        honorific: string,
        firstName: string,
        lastName: string,
        absenceState: AbsenceState,
    ) {
        this.#id = null;
        this.#home = { row: home };

        this.#honorific = honorific;
        this.#firstName = firstName;
        this.#lastName = lastName;

        this.#absenceState = absenceState;
    }

    public static create(row: string[], rowIdx: number): TeacherEntry | null {
        const firstName = row[COLS.FIRST_NAME].trim();
        const lastName = row[COLS.LAST_NAME].trim();
        const honorific = row[COLS.HONORIFIC].trim().replace(/\.$/, '');

        if (!honorific || !lastName) return null;

        const absenceState = AbsenceState.create(row);

        return new TeacherEntry(rowIdx, honorific, firstName, lastName, absenceState);
    }

    public update(row: string[]): ActionType[] {
        const actions: ActionType[] = [];

        const firstName = row[COLS.FIRST_NAME].trim();
        const lastName = row[COLS.LAST_NAME].trim();
        const honorific = row[COLS.HONORIFIC].trim().replace(/\.$/, '');

        
        if (firstName !== this.#firstName || lastName !== this.#lastName || honorific !== this.#honorific) {
            actions.push(ActionType.CHANGE_TEACHER_NAME);
        }

        const absenceState = AbsenceState.create(row);
        actions.push(...AbsenceState.diff(this.#absenceState, absenceState));

        this.#firstName = firstName;
        this.#lastName = lastName;
        this.#honorific = honorific;
        this.#absenceState = absenceState;

        return actions;
    }

    public get home(): { row: number } { return this.#home; }
    public set home(row: number) { this.#home.row = row; }

    public set id(id: string | null) { this.#id = id; }
    public get id(): string | null { return this.#id; }

    public absentPeriod(period: Period): boolean {
        return this.#absenceState.absentPeriod(period);
    }

    public get formattedName(): string { return `${this.#honorific} ${this.#lastName}`; }
    public get honorific(): string { return this.#honorific; }
    public get firstName(): string { return this.#firstName; }
    public get lastName(): string { return this.#lastName; }

    public get absenceState(): AbsenceState { return this.#absenceState; }
    public get comments(): string { return this.#absenceState.comments; }

    public rowMatchScore(row: string[]): number {
        const firstName = row[COLS.FIRST_NAME];
        const lastName = row[COLS.LAST_NAME];
        const honorific = row[COLS.HONORIFIC].replace(/\.$/, '');

        let score = 0;

        if (firstName === this.#firstName) score += 1;
        if (lastName === this.#lastName) score += 3;
        if (honorific === this.#honorific) score += 1.1;

        return score;
    }

    public rowMatches(row: string[]): boolean {
        return this.rowMatchScore(row) >= 4;
    }
    public rowMatchesLax(row: string[]): boolean {
        return this.rowMatchScore(row) >= 1;
    }
}

export abstract class AbsenceState {
    #comments: string;

    protected constructor(comments: string) {
        this.#comments = comments;
    }
    
    abstract absentPeriod(period: Period): boolean;
    abstract get isFullyAbsent(): boolean;

    public static create(row: string[]): AbsenceState {
        const comments = row[COLS.COMMENTS];

        if (row[COLS.FULL_DAY].toLowerCase() === 'true') {
            return new AbsentFullDay(comments);
        }

        const periods = new Set<Period>();

        const pairs = [
            [COLS.PERIOD.P1, Period.P1],
            [COLS.PERIOD.IGS, Period.IGS],
            [COLS.PERIOD.P2, Period.P2],
            [COLS.PERIOD.P3, Period.P3],
            [COLS.PERIOD.P4, Period.P4],
            [COLS.PERIOD.P5, Period.P5],
            [COLS.PERIOD.P6, Period.P6],
            [COLS.PERIOD.P7, Period.P7],
            [COLS.PERIOD.P8, Period.P8],
            [COLS.PERIOD.P9, Period.P9],
        ] as const;

        for (const [col, period] of pairs) {
            if (row[col].toLowerCase() === 'true') {
                periods.add(period);
            }
        }

        if (periods.size === 0) {
            return new Present(comments);
        } else {
            return new AbsentPartialDay(comments, periods);
        }
    }

    public static diff(prev: AbsenceState, curr: AbsenceState): ActionType[] {
        const actions: ActionType[] = [];

        if (prev.#comments !== curr.#comments) {
            actions.push(ActionType.CHANGE_TEACHER_COMMENT);
        }

        const prevIsFullDay = prev instanceof AbsentFullDay;
        const currIsFullDay = curr instanceof AbsentFullDay;

        const prevIsPartialDay = prev instanceof AbsentPartialDay;
        const currIsPartialDay = curr instanceof AbsentPartialDay;

        const prevIsPresent = prev instanceof Present;
        const currIsPresent = curr instanceof Present;

        if (prevIsFullDay && !currIsFullDay) {
            actions.push(ActionType.CHANGE_TEACHER_ABSENCE);
        } else if (prevIsPartialDay && !currIsPartialDay) {
            actions.push(ActionType.CHANGE_TEACHER_ABSENCE);
        } else if (prevIsPresent && !currIsPresent) {
            actions.push(ActionType.CHANGE_TEACHER_ABSENCE);
        } else if (prev instanceof AbsentPartialDay && curr instanceof AbsentPartialDay) {
            if (AbsentPartialDay.periodsDiffer(prev, curr)) {
                actions.push(ActionType.CHANGE_TEACHER_ABSENCE);
            }
        }

        return actions;
    }

    public get comments(): string { return this.#comments; }
}


export class AbsentFullDay extends AbsenceState {
    public constructor(comments: string) {
        super(comments);
    }

    public absentPeriod(_: Period): boolean { return true; }
    public get isFullyAbsent(): boolean { return true; }
}

export class AbsentPartialDay extends AbsenceState {
    #periods: Set<Period>;

    public constructor(comments: string, periods: Set<Period>) {
        super(comments);
        this.#periods = periods;
    }

    public absentPeriod(period: Period): boolean { return this.#periods.has(period); }
    public get isFullyAbsent(): boolean { return false; }

    public static periodsDiffer(prev: AbsentPartialDay, curr: AbsentPartialDay): boolean {
        const prevIsSubsetOfCurr = [...prev.#periods].every(period => curr.#periods.has(period));
        const currIsSubsetOfPrev = [...curr.#periods].every(period => prev.#periods.has(period));

        return !(prevIsSubsetOfCurr && currIsSubsetOfPrev);
    }

    [inspect.custom](): string {
        return `AbsentPartialDay< ${[...this.#periods].join(', ')} >`;
    }
}

export class Present extends AbsenceState {
    public constructor(comments: string) {
        super(comments);
    }

    absentPeriod(_: Period): boolean { return false; }
    get isFullyAbsent(): boolean { return false; }
}


export enum Period {
    P1 = "Period 1",
    IGS = "IGS",
    P2 = "Period 2",
    P3 = "Period 3",
    P4 = "Period 4",
    P5 = "Period 5",
    P6 = "Period 6",
    P7 = "Period 7",
    P8 = "Period 8",
    P9 = "Period 9",
}

export const ALL_PERIODS = [ Period.P1, Period.IGS, Period.P2, Period.P3, Period.P4, Period.P5, Period.P6, Period.P7, Period.P8, Period.P9 ];
