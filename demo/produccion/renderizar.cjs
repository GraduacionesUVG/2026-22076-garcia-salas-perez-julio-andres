// Offline rendering of the verified screenshot composition. All ffmpeg children are awaited.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const work=process.argv[2];if(!work)throw Error('Uso: node renderizar.cjs <carpeta-generada>');
const onlyScene=process.argv[3];
const spec=JSON.parse(fs.readFileSync(path.join(work,'timeline.json'),'utf8'));
let active;let aborted=false;for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{aborted=true;active?.kill(signal);});
function run(args){return new Promise((resolve,reject)=>{active=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','inherit','inherit']});console.log('FFMPEG_PID='+active.pid);active.on('exit',(code,signal)=>{active=undefined;code===0&&!aborted?resolve():reject(Error('ffmpeg terminó: '+(signal||code)));});active.on('error',reject);});}
(async()=>{
 for(let i=0;i<spec.shots.length;i++){
  const s=spec.shots[i],output=path.join(work,'clips',String(i).padStart(2,'0')+'.mp4');
  if(onlyScene&&s.frame!==onlyScene){if(!fs.existsSync(output))throw Error('Falta escena previa: '+s.frame);continue;}
  const fades=[...(i===0?[]:['fade=t=in:st=0:d=0.30:color=0xF3F1EA']),...(i===spec.shots.length-1?[]:[`fade=t=out:st=${s.duration-.20}:d=0.20:color=0xF3F1EA`])].join(',');
  await run(['-loop','1','-framerate','24','-i',path.join(work,'frames',s.frame+'.png'),'-t',String(s.duration),'-vf',fades,'-c:v','libx264','-threads','2','-preset','veryfast','-tune','stillimage','-crf','19','-pix_fmt','yuv420p','-an',output]);
  console.log(`Escena ${i+1}/${spec.shots.length}: ${s.frame}`);
 }
 const list=spec.shots.map((s,i)=>`file '${path.join(work,'clips',String(i).padStart(2,'0')+'.mp4')}'`).join('\n');fs.writeFileSync(path.join(work,'clips.txt'),list+'\n');
 await run(['-f','concat','-safe','0','-i',path.join(work,'clips.txt'),'-i',path.join(work,'subtitulos.srt'),'-map','0:v:0','-map','1:0','-c:v','copy','-c:s','mov_text','-metadata:s:s:0','language=spa','-disposition:s:0','default','-metadata','title=Del protocolo al análisis cualitativo - Backend 22076','-an','-movflags','+faststart',path.join(work,'demo.mp4')]);
 console.log('VIDEO_FINAL='+path.join(work,'demo.mp4'));
})().catch(e=>{console.error(e.message);process.exitCode=1});
