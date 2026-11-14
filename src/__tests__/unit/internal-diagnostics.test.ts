import { canAccessInternalDiagnostics, internalDiagnosticsJson, internalDiagnosticsNotFoundResponse, internalDiagnosticsServerErrorResponse } from '@/src/modules/security/internal-diagnostics';

describe('internal diagnostics capability boundary', () => {
  const original={...process.env};
  afterEach(()=>{process.env={...original};});
  it.each([
    ['production','true','secret','secret',true],
    ['production','true','secret','wrong!',false],
    ['production','true','secret','short',false],
    ['production','true','secret','',false],
    ['production','true','','',false],
    ['development','true','','',true],
    ['development','false',' secret ',' secret ',true],
    ['development','false',undefined,undefined,false],
  ])('gates environment/token case %#', (mode,local,token,sent,allowed)=>{
    Object.defineProperty(process.env,'NODE_ENV',{value:mode,writable:true,configurable:true});
    process.env.ENABLE_LOCAL_DIAGNOSTICS=local as string;
    if(token===undefined) delete process.env.INTERNAL_DIAGNOSTICS_TOKEN; else process.env.INTERNAL_DIAGNOSTICS_TOKEN=token;
    expect(canAccessInternalDiagnostics(new Request('https://app.invalid',{headers:sent?{'x-internal-diagnostics-token':sent}:{}}))).toBe(allowed);
  });
  it.each([[internalDiagnosticsNotFoundResponse,404,'Not found'],[internalDiagnosticsServerErrorResponse,503,'Internal diagnostics check failed']] as const)('returns safe no-store failure %#', async (make,status,error)=>{
    const response=make(); expect(response.status).toBe(status); expect(await response.json()).toEqual({ok:false,error});
    expect(response.headers.get('cache-control')).toContain('no-store'); expect(response.headers.get('pragma')).toBe('no-cache'); expect(response.headers.get('expires')).toBe('0');
  });
  it('keeps explicit JSON status and defaults successful status', async ()=>{
    const response=internalDiagnosticsJson({ok:true},202); expect(response.status).toBe(202); expect(await response.json()).toEqual({ok:true}); expect(response.headers.get('cache-control')).toContain('no-store'); expect(internalDiagnosticsJson({}).status).toBe(200);
  });
});
