export const tryGetIn = (prop: string | number | symbol, arg: unknown): boolean => {
  try {
    return prop in (arg as object);
  } catch (e) {
    return false;
  }
};
