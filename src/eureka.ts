import { inspect } from "util";
import GraphQLQuery, { Teacher } from "./actions/types";

export default class EurekaContext {
    #clientId: string;
    #clientSecret: string;

    #eurekaUrl: string;

    constructor(clientId: string, clientSecret: string, eurekaUrl: string) {
        this.#clientId = clientId;
        this.#clientSecret = clientSecret;

        this.#eurekaUrl = eurekaUrl;
    }

    public async execQuery<Query extends GraphQLQuery<any, any>>(
        text: string,
        queryName: string,
        variables: Parameters<Query>[0],
    ): Promise<ReturnType<Query>> {
        const body = {
            query: text,
            operationName: queryName,
            variables,
        };

        const response = await fetch(this.#eurekaUrl, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                'Content-Type': 'application/json',
                'Client-Id': this.#clientId,
                'Client-Secret': this.#clientSecret,
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to execute query: ${response.statusText}`);
        }

        const json = await response.json();

        if (json.errors) {
            throw new Error(`Failed to execute query: ${inspect(json.errors)}`);
        }

        return json.data;
    }
}



const GET_TEACHERS_QUERY = `
query GetTeachers {
    teachers: allTeachers {
        id
        name {
            honorific
            first
            last
        }
    }
}
`;

type GetTeachersQuery = GraphQLQuery<{}, {
    teachers: Teacher<"id" | "name", never, never, "honorific" | "first" | "last">[];
}>;

export type GetTeachersResult = Awaited<ReturnType<GetTeachersQuery>>["teachers"];

export const getTeachers = async (ctx: EurekaContext): Promise<GetTeachersResult> => {
    return (await ctx.execQuery<GetTeachersQuery>(GET_TEACHERS_QUERY, 'GetTeachers', {})).teachers;
};




const SET_GET_REPORT_TO_QUERY = `
mutation SetReportTo {
    setReportTo(reportTo: "2nd Floor Caf")
}
query GetReportTo {
  reportTo:currReportTo
}
`;

type SetReportToMutation = GraphQLQuery<{ reportTo: string }, {}>;
type GetReportToQuery = GraphQLQuery<{}, { reportTo: string }>;

export const setReportTo = async (ctx: EurekaContext, reportTo: string): Promise<void> => {
    await ctx.execQuery<SetReportToMutation>(SET_GET_REPORT_TO_QUERY, 'SetReportTo', { reportTo });
};

export const getReportTo = async (ctx: EurekaContext): Promise<string> => {
    return (await ctx.execQuery<GetReportToQuery>(SET_GET_REPORT_TO_QUERY, 'GetReportTo', {})).reportTo;
}
