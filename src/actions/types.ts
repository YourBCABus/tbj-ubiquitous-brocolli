export interface GraphQlTeacherName {
    honorific: string;
    first: string;
    last: string;
    middle: { name: string, vis: boolean }[],
}

export interface GraphQlPronounSet {
    sub: string;
    obj: string;
    posAdj: string;
    posPro: string;
    refx: string;
    grammPlu: boolean;
}


type PeriodKeys = "id" | "name" | "teachersAbsent";
export type Period<
    Keys extends PeriodKeys = PeriodKeys,
    TeacherKey extends TeacherKeys = TeacherKeys,
    Pronouns extends PronounKeys = PronounKeys,
    Name extends NameKeys = NameKeys,
> = {
    id: string;
    name: string;
    teachersAbsent: Teacher<TeacherKey, Keys, Pronouns, Name>[];
}


type PronounKeys =
 | "sub" | "obj" | "posAdj" | "posPro" | "refx" | "grammPlu"
 | "subject" | "object" | "possessiveAdjective" | "possessivePronoun" | "reflexive" | "grammaticallyPlural"
 | "setStr";
export type PronounSet<Keys extends PronounKeys> = Pick<{
    sub: string;
    subject: string;
    
    obj: string;
    object: string;
    
    posAdj: string;
    possessiveAdjective: string;

    posPro: string;
    possessivePronoun: string;

    refx: string;
    reflexive: string;

    grammPlu: boolean;
    grammaticallyPlural: boolean;

    setStr: string;
}, Keys>;

type NameKeys = "honorific" | "first" | "last" | "formatted";
export type TeacherName<Keys extends NameKeys> = Pick<{
    honorific: string;
    first: string;
    last: string;

    formatted: string;
}, Keys>;


type TeacherKeys = "id" | "pronouns" | "name" | "absence" | "fullyAbsent";
export type Teacher<
    Keys extends TeacherKeys = TeacherKeys,
    PeriodKey extends PeriodKeys = PeriodKeys,
    Pronouns extends PronounKeys = PronounKeys,
    Name extends NameKeys = NameKeys,
> = Pick<{
    id: string;
    pronouns: PronounSet<Pronouns>;
    name: TeacherName<Name>;

    absence: Period<PeriodKey, Keys, Pronouns, Name>[];
    fullyAbsent: boolean;
}, Keys>;


export type GraphQLQuery<Input, Output> = (variables: Input) => Output;


export default GraphQLQuery;
