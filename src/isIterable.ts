export function isIterable(obj: unknown): obj is Iterable<unknown> | AsyncIterable<unknown> {
  if (obj == null) {
    return false;
  }
  const o = obj as Record<symbol, unknown>;
  return typeof o[Symbol.iterator] === 'function' || typeof o[Symbol.asyncIterator] === 'function';
}
