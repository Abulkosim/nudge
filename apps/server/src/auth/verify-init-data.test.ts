import { expect, it, vi } from 'vitest';
import { timingSafeEqual } from 'node:crypto';
import { AuthError, verifyInitData } from './verify-init-data.js';
import { signedData, testToken } from '../test-helpers.js';

vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return { ...original, timingSafeEqual: vi.fn(original.timingSafeEqual) };
});
const options = { now: 1800000000, maxAgeSeconds: 86400 };
const valid = (fields: Record<string, string> = {}) =>
  signedData({ auth_date: String(options.now), ...fields });
function rejects(raw: string, reason: AuthError['reason']) {
  expect(() => verifyInitData(raw, testToken, options)).toThrowError(
    new AuthError(reason),
  );
  try {
    verifyInitData(raw, testToken, options);
  } catch (error) {
    expect(error).toBeInstanceOf(AuthError);
    expect(error).toHaveProperty('reason', reason);
  }
}
it('verifies all fields, including signature, without changing JSON or escaped values', () => {
  expect(
    verifyInitData(
      valid({ signature: 'signature-value', start_param: 'a+b & c' }),
      testToken,
      options,
    ),
  ).toEqual({ id: 123456789, first_name: 'Test + & name' });
  expect(timingSafeEqual).toHaveBeenCalledWith(
    expect.any(Buffer),
    expect.any(Buffer),
  );
  const call = vi.mocked(timingSafeEqual).mock.calls.at(-1);
  expect(call?.[0].byteLength).toBe(32);
  expect(call?.[1].byteLength).toBe(32);
});
it('rejects tampering, wrong token and modified signature', () => {
  const tampered = new URLSearchParams(valid());
  tampered.set('hash', '00'.repeat(32));
  rejects(tampered.toString(), 'invalid_signature');
  rejects(valid().replace('test-query', 'tampered'), 'invalid_signature');
  rejects(
    signedData({ auth_date: String(options.now) }, 'wrong-token'),
    'invalid_signature',
  );
  rejects(
    valid({ signature: 'one' }).replace('signature=one', 'signature=two'),
    'invalid_signature',
  );
});
it('accepts age boundary and rejects old, future and invalid dates', () => {
  expect(
    verifyInitData(
      valid({ auth_date: String(options.now - 86400) }),
      testToken,
      options,
    ),
  ).toHaveProperty('id');
  rejects(valid({ auth_date: String(options.now - 86401) }), 'expired');
  rejects(valid({ auth_date: String(options.now + 1) }), 'future_auth_date');
  for (const auth_date of ['', '-1', '1.5', 'NaN', '9007199254740992'])
    rejects(valid({ auth_date }), 'invalid_auth_date');
});
it('rejects missing or malformed hashes before constant-time comparison', () => {
  vi.mocked(timingSafeEqual).mockClear();
  const params = new URLSearchParams(valid());
  params.delete('hash');
  rejects(params.toString(), 'missing_hash');
  for (const hash of ['', 'ab', 'g'.repeat(64)]) {
    params.set('hash', hash);
    rejects(params.toString(), 'invalid_hash');
  }
  expect(timingSafeEqual).not.toHaveBeenCalled();
});
it.each([
  '',
  '%ZZ=x',
  'user=%FF',
  'foo',
  'a=b&',
  'hash=x&hash=y',
  'a=b&%61=c',
  '=x',
])('rejects malformed input %s', (raw) => rejects(raw, 'malformed'));
it.each([
  'null',
  '{',
  '{}',
  '{"id":"123","first_name":"Test"}',
  '{"id":-1,"first_name":"Test"}',
  '{"id":4503599627370496,"first_name":"Test"}',
  '{"id":1}',
])('validates signed user JSON %s', (user) =>
  rejects(valid({ user }), 'invalid_user'),
);
