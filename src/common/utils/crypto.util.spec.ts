import * as crypto from 'crypto';
import { validateHmac } from './crypto.util';

describe('validateHmac', () => {
  const secret = 'test-hmac-secret';

  it('should return true for valid HMAC signature', () => {
    const payload = 'test-payload-data';
    const expected = crypto.createHmac('sha512', secret).update(payload).digest('hex');
    expect(validateHmac(payload, secret, expected)).toBe(true);
  });

  it('should return false for invalid HMAC signature', () => {
    const payload = 'test-payload-data';
    const wrongSig = crypto.createHmac('sha512', 'wrong-secret').update(payload).digest('hex');
    expect(validateHmac(payload, secret, wrongSig)).toBe(false);
  });

  it('should return false for empty signature', () => {
    expect(validateHmac('payload', secret, '')).toBe(false);
  });

  it('should return false for undefined signature', () => {
    expect(validateHmac('payload', secret, undefined as any)).toBe(false);
  });

  it('should not crash on length mismatch (3DS transactions > 5000 EGP)', () => {
    // Simulates the bug: signature of different length than expected
    const payload = 'large-transaction-payload';
    const truncatedSig = 'abcdef1234'; // Much shorter than expected sha512 hex
    expect(() => validateHmac(payload, secret, truncatedSig)).not.toThrow();
    expect(validateHmac(payload, secret, truncatedSig)).toBe(false);
  });

  it('should not crash on non-hex signature input', () => {
    const payload = 'test-payload';
    const nonHexSig = 'not-a-hex-string-at-all!!!';
    // Buffer.from with 'hex' encoding silently drops non-hex chars, producing shorter buffer
    expect(() => validateHmac(payload, secret, nonHexSig)).not.toThrow();
    expect(validateHmac(payload, secret, nonHexSig)).toBe(false);
  });
});
