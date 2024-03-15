import TeacherEntry from "../consts/basic-structs";
import EurekaContext from "../logic/eureka";
import changeTeacherAbsence from "./change-teacher-absence";
import GraphQLQuery, { GraphQlTeacherName, GraphQlPronounSet, Teacher } from "./types";

export const QUERY = `
mutation CreateTeacher($name: GraphQlTeacherName!, $pronouns: GraphQlPronounSet!) {
    teacher: addTeacher(name: $name, pronouns: $pronouns) {
        id
        name {
            formatted(formatStyle: HONORIFIC_LAST)
        }
    }
}
`;

type CreateTeacherQuery = GraphQLQuery<{
    name: GraphQlTeacherName;
    pronouns: GraphQlPronounSet;
}, {
    teacher: Teacher<"id" | "name", never, never, "formatted">
}>;


const msPronouns: GraphQlPronounSet = {
    sub: 'she',
    obj: 'her',
    posAdj: 'her',
    posPro: 'hers',
    refx: 'herself',
    grammPlu: false,
};
const mrPronouns: GraphQlPronounSet = {
    sub: 'he',
    obj: 'him',
    posAdj: 'his',
    posPro: 'his',
    refx: 'himself',
    grammPlu: false,
};
const mxPronouns: GraphQlPronounSet = {
    sub: 'they',
    obj: 'them',
    posAdj: 'their',
    posPro: 'theirs',
    refx: 'themself',
    grammPlu: true,
};

const msMatches = ['ms', 'mrs', 'ms dr', 'mrs dr'];
const mrMatches = ['mr', 'dr', 'mr dr'];

const createTeacher = async (ctx: EurekaContext, teacher: TeacherEntry): Promise<void> => {
    const pronouns = msMatches ? msPronouns : mrMatches ? mrPronouns : mxPronouns;
    const variables = {
        name: {
            honorific: teacher.honorific,
            first: teacher.firstName,
            last: teacher.lastName,
            middle: [],
        },
        pronouns,
    }

    const result = await ctx.execQuery<CreateTeacherQuery>(QUERY, 'CreateTeacher', variables);

    teacher.id = result.teacher.id;

    changeTeacherAbsence(ctx, teacher);
}

export default createTeacher;
