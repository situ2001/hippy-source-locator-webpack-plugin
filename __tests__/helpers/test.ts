import assert from 'node:assert/strict';
import nodeTest from 'node:test';

export interface Assertions {
  deepEqual(actual: unknown, expected: unknown): void;
  false(value: unknown): void;
  is(actual: unknown, expected: unknown): void;
  true(value: unknown): void;
}

export default function test(
  name: string,
  run: (assertions: Assertions) => void | Promise<void>,
): void {
  void nodeTest(name, () => run({
    deepEqual: assert.deepStrictEqual,
    false: value => assert.strictEqual(value, false),
    is: assert.strictEqual,
    true: value => assert.strictEqual(value, true),
  }));
}
