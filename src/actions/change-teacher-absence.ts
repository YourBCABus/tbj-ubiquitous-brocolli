import TeacherEntry, { ALL_PERIODS, Period as PeriodEnum } from "../consts/basic-structs";
import EurekaContext from "../logic/eureka";
import GraphQLQuery, { Teacher, Period } from "./types";

export const GET_PERIOD_IDS_QUERY = `
query GetPeriodIds {
    periods: allPeriods {
        id
        name
    }
}
`;

export const QUERY = `
mutation ChangeTeacherAbsence($id: UUID!, $periods: [UUID!]!, $fullyAbsent: Boolean, $comments: String) {
    teacher: updateTeacherAbsence(id: $id, periods: $periods, fullyAbsent: $fullyAbsent) {
        id
        name {
            formatted(formatStyle: HONORIFIC_LAST)
        }
    }
    commentUpdate: updateTeacherComments(id: $id, comments: $comments) {
        id
    }
}
`;

type GetPeriodIdsQuery = GraphQLQuery<{}, {
    periods: Period<"id" | "name">[];
}>;

type ChangeTeacherAbsenceQuery = GraphQLQuery<{
    id: string;
    periods: string[];
    fullyAbsent: boolean;
}, {
    teacher: Teacher<"id" | "name", never, never, "formatted">
}>;




const changeTeacherAbsence = async (ctx: EurekaContext, teacher: TeacherEntry): Promise<void> => {
    const getPeriodResult = await ctx.execQuery<GetPeriodIdsQuery>(GET_PERIOD_IDS_QUERY, 'GetPeriodIds', {});
    const periods = getPeriodResult.periods
        .filter(p => ALL_PERIODS.find(validName => p.name === validName))
        .filter(p => teacher.absenceState.absentPeriod(p.name as PeriodEnum))
        .map(p => p.id);

    const teacherId = teacher.id;
    if (!teacherId) throw new Error(`Teacher ${teacher.formattedName} has no ID`);

    const variables = {
        id: teacherId,
        periods,
        fullyAbsent: teacher.absenceState.isFullyAbsent,
        comments: teacher.comments,
    };


    const result = await ctx.execQuery<ChangeTeacherAbsenceQuery>(QUERY, 'ChangeTeacherAbsence', variables);

    teacher.id = result.teacher.id;
}

export default changeTeacherAbsence;
