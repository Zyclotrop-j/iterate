export const getLength = (isSet: boolean, ctx: {
    idxArg: any
}): number => isSet ? ctx.idxArg.size : ctx.idxArg?.length; // if Set, use .size instead