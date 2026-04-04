
export function isConstructable(x: any) {
  const handler = { construct() { return handler; } };
  try {
    return !!(new (new Proxy(x, handler))());
  } catch (e) {
    return false;
  }
}
