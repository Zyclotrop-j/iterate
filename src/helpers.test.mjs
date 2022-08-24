import assert from 'node:assert';
import { isConstructable } from "./isConstructable.mjs";
import { isIterable } from "./isIterable.mjs";

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

  return test;
}