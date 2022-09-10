import assert from 'node:assert';
import { isConstructable } from "./isConstructable.mjs";
import { isIterable } from "./isIterable.mjs";
import { getLength } from "./getLength.mjs";
import { tryGetIn } from "./tryGetIn.mjs";

export default test => {
    
  // ensure helpers are working
  test('isIterable is working', async function () {

    assert.equal(isIterable(''), true);
    assert.equal(isIterable([]), true);
    assert.equal(isIterable(new Set()), true);
    assert.equal(isIterable(new Map()), true);
    assert.equal(isIterable({ [Symbol.iterator]: function () { } }), true);

    assert.equal(isIterable({}), false);
    assert.equal(isIterable(function () { }), false);
    assert.equal(isIterable(1), false);
    assert.equal(isIterable(0), false);
    assert.equal(isIterable(true), false);
    assert.equal(isIterable(false), false);
    assert.equal(isIterable(undefined), false);
    assert.equal(isIterable(null), false);
    assert.equal(isIterable({ [Symbol.iterator]: null }), false);
  });
  test('isConstructable is working', async function () {
    assert.equal(isConstructable(''), false);
    assert.equal(isConstructable([]), false);
    assert.equal(isConstructable(new Set()), false);
    assert.equal(isConstructable(new Map()), false);
    assert.equal(isConstructable({ [Symbol.iterator]: function () { } }), false);
    assert.equal(isConstructable({}), false);
    assert.equal(isConstructable(1), false);
    assert.equal(isConstructable(0), false);
    assert.equal(isConstructable(true), false);
    assert.equal(isConstructable(false), false);
    assert.equal(isConstructable(undefined), false);
    assert.equal(isConstructable(null), false);
    assert.equal(isConstructable({ [Symbol.iterator]: null }), false);

    assert.equal(isConstructable(function () { }), true);
    assert.equal(isConstructable(class { }), true);
  });
  test('getLength is working', async function () {
    const getLengthWrapper = (arg) => getLength(arg instanceof Set, { idxArg: arg });

    assert.equal(getLengthWrapper(''), 0);
    assert.equal(getLengthWrapper([]), 0);
    assert.equal(getLengthWrapper(new Set()), 0);
    assert.equal(getLengthWrapper(new Map()), undefined);
    assert.equal(getLengthWrapper({ [Symbol.iterator]: function () { } }), undefined);
    assert.equal(getLengthWrapper({}), undefined);
    assert.equal(getLengthWrapper(1), undefined);
    assert.equal(getLengthWrapper(0), undefined);
    assert.equal(getLengthWrapper(true), undefined);
    assert.equal(getLengthWrapper(false), undefined);
    assert.equal(getLengthWrapper(undefined), undefined);
    assert.equal(getLengthWrapper(null), undefined);
    assert.equal(getLengthWrapper({ [Symbol.iterator]: null }), undefined);
    assert.equal(getLengthWrapper(function () { }), 0);
    assert.equal(getLengthWrapper(class { }), 0);
    assert.equal(getLengthWrapper('a'), 1);
    assert.equal(getLengthWrapper(['a']), 1);
    assert.equal(getLengthWrapper(new Set([1])), 1);
    assert.equal(getLengthWrapper('abc'), 3);
    assert.equal(getLengthWrapper(['a', {}, 'aaa']), 3);
    assert.equal(getLengthWrapper(new Set([1, 'a', {}])), 3);
  });
  test('tryGetIn is working', async function () {
    assert.equal(tryGetIn('foo', ''), false);
    assert.equal(tryGetIn('foo', []), false);
    assert.equal(tryGetIn('foo', new Set()), false);
    assert.equal(tryGetIn('foo', new Map()), false);
    assert.equal(tryGetIn('foo', { [Symbol.iterator]: function () { } }), false);
    assert.equal(tryGetIn('foo', {}), false);
    assert.equal(tryGetIn('foo', 1), false);
    assert.equal(tryGetIn('foo', 0), false);
    assert.equal(tryGetIn('foo', true), false);
    assert.equal(tryGetIn('foo', false), false);
    assert.equal(tryGetIn('foo', undefined), false);
    assert.equal(tryGetIn('foo', null), false);
    assert.equal(tryGetIn('foo', { [Symbol.iterator]: null }), false);
    assert.equal(tryGetIn('foo', function () { }), false);
    assert.equal(tryGetIn('foo', class { }), false);

    assert.equal(tryGetIn('size', new Set()), true);
    assert.equal(tryGetIn('size', new Map()), true);
    assert.equal(tryGetIn('length', []), true);

    assert.equal(tryGetIn('length', ''), false);

    assert.equal(tryGetIn(0, ['a']), true);
  });

  return test;
}