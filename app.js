const $=s=>document.querySelector(s);
const home=$('#home'),session=$('#session'),result=$('#result');
const video=$('#video'),overlay=$('#overlay'),ctx=overlay.getContext('2d');
const targetImg=$('#target'),targetMarks=$('#targetMarks'),tm=targetMarks.getContext('2d');
let stream=null, raf=0, running=false, processing=false, shots=[], lastRed=0, lastPoint=null, work=document.createElement('canvas'),wc=work.getContext('2d',{willReadFrequently:true});

function show(el){[home,session,result].forEach(x=>x.classList.remove('active'));el.classList.add('active')}
function resize(){const r=video.getBoundingClientRect();overlay.width=Math.max(1,Math.round(r.width*devicePixelRatio));overlay.height=Math.max(1,Math.round(r.height*devicePixelRatio));ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
function status(t,ok=false){$('#cameraStatus').textContent=t;$('#cameraStatus').classList.toggle('ok',ok)}

async function getCamera(){
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador no permite acceder a la cámara.');
  const common={audio:false,video:{facingMode:{exact:'environment'},width:{ideal:1280},height:{ideal:1920}}};
  try{return await navigator.mediaDevices.getUserMedia(common)}
  catch(e){
    if(e.name==='OverconstrainedError'||e.name==='NotFoundError') return await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:1920}}});
    throw e;
  }
}

async function start(){
  $('#homeError').classList.add('hidden');
  show(session); status('SOLICITANDO CÁMARA…');
  try{
    stream=await getCamera(); video.srcObject=stream;
    await new Promise((resolve,reject)=>{video.onloadedmetadata=resolve;setTimeout(()=>reject(new Error('Tiempo de espera de la cámara agotado.')),8000)});
    await video.play(); resize(); window.addEventListener('resize',resize);
    running=true; processing=false; shots=[]; lastRed=0; lastPoint=null; updateStats(); drawTarget();
    status('CÁMARA ACTIVA',true); requestAnimationFrame(loop);
  }catch(e){
    stopCamera(); show(home); const msg=e.name==='NotAllowedError'?'Permiso de cámara denegado. En iPhone: Ajustes > Safari > Cámara > Permitir.':(e.message||'No se pudo iniciar la cámara.'); $('#homeError').textContent=msg; $('#homeError').classList.remove('hidden');
  }
}
function stopCamera(){running=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;cancelAnimationFrame(raf)}
function finish(){stopCamera();$('#resultShots').textContent=shots.length;$('#totalResult').textContent=shots.reduce((a,s)=>a+s.score,0);$('#resultAverage').textContent=shots.length?(shots.reduce((a,s)=>a+s.score,0)/shots.length).toFixed(1):'0.0';$('#resultBest').textContent=shots.length?Math.max(...shots.map(s=>s.score)):0;show(result)}

function loop(){if(!running)return; detectLaser(); raf=requestAnimationFrame(loop)}
function detectLaser(){
  if(video.readyState<2||processing)return; processing=true;
  const w=320,h=Math.max(240,Math.round(320*video.videoHeight/video.videoWidth)); work.width=w;work.height=h;wc.drawImage(video,0,0,w,h);
  const d=wc.getImageData(0,0,w,h).data; let sx=0,sy=0,n=0,max=0;
  for(let y=0;y<h;y+=2)for(let x=0;x<w;x+=2){const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];const v=r-(g*.75+b*.75);if(r>155&&r>g*1.45&&r>b*1.45&&v>35){sx+=x;sy+=y;n++;if(r>max)max=r}}
  const now=performance.now();
  if(n>=2&&n<=500){const x=(sx/n)/w,y=(sy/n)/h;if(max>205&&(now-lastRed>240)&&(!lastPoint||Math.hypot(x-lastPoint.x,y-lastPoint.y)>.018)){registerShot(x,y);lastRed=now;lastPoint={x,y}}}
  processing=false;
}
function registerShot(u,v){
  const score=scoreAt(u,v);shots.push({u,v,score});updateStats();drawImpact(u,v,shots.length,score)}
function scoreAt(u,v){
  // Approximate mapping for the supplied target. It is intentionally conservative until automatic target calibration is improved.
  const x=u*1060,y=v*1484;
  const cx=530,cy=730; const dx=(x-cx)/470,dy=(y-cy)/650; const r=Math.sqrt(dx*dx+dy*dy);
  if(r<.13)return 5;if(r<.28)return 4;if(r<.48)return 3;if(r<.70)return 2;if(r<.88)return 1;return 0;
}
function updateStats(){const p=shots.reduce((a,s)=>a+s.score,0);$('#shots').textContent=shots.length;$('#points').textContent=p;$('#average').textContent=shots.length?(p/shots.length).toFixed(1):'0.0';$('#shotCount').textContent=`${shots.length} ${shots.length===1?'DISPARO':'DISPAROS'}`;$('#liveScore').textContent=`${p} PTS`;$('#last').textContent=shots.length?`ÚLTIMO: ${shots.at(-1).score}`:'—'}
function drawTarget(){const r=targetMarks.getBoundingClientRect();targetMarks.width=Math.max(1,Math.round(r.width*devicePixelRatio));targetMarks.height=Math.max(1,Math.round(r.height*devicePixelRatio));tm.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0);tm.clearRect(0,0,r.width,r.height);shots.forEach((s,i)=>drawMark(s.u,s.v,i+1,s.score,false))}
function drawMark(u,v,num,score,clear=true){const r=targetMarks.getBoundingClientRect();if(clear)drawTarget();const x=u*r.width,y=v*r.height;tm.save();tm.strokeStyle='#e11';tm.fillStyle='#e11';tm.lineWidth=2.5;tm.beginPath();tm.arc(x,y,10,0,Math.PI*2);tm.stroke();tm.beginPath();tm.arc(x,y,3,0,Math.PI*2);tm.fill();tm.font='bold 11px Arial';tm.fillText(`${num} · ${score}`,x+13,y-8);tm.restore()}
window.addEventListener('resize',()=>{if(session.classList.contains('active'))drawTarget()});
$('#start').onclick=start;$('#finish').onclick=finish;$('#again').onclick=()=>{show(home)};
targetImg.onload=drawTarget;
