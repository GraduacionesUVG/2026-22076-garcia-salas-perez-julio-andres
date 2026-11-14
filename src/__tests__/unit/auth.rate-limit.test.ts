import { enforceAuthRateLimit } from '@/src/modules/auth/auth.rate-limit';

describe('real in-memory auth limiter', () => {
  const original = {...process.env};
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1000000);
    globalThis.__delimitationRateLimitStore?.clear();
    for (const key of Object.keys(process.env)) if (key.startsWith('AUTH_') && key.includes('RATE_LIMIT')) delete process.env[key];
  });
  afterEach(() => { process.env = {...original}; globalThis.__delimitationRateLimitStore?.clear(); jest.useRealTimers(); });
  const request = (ip: string) => new Request('https://app.invalid',{headers:{'x-forwarded-for':`${ip}, proxy`}});
  it.each([['login',30,8,900000],['register',8,3,3600000],['forgot-password',10,3,900000]] as const)('%s allows exact IP budget and expires', async (action,limit,_email,window) => {
    for(let i=0;i<limit;i++) expect(enforceAuthRateLimit({request:request('a'),action})).toBeNull();
    const denied = enforceAuthRateLimit({request:request('a'),action});
    expect(denied?.status).toBe(429);
    expect(denied?.headers.get('x-ratelimit-limit')).toBe(String(limit));
    expect(denied?.headers.get('x-ratelimit-remaining')).toBe('0');
    expect(denied?.headers.get('retry-after')).toBe(String(window/1000));
    expect((await denied?.json()).ok).toBe(false);
    jest.setSystemTime(1000000+window);
    expect(enforceAuthRateLimit({request:request('a'),action})).toBeNull();
  });
  it.each([['login',8],['register',3],['forgot-password',3]] as const)('%s combines normalized email across IPs', (action,limit) => {
    for(let i=0;i<limit;i++) expect(enforceAuthRateLimit({request:request(String(i)),action,email:' User@Example.COM '})).toBeNull();
    expect(enforceAuthRateLimit({request:request('new'),action,email:'user@example.com'})?.status).toBe(429);
  });
  it.each(['cf-connecting-ip','true-client-ip','x-real-ip','x-vercel-forwarded-for'])('uses trusted %s before forwarded IP', header => {
    process.env.AUTH_LOGIN_IP_RATE_LIMIT='1';
    const first = new Request('https://app.invalid',{headers:{[header]:' trusted ','x-forwarded-for':'one'}});
    const second = new Request('https://app.invalid',{headers:{[header]:'trusted','x-forwarded-for':'two'}});
    expect(enforceAuthRateLimit({request:first,action:'login',email:' '})).toBeNull();
    expect(enforceAuthRateLimit({request:second,action:'login'})?.status).toBe(429);
  });
  it.each(['0','-2','nonsense'])('falls back on invalid configuration %s', value => {
    process.env.AUTH_LOGIN_IP_RATE_LIMIT=value; process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS=value;
    for(let i=0;i<30;i++) expect(enforceAuthRateLimit({request:new Request('https://app.invalid'),action:'login',email:null})).toBeNull();
    const denied=enforceAuthRateLimit({request:new Request('https://app.invalid'),action:'login'});
    expect(denied?.headers.get('x-ratelimit-limit')).toBe('30');
    expect(denied?.headers.get('retry-after')).toBe('900');
  });
});
