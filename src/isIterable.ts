export function isIterable(obj: unknown) {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function' || typeof obj[Symbol.asyncIterator] === 'function';
}
