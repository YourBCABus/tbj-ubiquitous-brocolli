import { inspect } from "util";
import { ActionType } from "../actions";
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
        const honorific = row[COLS.HONORIFIC].trim().replace(/\./g, '').toLowerCase();

        if (!honorific || !lastName) return null;

        const absenceState = AbsenceState.create(row);

        return new TeacherEntry(rowIdx, honorific, firstName, lastName, absenceState);
    }

    public update(row: string[]): ActionType[] {
        const actions: ActionType[] = [];

        const firstName = row[COLS.FIRST_NAME].trim();
        const lastName = row[COLS.LAST_NAME].trim();
        const honorific = row[COLS.HONORIFIC].trim().replace(/\./g, '').toLowerCase();

        
        if (firstName !== this.#firstName || lastName !== this.#lastName || honorific !== this.#honorific) {
            console.log({
                sheet: {
                    firstName,
                    lastName,
                    honorific,
                },
                state: {
                    firstName: this.#firstName,
                    lastName: this.#lastName,
                    honorific: this.#honorific,
                },
            });
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

    public get prettyFullName(): string {
        const honorific = this.#honorific
            .split(' ')
            .map(word => word[0].toUpperCase() + word.slice(1) + ".")
            .join(' ');
        
        return `${honorific} ${this.#firstName} ${this.#lastName}`;
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
        const honorific = row[COLS.HONORIFIC].trim().replace(/\./g, '').toLowerCase();

        let score = 0;

        if (firstName === this.#firstName) score += 2;
        if (lastName === this.#lastName) score += 2;
        if (honorific === this.#honorific) score += 1;

        return score;
    }

    public rowMatches(row: string[]): boolean {
        return this.rowMatchScore(row) >= 4;
    }
    public rowMatchesLax(row: string[]): boolean {
        return this.rowMatchScore(row) >= 3;
    }

    public revertToEureka({ absence, fullyAbsent, name }: {
        absence: { name: string, id: string }[],
        fullyAbsent: boolean,
        name: { first: string, last: string, honorific: string },
    }) {
        this.#honorific = name.honorific.trim().replace(/\./g, '').toLowerCase();
        this.#firstName = name.first.trim();
        this.#lastName = name.last.trim();
        this.#absenceState = AbsenceState.fromEureka(absence, fullyAbsent);
    }
}

export abstract class AbsenceState {
    #comments: string;

    protected constructor(comments: string) {
        this.#comments = comments;
    }
    
    abstract absentPeriod(period: Period): boolean;
    abstract get isFullyAbsent(): boolean;

    public static fromEureka(
        periods: { name: string, id: string }[],
        fullyAbsent: boolean,
    ) {
        if (fullyAbsent) {
            return new AbsentFullDay("");
        }

        const nameSet = new Set(periods.map(p => p.name));

        const pairs = [
            ["1", Period.P1],
            ["IGS", Period.IGS],
            ["2", Period.P2],
            ["3", Period.P3],
            ["4", Period.P4],
            ["5", Period.P5],
            ["6", Period.P6],
            ["7", Period.P7],
            ["8", Period.P8],
            ["9", Period.P9],
        ] as const;

        const periodSet = new Set(
            [...nameSet]
                .flatMap(name => {
                    const pair = pairs.find(
                        ([namePiece]) => name
                            .toLocaleLowerCase()
                            .includes(namePiece.toLocaleLowerCase()),
                    );
                    return pair ? [pair[1]] : [];
                })
        )

        // If no periods are absent, teacher is present (otherwise teacher is
        // partially absent)
        if (periodSet.size === 0) {
            return new Present("");
        } else {
            return new AbsentPartialDay("", periodSet);
        }
    }

    public static create(row: string[]): AbsenceState {
        // const comments = row[COLS.COMMENTS];
        const comments = "";
        

        const checked = (idx: number) => (row[idx] ?? "").toLowerCase() === 'true';

        // If the full day column is checked, exit early with an AbsentFullDay
        // status.
        if (checked(COLS.FULL_DAY)) {
            return new AbsentFullDay(comments);
        }


        // Individual period selection
        const periods = new Set<Period>();

        // Handle individual checked periods
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
            if (checked(col)) {
                periods.add(period);
            }
        }

        // Handle AM/PM period chunks
        const AM_PERIODS = [Period.P1, Period.IGS, Period.P2, Period.P3, Period.P4];
        const PM_PERIODS = [Period.P5, Period.P6, Period.P7, Period.P8, Period.P9];

        if (checked(COLS.PARTIAL.AM)) {
            for (const period of AM_PERIODS) periods.add(period);
        }
        if (checked(COLS.PARTIAL.PM)) {
            for (const period of PM_PERIODS) periods.add(period);
        }

        // If no periods are absent, teacher is present (otherwise teacher is
        // partially absent)
        if (periods.size === 0) {
            return new Present(comments);
        } else {
            return new AbsentPartialDay(comments, periods);
        }
    }

    public static diff(prev: AbsenceState, curr: AbsenceState): ActionType[] {
        const actions: ActionType[] = [];

        // if (prev.#comments !== curr.#comments) {
            // actions.push(ActionType.CHANGE_TEACHER_COMMENT);
        // }

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

    public abstract get isAbsentAtAll(): boolean;
}


export class AbsentFullDay extends AbsenceState {
    public constructor(comments: string) {
        super(comments);
    }

    public absentPeriod(_: Period): boolean { return true; }
    public get isFullyAbsent(): boolean { return true; }

    public get isAbsentAtAll(): boolean { return true; }
    public toString() { return "out ALL DAY"; }
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

    public get isAbsentAtAll(): boolean { return true; }
    public toString() {
        const periods = [...this.#periods];
        periods.sort((a, b) => ALL_PERIODS.indexOf(a) - ALL_PERIODS.indexOf(b));

        const shortPeriods = periods.map(p => p.replace(/^Period /g, ""));

        return `out ${shortPeriods.join(', ')}`;
    }
}

export class Present extends AbsenceState {
    public constructor(comments: string) {
        super(comments);
    }

    absentPeriod(_: Period): boolean { return false; }
    get isFullyAbsent(): boolean { return false; }

    public get isAbsentAtAll(): boolean { return false; }
    public toString() { return "present"; }
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
