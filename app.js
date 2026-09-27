const $=s=>document.querySelector(s);
const video=$("#video"),cameraMark=$("#cameraMark"),cctx=cameraMark.getContext("2d");
const target=$("#target"),targetMark=$("#targetMark"),tctx=targetMark.getContext("2d");
const work=document.createElement("canvas"),wctx=work.getContext("2d",{willReadFrequently:true});
const audio=new Audio("assets/disparo.wav");audio.preload="auto";audio.volume=.85;

let stream=null,raf=0,running=false,paused=false;
let shots=[],points=0,lastPulse=0,armed=true,seenFrames=0,offFrames=0,prevStrength=0;
const OFF_REQUIRED=7, ON_REQUIRED=2, MIN_GAP=850;

function size(){
  const r=video.getBoundingClientRect();
  cameraMark.width=Math.max(1,Math.round(r.width*devicePixelRatio));
  cameraMark.height=Math.max(1,Math.round(r.height*devicePixelRatio));
  const tr=target.getBoundingClientRect();
  if(tr.width&&tr.height){
    targetMark.width=Math.round(tr.width*devicePixelRatio);
    targetMark.height=Math.round(tr.height*devicePixelRatio);
    targetMark.style.width=tr.width+"px";targetMark.style.height=tr.height+"px";
    targetMark.style.left=target.offsetLeft+"px";targetMark.style.top=target.offsetTop+"px";
  }
  drawTargetMarks();
}
addEventListener("resize",size);target.addEventListener("load",size);
target.addEventListener("error",()=>$("#loadError").classList.remove("hidden"));

function findLaser(){
  // Conservative detector: a tiny, highly saturated red point.
  const W=360,H=270;work.width=W;work.height=H;
  wctx.drawImage(video,0,0,W,H);
  const d=wctx.getImageData(0,0,W,H).data;
  let bx=0,by=0,best=0;
  for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){
    const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    const s=r-Math.max(g,b);
    if(r>170&&r>g*1.9&&r>b*1.8&&s>115&&s>best){best=s;bx=x;by=y}
  }
  if(best<115)return null;
  let n=0,sx=0,sy=0,ss=0;
  for(let y=Math.max(0,by-5);y<=Math.min(H-1,by+5);y++)for(let x=Math.max(0,bx-5);x<=Math.min(W-1,bx+5);x++){
    const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],s=r-Math.max(g,b);
    if(r>150&&r>g*1.6&&r>b*1.5&&s>75){n++;sx+=x;sy+=y;ss+=s}
  }
  if(n<2||n>55)return null;
  return {x:sx/n/W,y:sy/n/H,strength:ss/n};
}

function scoreAt(u,v){
  const x=u*1074,y=v*1432;
  if(((x-548)/110)**2+((y-190)/150)**2<1)return 5;
  if(((x-570)/175)**2+((y-895)/390)**2<1)return 5;
  if(x>=355&&x<=510&&y>=300&&y<=760)return 4;
  if(x>=590&&x<=770&&y>=300&&y<=790)return 4;
  if(x>=285&&x<=520&&y>=780&&y<=1410)return 4;
  if(x>=610&&x<=840&&y>=780&&y<=1410)return 4;
  if(x<360&&y>360&&y<1050)return 3;
  if(x>760&&y>350&&y<1260)return 2;
  return 0;
}

function drawCamera(p){
  cctx.clearRect(0,0,cameraMark.width,cameraMark.height);
  if(!p)return;
  const x=p.x*cameraMark.width,y=p.y*cameraMark.height,r=12*devicePixelRatio;
  cctx.strokeStyle="#ff3030";cctx.lineWidth=3*devicePixelRatio;cctx.beginPath();cctx.arc(x,y,r,0,Math.PI*2);cctx.stroke();
}
function drawTargetMarks(){
  tctx.clearRect(0,0,targetMark.width,targetMark.height);
  shots.forEach((s,i)=>{
    const x=s.u*targetMark.width,y=s.v*targetMark.height,r=13*devicePixelRatio;
    tctx.strokeStyle="#ff2020";tctx.lineWidth=3*devicePixelRatio;tctx.beginPath();tctx.arc(x,y,r,0,Math.PI*2);tctx.stroke();
    tctx.fillStyle="#ff2020";tctx.beginPath();tctx.arc(x,y,4*devicePixelRatio,0,Math.PI*2);tctx.fill();
    tctx.fillStyle="#fff";tctx.font=`bold ${13*devicePixelRatio}px Arial`;tctx.textAlign="center";tctx.textBaseline="middle";tctx.fillText(i+1,x,y);
  });
}

