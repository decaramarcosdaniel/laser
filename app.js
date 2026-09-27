const $=s=>document.querySelector(s);
const video=$("#video"), overlay=$("#overlay"), ctx=overlay.getContext("2d",{willReadFrequently:true});
const target=$("#target"), box=$("#targetBox"), marks=$("#marks"), mctx=marks.getContext("2d");
const work=document.createElement("canvas"), wc=work.getContext("2d",{willReadFrequently:true});
const shotAudio=new Audio("assets/disparo.wav");shotAudio.preload="auto";shotAudio.volume=.85;

let stream=null,running=false,paused=false,raf=0,shots=[],total=0;
let detectionStart=0,armed=true,absentSince=0,lastShot=0,currentPoint=null;
const MIN_ON=55,MIN_OFF=260,COOLDOWN=700;

function sizeCanvases(){
  const vr=video.getBoundingClientRect();
  overlay.width=Math.max(1,Math.round(vr.width*devicePixelRatio));
  overlay.height=Math.max(1,Math.round(vr.height*devicePixelRatio));
  sizeMarks();drawOverlay(currentPoint);
}
function sizeMarks(){
  const r=target.getBoundingClientRect();
  if(!r.width||!r.height)return;
  marks.width=Math.max(1,Math.round(r.width*devicePixelRatio));
  marks.height=Math.max(1,Math.round(r.height*devicePixelRatio));
  marks.style.width=r.width+"px";
  marks.style.height=r.height+"px";
  marks.style.left=(target.offsetLeft)+"px";
  marks.style.top=(target.offsetTop)+"px";
  drawMarks();
}
addEventListener("resize",sizeCanvases);
target.addEventListener("load",sizeMarks);
target.addEventListener("error",()=>$("#targetError").classList.remove("hidden"));

function detectRed(){
  const W=720,H=Math.max(480,Math.round(720*(video.videoHeight/video.videoWidth||1.5)));
  work.width=W;work.height=H;wc.drawImage(video,0,0,W,H);
  const d=wc.getImageData(0,0,W,H).data;
  let best=-1,bx=0,by=0;
  for(let y=1;y<H-1;y+=2)for(let x=1;x<W-1;x+=2){
    const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],s=r-Math.max(g,b);
    if(r>145&&r>g*1.65&&r>b*1.55&&s>85&&s>best){best=s;bx=x;by=y}
  }
  if(best<85)return null;
  let count=0,sx=0,sy=0;
  for(let y=Math.max(0,by-5);y<=Math.min(H-1,by+5);y++)
    for(let x=Math.max(0,bx-5);x<=Math.min(W-1,bx+5);x++){
      const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];
      if(r>125&&r>g*1.45&&r>b*1.35&&r-Math.max(g,b)>55){count++;sx+=x;sy+=y}
    }
  if(count<2)return null;
  return {x:sx/count/W,y:sy/count/H};
}

/* En esta versión la imagen inferior siempre se muestra.
   El marcador se dibuja directamente sobre sus dimensiones reales. */
