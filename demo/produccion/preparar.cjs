// Video production only. This script does not run a web interface or alter API data.
const fs=require('node:fs');const path=require('node:path');const os=require('node:os');const cp=require('node:child_process');
const root=path.resolve(__dirname,'../..');const sharp=require(path.join(root,'src/node_modules/sharp'));
const spec=require('./escenas.json');const out=process.argv[2]||fs.mkdtempSync(path.join(os.tmpdir(),'backend-visual-'));
for(const dir of ['capturas','frames','clips'])fs.mkdirSync(path.join(out,dir),{recursive:true});
const W=spec.width,H=spec.height,paper='#F3F1EA',ink='#203B32',accent='#9B6B48',muted='#66746B';
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const svg=s=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><style>text{font-family:Arial,sans-serif}.serif{font-family:Georgia,serif}.mono{font-family:Menlo,monospace}</style>${s}</svg>`);
const txt=(x,y,text,size=30,color=ink,other='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" ${other}>${escape(text)}</text>`;
const line=(y)=>`<path d="M128 ${y}H2432" stroke="#D4D7CA" stroke-width="2"/>`;
const footer=(label)=>line(1322)+txt(128,1377,'JULIO ANDRÉS GARCÍA SALAS PÉREZ · 22076',22,muted)+txt(2432,1377,label,22,muted,'text-anchor="end"');
const rawRects=[];const timeline=[];
function wrap(text,n=125){const lines=[];let row='';for(const word of text.split(' ')){if((row+' '+word).trim().length>n){lines.push(row);row=word;}else row=(row+' '+word).trim();}if(row)lines.push(row);return lines;}
async function frame(name,body,images=[]){const base=svg(`<rect width="${W}" height="${H}" fill="${paper}"/>${body}`);const buffer=await sharp(base).composite(images).png().toBuffer();const dest=path.join(out,'frames',name+'.png');fs.writeFileSync(dest,buffer);return dest;}
async function chapter(n,title,description){const id=`chapter-${n}`;const body=txt(128,132,'RECORRIDO DE LA API / '+String(n).padStart(2,'0'),24,accent,'letter-spacing="4"')+`<path d="M128 260H320" stroke="${accent}" stroke-width="5"/>`+txt(128,665,title,104,ink,'class="serif"')+txt(134,775,description,35,muted)+txt(2380,1090,'0'+n,420,'#E2E5D9','text-anchor="end" class="serif"')+footer('BACKEND · PROYECTO DE GRADUACIÓN 2026');await frame(id,body);timeline.push({frame:id,duration:3,subtitle:title+'. '+description});}
(async()=>{
 await frame('intro',txt(128,108,'UNIVERSIDAD DEL VALLE DE GUATEMALA',25,accent,'letter-spacing="3"')+txt(128,199,'PROYECTO DE GRADUACIÓN 2026',22,muted,'letter-spacing="3"')+txt(120,531,'Del protocolo',130,ink,'class="serif"')+txt(120,692,'al análisis cualitativo.',130,ink,'class="serif"')+txt(130,843,'Un recorrido del backend mediante peticiones HTTP reales.',39,muted)+txt(130,1000,'AUTENTICACIÓN  /  CORPUS  /  ANÁLISIS  /  EXPORTACIÓN',27,accent,'letter-spacing="2"')+footer('DEMOSTRACIÓN SIN NARRACIÓN · DATOS SINTÉTICOS'));
 timeline.push({frame:'intro',duration:8,subtitle:'Backend para investigación antropológica cualitativa. Julio Andrés García Salas Pérez · 22076.'});
 let chapterNo=0,oldChapter='';
 const desc=['Sesiones, creación de proyectos y validación de entradas.','Participantes, entrevistas, códigos y memos analíticos.','Delimitación, revisión metodológica, resúmenes y exportación.','Eliminación del proyecto temporal y comprobación de acceso.'];
 for(const scene of spec.scenes){
  if(scene.chapter!==oldChapter){await chapter(++chapterNo,scene.chapter,desc[chapterNo-1]);oldChapter=scene.chapter;}
  const number=String(scene.id).padStart(2,'0');const original=cp.execFileSync('git',['show',`${spec.sourceCommit}:capturas/captura-${number}.png`],{cwd:root,maxBuffer:10*1024*1024});
  // All Codex pointers are in the sidebar (x<520), except shot 01's Send button (x>2370, y<350).
  // The retained URL strip and API panes exclude those regions. JSON pixels are never retouched.
  const url={left:520,top:250,width:1850,height:88};
  const scan=await sharp(original).extract({left:532,top:350,width:1910,height:scene.height}).removeAlpha().raw().toBuffer();
  let cleanHeight=scene.height;
  for(let y=scene.height-4;y>scene.height-50;y--){let quiet=true;for(let yy=y-2;yy<=y+1&&quiet;yy++)for(let x=0;x<1910;x++){const j=(yy*1910+x)*3;if(scan[j]>110||scan[j+1]>110||scan[j+2]>110){quiet=false;break;}}if(quiet){cleanHeight=y;break;}}
  scene.height=cleanHeight;
  const body={left:520,top:350,width:2040,height:scene.height};
  const strip=await sharp(original).extract(url).png().toBuffer();const pane=await sharp(original).extract(body).png().toBuffer();
  const cleaned=await sharp({create:{width:2040,height:scene.height+100,channels:3,background:'#191919'}}).composite([{input:strip,left:0,top:0},{input:pane,left:0,top:100}]).png().toBuffer();
  const before=await sharp(original).extract(body).removeAlpha().raw().toBuffer();const after=await sharp(cleaned).extract({left:0,top:100,width:body.width,height:body.height}).removeAlpha().raw().toBuffer();
  if(!before.equals(after))throw Error('API pixels changed: '+number);
  fs.writeFileSync(path.join(out,'capturas',`captura-${number}.png`),cleaned);
  rawRects.push({capture:number,url,body,apiPixelsUnchanged:true,cursorOutsideRetainedRegions:true});
  // GET requests have no body: focus the actual response instead of empty Params controls.
  const get=scene.method==='GET'||scene.method==='DELETE';const focus=get?{left:928,top:100,width:1112,height:scene.height}:{left:0,top:100,width:2040,height:scene.height};
  const panel=await sharp(cleaned).extract(focus).resize({width:2208,height:940,fit:'inside',withoutEnlargement:!get}).png().toBuffer();const size=await sharp(panel).metadata();
  const px=Math.round((W-size.width)/2),py=280+Math.round((940-size.height)/2);
  const methodColor=scene.method==='DELETE'?'#984B43':scene.method==='POST'?'#8D613B':scene.method==='PATCH'?'#3C6278':ink;
  const header=txt(128,83,scene.chapter.toUpperCase(),24,accent,'letter-spacing="3"')+txt(128,166,scene.title,64,ink,'class="serif"')+txt(128,231,scene.method,27,methodColor,'class="mono" font-weight="700"')+txt(280,231,scene.path,26,muted,'class="mono"')+txt(2432,90,number+' / 15',29,muted,'text-anchor="end"')+txt(2432,220,'HTTP '+scene.status,28,scene.status>=400?'#984B43':ink,'text-anchor="end" class="mono"');
  const label=txt(128,1270,scene.caption,31,ink)+footer('EVIDENCIA REAL · CUENTA QA · DATOS SINTÉTICOS');
  const border=`<rect x="${px-14}" y="${py-14}" width="${size.width+28}" height="${size.height+28}" rx="12" fill="#D9DDCF"/>`;
  const id='step-'+number;await frame(id,header+border+label,[{input:panel,left:px,top:py}]);timeline.push({frame:id,duration:scene.duration,subtitle:scene.caption});
 }
 await frame('outro',txt(128,112,'CIERRE DEL RECORRIDO',24,accent,'letter-spacing="4"')+txt(120,480,'Un backend independiente.',112,ink,'class="serif"')+txt(132,647,'Peticiones reales. Respuestas verificadas.',46,ink)+txt(132,758,'Sin páginas ni componentes de frontend en la entrega.',34,muted)+txt(132,825,'El proyecto temporal fue eliminado y la sesión QA se cerró.',34,muted)+footer('FIN DEL RECORRIDO / API BACKEND'));
 timeline.push({frame:'outro',duration:8,subtitle:'Recorrido completado. Backend independiente, proyecto temporal eliminado y sesión QA cerrada.'});
 let elapsed=0;const stamp=t=>`${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor(t/60)%60).padStart(2,'0')}:${String(Math.floor(t)%60).padStart(2,'0')},000`;
 const srt=timeline.map((s,i)=>{const begin=elapsed;elapsed+=s.duration;return`${i+1}\n${stamp(begin)} --> ${stamp(elapsed)}\n${wrap(s.subtitle).join('\n')}\n`;}).join('\n');
 fs.writeFileSync(path.join(out,'subtitulos.srt'),srt);fs.writeFileSync(path.join(out,'timeline.json'),JSON.stringify({width:W,height:H,fps:24,duration:elapsed,shots:timeline,crops:rawRects},null,2)+'\n');
 console.log(JSON.stringify({out,duration:elapsed,shots:timeline.length,captures:rawRects.length,apiPixelsPreserved:rawRects.every(x=>x.apiPixelsUnchanged)}));
})().catch(e=>{console.error(e);process.exitCode=1});