function register(p){
  const now=performance.now();if(now-lastPulse<MIN_GAP)return;
  lastPulse=now;
  const u=Math.max(.01,Math.min(.99,p.x)),v=Math.max(.01,Math.min(.99,p.y));
  const sc=scoreAt(u,v);shots.push({u,v,sc});points+=sc;
  $("#shotCount").textContent=shots.length;$("#score").textContent=points;$("#last").textContent=sc;
  try{audio.currentTime=0;audio.play().catch(()=>{})}catch(e){}
  drawTargetMarks();
}

function loop(){
  if(!running)return;
  if(!paused){
    const p=findLaser();
    if(p){
      drawCamera(p);$("#state").textContent=armed?"PULSO DETECTADO":"ESPERANDO QUE DESAPAREZCA…";
      const rise=p.strength-prevStrength;prevStrength=p.strength;
      if(armed && rise>35){seenFrames++;if(seenFrames>=ON_REQUIRED){register(p);armed=false;seenFrames=0;offFrames=0}}
      else if(!armed){offFrames=0}
    }else{
      drawCamera(null);$("#state").textContent=armed?"BUSCANDO LÁSER…":"RECARGANDO…";seenFrames=0;prevStrength=0;
      if(!armed){offFrames++;if(offFrames>=OFF_REQUIRED){armed=true;offFrames=0}}
    }
  }
  raf=requestAnimationFrame(loop);
}

async function openCamera(){
  if(!navigator.mediaDevices?.getUserMedia){alert("Cámara no disponible en este navegador.");return false}
  try{
    if(stream)stream.getTracks().forEach(t=>t.stop());
    try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:"environment"},width:{ideal:1280},height:{ideal:1920}}})}
    catch(e){stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}}})}
    video.srcObject=stream;
    await new Promise(resolve=>{if(video.readyState>=1)resolve();else video.onloadedmetadata=resolve});
    await video.play();
    size();
    $("#state").textContent="CÁMARA ACTIVA · BUSCANDO LÁSER…";
    return true;
  }catch(e){alert("No se pudo abrir la cámara. Revisá los permisos de Safari.");return false}
}

async function start(){
  // Unlock iPhone audio from the user's tap.
  try{await audio.play();audio.pause();audio.currentTime=0}catch(e){}
  $("#home").classList.add("hidden");$("#result").classList.add("hidden");$("#session").classList.remove("hidden");
  shots=[];points=0;armed=true;seenFrames=0;offFrames=0;prevStrength=0;lastPulse=0;
  $("#shotCount").textContent="0";$("#score").textContent="0";$("#last").textContent="—";
  if(!await openCamera()){$("#session").classList.add("hidden");$("#home").classList.remove("hidden");return}
  running=true;paused=false;$("#pause").textContent="PAUSAR";drawTargetMarks();loop();
}

function finish(){
  running=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());
  $("#rShots").textContent=shots.length;$("#rPoints").textContent=points;
  $("#rAvg").textContent=shots.length?(points/shots.length).toFixed(1):"0.0";
  $("#rBest").textContent=shots.length?Math.max(...shots.map(s=>s.sc)):0;
  $("#session").classList.add("hidden");$("#result").classList.remove("hidden");
}
$("#start").onclick=start;$("#finish").onclick=finish;
$("#pause").onclick=()=>{paused=!paused;$("#pause").textContent=paused?"CONTINUAR":"PAUSAR"};
$("#again").onclick=()=>{$("#result").classList.add("hidden");$("#home").classList.remove("hidden")};
