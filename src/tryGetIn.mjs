export const tryGetIn = (prop, arg) => {
    try { 
        return prop in arg;
    } catch (e) {
        return false;
    }
};
