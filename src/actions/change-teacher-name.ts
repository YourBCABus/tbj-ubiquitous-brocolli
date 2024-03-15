import TeacherEntry from "../consts/basic-structs";
import EurekaContext from "../logic/eureka";
import GraphQLQuery, { GraphQlTeacherName, Teacher } from "./types";

export const QUERY = `
mutation ChangeTeacherName($id: UUID!, $name: GraphQlTeacherName!) {
    teacher: updateTeacherName(id: $id, name: $name) {
        id
        name {
            formatted(formatStyle: HONORIFIC_LAST)
        }
    }
}
`;

type ChangeTeacherNameQuery = GraphQLQuery<{
    id: string;
    name: GraphQlTeacherName;
}, {
    teacher: Teacher<"id" | "name", never, never, "formatted">
}>;


const changeTeacherName = async (ctx: EurekaContext, teacher: TeacherEntry): Promise<void> => {
    const teacherId = teacher.id;
    if (!teacherId) throw new Error(`Teacher ${teacher.formattedName} has no ID`);

    const variables = {
        id: teacherId,
        name: {
            honorific: teacher.honorific,
            first: teacher.firstName,
            last: teacher.lastName,
            middle: [],
        },
    }

    const result = await ctx.execQuery<ChangeTeacherNameQuery>(QUERY, 'ChangeTeacherName', variables);

    teacher.id = result.teacher.id;

    
}

export default changeTeacherName;
