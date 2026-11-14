import { NextRequest, NextResponse } from 'next/server';
import { enforceCsrfProtection, applySecurityHeaders, getSecurityHeaders, removeDuplicateSecurityHeaders } from '@/src/modules/security/http-security';

describe('HTTP security real boundaries', () => {
  it.each([
    ['POST','/api/projects','sb-access=x', 'https://app.invalid', undefined, false],
    ['POST','/api/projects','sb-access=x', 'https://evil.invalid', undefined, true],
    ['PATCH','/api/projects','SESSION=x', undefined, 'https://app.invalid/path', false],
    ['DELETE','/api/projects','auth=x', undefined, 'https://evil.invalid/path', true],
    ['PUT','/api/projects','token=x', undefined, 'invalid', true],
    ['POST','/api/projects','password-recovery-verified=x', undefined, undefined, true],
    ['POST','/api/projects','theme=x', undefined, undefined, false],
    ['POST','/api/projects','', undefined, undefined, false],
    ['GET','/api/projects','session=x', undefined, undefined, false],
    ['POST','/page','session=x', undefined, undefined, false],
    ['POST','/api/projects','session=x', 'https://evil.invalid', 'https://app.invalid/path', true],
  ])('%s %s enforces the cookie/origin boundary %#', async (method,path,cookie,origin,referer,denied) => {
    const headers: Record<string,string> = { cookie: cookie as string };
    if (origin) headers.origin = origin as string;
    if (referer) headers.referer = referer as string;
    const result = enforceCsrfProtection(new NextRequest(`https://app.invalid${path}`,{ method: method as string, headers }));
    if (!denied) { expect(result).toBeNull(); return; }
    expect(result?.status).toBe(403);
    expect(await result?.json()).toEqual({ok:false,error:'CSRF validation failed'});
    expect(result?.headers.get('cache-control')).toContain('no-store');
  });
  it.each(['production','development'])('applies environment-safe headers in %s', mode => {
    const original = process.env.NODE_ENV;
    try {
      Object.defineProperty(process.env,'NODE_ENV',{value:mode,writable:true,configurable:true});
      const headers = getSecurityHeaders();
      expect(headers['Content-Security-Policy'].includes("'unsafe-eval'")).toBe(mode !== 'production');
      expect(Boolean(headers['Strict-Transport-Security'])).toBe(mode === 'production');
      const response = applySecurityHeaders(NextResponse.json({ok:true}));
      expect(removeDuplicateSecurityHeaders(response)).toBe(response);
      expect(response.headers.get('x-frame-options')).toBe('DENY');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(removeDuplicateSecurityHeaders(NextResponse.json({})).status).toBe(200);
    } finally { Object.defineProperty(process.env,'NODE_ENV',{value:original,writable:true,configurable:true}); }
  });
});
