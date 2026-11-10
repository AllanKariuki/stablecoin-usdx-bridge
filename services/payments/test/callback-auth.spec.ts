import { UnauthorizedException } from '@nestjs/common';
import { IntentsController } from '../src/intents/intents.controller';

function controller(secret: string, onCallback = jest.fn()) {
  const rail = { name: 'stub', parseCallback: () => ({ railRef: 'r1', status: 'SETTLED' }) };
  const c = new IntentsController(
    {} as never,
    {} as never,
    { onRailCallback: onCallback } as never,
    { get: () => rail } as never,
    { get: () => secret } as never,
  );
  return { c, onCallback };
}
const req = (o: { header?: string; token?: string } = {}) =>
  ({ headers: o.header ? { 'x-rail-callback-token': o.header } : {}, query: o.token ? { token: o.token } : {}, ip: '1.2.3.4' }) as never;

describe('rail callback authentication', () => {
  it('rejects every call when no secret is configured', async () => {
    const { c, onCallback } = controller('');
    await expect(c.callback('stub', {}, req({ token: '' }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(onCallback).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong token', async () => {
    const { c, onCallback } = controller('s3cret');
    await expect(c.callback('stub', {}, req())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(c.callback('stub', {}, req({ token: 'wrong!' }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(onCallback).not.toHaveBeenCalled();
  });

  it('accepts the secret as a query token or a header', async () => {
    const { c, onCallback } = controller('s3cret');
    await c.callback('stub', {}, req({ token: 's3cret' }));
    await c.callback('stub', {}, req({ header: 's3cret' }));
    expect(onCallback).toHaveBeenCalledTimes(2);
  });
});