function cameraToTarget(p){
  // Primer mapeo automático para cuando el blanco ocupa la cámara.
  // Mantiene el punto dentro del blanco visible.
  return {u:Math.max(.02,Math.min(.98,p.x)),v:Math.max(.02,Math.min(.98,p.y))};
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

function drawOverlay(p){
  ctx.clearRect(0,0,overlay.width,overlay.height);
  if(!p)return;
  const x=p.x*overlay.width,y=p.y*overlay.height,r=12*devicePixelRatio;
  ctx.strokeStyle="#ff3030";ctx.lineWidth=3*devicePixelRatio;
  ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle="#fff";ctx.lineWidth=devicePixelRatio;
  ctx.beginPath();ctx.moveTo(x-r*1.7,y);ctx.lineTo(x+r*1.7,y);ctx.moveTo(x,y-r*1.7);ctx.lineTo(x,y+r*1.7);ctx.stroke();
}

function drawMarks(){
  mctx.clearRect(0,0,marks.width,marks.height);
  shots.forEach((s,i)=>{
    const x=s.u*marks.width,y=s.v*marks.height,r=13*devicePixelRatio;
    mctx.strokeStyle="#ff3030";mctx.lineWidth=3*devicePixelRatio;
    mctx.beginPath();mctx.arc(x,y,r,0,Math.PI*2);mctx.stroke();
    mctx.fillStyle="#ff3030";mctx.beginPath();mctx.arc(x,y,3.5*devicePixelRatio,0,Math.PI*2);mctx.fill();
    mctx.fillStyle="#fff";mctx.font=`bold ${13*devicePixelRatio}px Arial`;
    mctx.textAlign="center";mctx.textBaseline="middle";mctx.fillText(String(i+1),x,y);
  });
}

function registerShot(p){
  const now=performance.now();
  if(now-lastShot<COOLDOWN)return;
  lastShot=now;
  const q=cameraToTarget(p),score=scoreAt(q.u,q.v);
  shots.push({u:q.u,v:q.v,score});total+=score;
  $("#shots").textContent=shots.length;$("#points").textContent=total;$("#last").textContent=score;
  $("#flash").classList.remove("on");void $("#flash").offsetWidth;$("#flash").classList.add("on");
  try{shotAudio.currentTime=0;const r=shotAudio.play();if(r?.catch)r.catch(()=>{})}catch(e){}
  drawMarks();
}

function loop(){
  if(!running)return;
  if(!paused){
    const p=detectRed(),now=performance.now();
    if(p){
      currentPoint=p;drawOverlay(p);
      $("#status").textContent=armed?"LÁSER DETECTADO":"ESPERANDO FIN DEL DISPARO…";
      if(armed){
        if(!detectionStart)detectionStart=now;
        if(now-detectionStart>=MIN_ON){
          registerShot(p);armed=false;absentSince=0;detectionStart=0;
        }
      }
    }else{
      currentPoint=null;drawOverlay();
      $("#status").textContent=armed?"BUSCANDO LÁSER…":"RECARGANDO…";
      detectionStart=0;
      if(!armed){
        if(!absentSince)absentSince=now;
        if(now-absentSince>=MIN_OFF)armed=true;
      }
    }
  }
  raf=requestAnimationFrame(loop);
}

async function openCamera(){
  if(!navigator.mediaDevices?.getUserMedia){alert("Este navegador no permite acceder a la cámara.");return false}
  try{
    if(stream)stream.getTracks().forEach(t=>t.stop());
    try{stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{exact:"environment"},width:{ideal:1280},height:{ideal:1920}}})}
    catch(e){stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}}})}
    video.srcObject=stream;
    await new Promise(r=>{if(video.readyState>=1)r();else video.onloadedmetadata=r});
    await video.play();
    requestAnimationFrame(sizeCanvases);
    return true;
  }catch(e){alert("No se pudo abrir la cámara. Revisá los permisos de Safari.");return false}
}

async function start(){
  // Desbloquea el audio en iPhone desde la interacción del usuario.
  try{await shotAudio.play();shotAudio.pause();shotAudio.currentTime=0}catch(e){}
  $("#home").classList.add("hidden");$("#result").classList.add("hidden");$("#session").classList.remove("hidden");
  shots=[];total=0;armed=true;detectionStart=0;absentSince=0;lastShot=0;
  $("#shots").textContent="0";$("#points").textContent="0";$("#last").textContent="—";
  drawMarks();
  // Garantiza que el blanco quede visible aunque el video tarde en arrancar.
  if(!await openCamera()){$("#session").classList.add("hidden");$("#home").classList.remove("hidden");return}
  requestAnimationFrame(sizeCanvases);
  running=true;paused=false;$("#pause").textContent="PAUSAR";loop();
}

function finish(){
  running=false;cancelAnimationFrame(raf);
  if(stream)stream.getTracks().forEach(t=>t.stop());
  $("#rs").textContent=shots.length;$("#rp").textContent=total;
  $("#ra").textContent=shots.length?(total/shots.length).toFixed(1):"0.0";
  $("#rb").textContent=shots.length?Math.max(...shots.map(s=>s.score)):0;
  $("#session").classList.add("hidden");$("#result").classList.remove("hidden");
}
$("#startBtn").onclick=start;
$("#finish").onclick=finish;
$("#pause").onclick=()=>{paused=!paused;$("#pause").textContent=paused?"CONTINUAR":"PAUSAR"};
$("#again").onclick=()=>{$("#result").classList.add("hidden");$("#home").classList.remove("hidden")};
