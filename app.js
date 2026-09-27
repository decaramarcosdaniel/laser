
let audioCtx=null;
function setupAudio(){try{audioCtx=new (window.AudioContext||window.webkitAudioContext)(); if(audioCtx.state==='suspended') audioCtx.resume();}catch(e){}}
function gunshot(){if(!audioCtx)return; const t=audioCtx.currentTime; const master=audioCtx.createGain(); const osc=audioCtx.createOscillator(); const gain=audioCtx.createGain(); const n=audioCtx.createBufferSource(); const b=audioCtx.createBuffer(1,audioCtx.sampleRate*.12,audioCtx.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*(1-i/d.length); n.buffer=b; const ng=audioCtx.createGain(); ng.gain.setValueAtTime(.0001,t); ng.gain.exponentialRampToValueAtTime(.7,t+.002); ng.gain.exponentialRampToValueAtTime(.0001,t+.11); osc.type='sawtooth'; osc.frequency.setValueAtTime(125,t); osc.frequency.exponentialRampToValueAtTime(48,t+.09); gain.gain.setValueAtTime(.0001,t); gain.gain.exponentialRampToValueAtTime(.4,t+.002); gain.gain.exponentialRampToValueAtTime(.0001,t+.09); osc.connect(gain).connect(master); n.connect(ng).connect(master); master.connect(audioCtx.destination); osc.start(t); osc.stop(t+.1); n.start(t); n.stop(t+.12);}
const $=s=>document.querySelector(s);
const home=$('#home'),session=$('#session'),result=$('#result');
const video=$('#video'),overlay=$('#overlay'),ctx=overlay.getContext('2d');
const targetImg=$('#target'),targetMarks=$('#targetMarks'),tm=targetMarks.getContext('2d');
let stream=null, raf=0, running=false, processing=false, shots=[], lastRed=0, lastPoint=null, laserOn=false, lastLaserSeen=0, frameNo=0, work=document.createElement('canvas'),wc=work.getContext('2d',{willReadFrequently:true});

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
    running=true; processing=false; shots=[]; lastRed=0; lastPoint=null; laserOn=false; lastLaserSeen=0; frameNo=0; updateStats(); drawTarget();
    status('CÁMARA ACTIVA',true); requestAnimationFrame(loop);
  }catch(e){
    stopCamera(); show(home); const msg=e.name==='NotAllowedError'?'Permiso de cámara denegado. En iPhone: Ajustes > Safari > Cámara > Permitir.':(e.message||'No se pudo iniciar la cámara.'); $('#homeError').textContent=msg; $('#homeError').classList.remove('hidden');
  }
}
function stopCamera(){running=false;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null;cancelAnimationFrame(raf)}
function finish(){stopCamera();$('#resultShots').textContent=shots.length;$('#totalResult').textContent=shots.reduce((a,s)=>a+s.score,0);$('#resultAverage').textContent=shots.length?(shots.reduce((a,s)=>a+s.score,0)/shots.length).toFixed(1):'0.0';$('#resultBest').textContent=shots.length?Math.max(...shots.map(s=>s.score)):0;show(result)}

function loop(){if(!running)return; detectLaser(); raf=requestAnimationFrame(loop)}

// Detector V11: busca el punto rojo directamente en la imagen de cámara,
// con mayor resolución y detección por evento (aparece/desaparece), no por
// cantidad fija de píxeles. Esto funciona mejor cuando el punto láser ocupa
// sólo 1–10 píxeles en el iPhone.
function detectLaser(){
  if(video.readyState<2||processing)return;
  processing=true;
  try{
    const vw=video.videoWidth||1280, vh=video.videoHeight||720;
    const w=480, h=Math.max(270,Math.round(w*vh/vw));
    work.width=w; work.height=h;
    wc.drawImage(video,0,0,w,h);
    const d=wc.getImageData(0,0,w,h).data;

    let best=-1, bx=0, by=0, br=0, bg=0, bb=0;
    // Primero encontramos el píxel rojo más fuerte.
    for(let y=1;y<h-1;y++){
      const row=y*w*4;
      for(let x=1;x<w-1;x++){
        const i=row+x*4, r=d[i], g=d[i+1], b=d[i+2];
        const red=r-Math.max(g,b);
        const score=red + Math.max(0,r-150)*0.45;
        if(r>125 && red>42 && r>g*1.20 && r>b*1.20 && score>best){
          best=score; bx=x; by=y; br=r; bg=g; bb=b;
        }
      }
    }

    const now=performance.now();
    let found=false, u=0, v=0, strength=0, area=0;

    if(best>=48){
      // Agrupamos alrededor del máximo. El láser puede ser diminuto.
      let sx=0,sy=0,sw=0;
      const radius=7;
      for(let y=Math.max(1,by-radius);y<=Math.min(h-2,by+radius);y++){
        for(let x=Math.max(1,bx-radius);x<=Math.min(w-2,bx+radius);x++){
          const i=(y*w+x)*4, r=d[i], g=d[i+1], b=d[i+2];
          const red=r-Math.max(g,b);
          if(r>115 && red>32 && r>g*1.16 && r>b*1.16){
            const dist=Math.hypot(x-bx,y-by);
            if(dist<=radius){
              const weight=Math.max(1,red);
              sx+=x*weight; sy+=y*weight; sw+=weight; area++;
            }
          }
        }
      }
      if(sw>0){
        u=(sx/sw)/w; v=(sy/sw)/h; strength=best; found=area<=260;
      }
    }

    // Evita que objetos grandes rojos (ropa, luces, carteles) se conviertan
    // en disparos: el candidato debe ser pequeño y muy dominante en rojo.
    if(found){
      if(now-lastLaserSeen>120) laserOn=false;
      const moved=!lastPoint || Math.hypot(u-lastPoint.x,v-lastPoint.y)>0.012;
      const rising=!laserOn;
      const cooldown=now-lastRed>280;
      if((rising||moved) && cooldown){
        registerShot(u,v);
        lastRed=now;
        lastPoint={x:u,y:v};
        laserOn=true;
        status(`LÁSER DETECTADO · ${Math.round(strength)}`,true);
      }
      lastLaserSeen=now;
    }else if(laserOn && now-lastLaserSeen>110){
      laserOn=false;
    }

    // Si no hay disparo, mantenemos el indicador de cámara activo.
    if(!found && now-lastRed>700) status('CÁMARA ACTIVA · APUNTA AL BLANCO',true);
    frameNo++;
  }catch(e){
    console.warn('Detector:',e);
  }finally{processing=false;}
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
