import TeacherEntry from "../consts/basic-structs";
import EurekaContext from "../logic/eureka";

import createTeacher from "./create-teacher";
import changeTeacherAbsence from "./change-teacher-absence";
import changeTeacherName from "./change-teacher-name";

export enum ActionType {
    CREATE_TEACHER = 'CREATE_TEACHER',
    CHANGE_TEACHER_NAME = 'CHANGE_TEACHER_NAME',
    CHANGE_TEACHER_ABSENCE = 'CHANGE_TEACHER_ABSENCE',
    // CHANGE_TEACHER_COMMENT = 'CHANGE_TEACHER_COMMENT',
}

const syncAction = async (ctx: EurekaContext, action: ActionType, teacher: TeacherEntry) => {
    switch (action) {
        case ActionType.CREATE_TEACHER:
            await createTeacher(ctx, teacher);
            return [action, teacher];

        case ActionType.CHANGE_TEACHER_NAME:
            await changeTeacherName(ctx, teacher);
            return [action, teacher];

        case ActionType.CHANGE_TEACHER_ABSENCE:
            try {
                await changeTeacherAbsence(ctx, teacher);
            } catch (e) {
                console.error(`Failed to change absence for ${teacher.formattedName}:`, e);
                throw e;
            }
            return [action, teacher];

        // case ActionType.CHANGE_TEACHER_COMMENT:
        //     console.warn("Teacher comment change not implemented");
        //     return [action, teacher];

    }


}

export default syncAction;
