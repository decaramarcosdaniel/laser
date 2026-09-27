const $=s=>document.querySelector(s);
const video=$("#video"), overlay=$("#overlay"), octx=overlay.getContext("2d");
const processor=$("#processor"), pctx=processor.getContext("2d",{willReadFrequently:true});
let stream=null, raf=0, active=false, session=false, calibrated=false;
let lastDetection=0, shots=[], frames=0, fpsFrames=0, fpsAt=performance.now();
let cfg={sensitivity:72,minArea:5,cooldown:500};

function setStatus(text, cls="off"){const e=$("#status");e.textContent="● "+text;e.className="status "+cls}
function resize(){
  if(!video.videoWidth)return;
  overlay.width=video.videoWidth;overlay.height=video.videoHeight;
  drawOverlay();
}
function drawOverlay(point=null){
  if(!overlay.width)return;
  octx.clearRect(0,0,overlay.width,overlay.height);
  const w=overlay.width,h=overlay.height;
  if(calibrated){
    octx.strokeStyle="#22c55e";octx.lineWidth=Math.max(3,w/320);
    octx.strokeRect(w*.04,h*.04,w*.92,h*.92);
  }
  if(point){
    octx.beginPath();octx.arc(point.x,point.y,Math.max(13,w/70),0,Math.PI*2);
    octx.strokeStyle="#fff";octx.lineWidth=3;octx.stroke();
    octx.beginPath();octx.arc(point.x,point.y,Math.max(9,w/90),0,Math.PI*2);
    octx.fillStyle="#ef4444";octx.fill();
  }
}
async function startCamera(){
  if(!navigator.mediaDevices?.getUserMedia){
    setStatus("Cámara no disponible","err");
    $("#message").textContent="Safari no habilitó la cámara. Verificá que la página esté en HTTPS.";
    return;
  }
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());
    stream=await navigator.mediaDevices.getUserMedia({
      audio:false,
      video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:30,max:60}}
    });
    video.srcObject=stream;
    await video.play();
    processor.width=480;
    processor.height=Math.round(480*(video.videoHeight/video.videoWidth));
    resize();
    active=true;
    setStatus("Cámara activa","on");
    $("#cameraBtn").textContent="🔄 Reiniciar cámara";
    $("#calibrateBtn").disabled=false;
    $("#message").textContent="Cámara activa. Encuadrá el blanco completo.";
    cancelAnimationFrame(raf);raf=requestAnimationFrame(loop);
  }catch(err){
    console.error(err);
    setStatus("Error de cámara","err");
    $("#message").textContent="Permiso de cámara denegado o cámara ocupada. En Safari: Ajustes → Safari → Cámara → Permitir.";
  }
}
function calibrate(){
  if(!active)return;
  calibrated=true;
  drawOverlay();
  $("#sessionBtn").disabled=false;
  $("#message").textContent="Blanco calibrado. Ahora iniciá la sesión.";
}
function startSession(){
  if(!calibrated)return;
  session=true; shots=[]; lastDetection=0; render();
  $("#sessionBtn").disabled=true;$("#stopBtn").disabled=false;
  $("#message").textContent="SESIÓN ACTIVA — probá el láser rojo.";
}
function stopSession(){session=false;$("#sessionBtn").disabled=false;$("#stopBtn").disabled=true;$("#message").textContent="Sesión detenida."}
function scorePlaceholder(){return 0}
function record(point){
  const now=performance.now();
  if(now-lastDetection<cfg.cooldown)return;
  lastDetection=now;
  const n=shots.length+1;
  shots.push({n,time:new Date().toLocaleTimeString(),x:point.x,y:point.y,score:scorePlaceholder()});
  render();
  drawOverlay(point);
}
function render(){
  const total=shots.reduce((a,s)=>a+s.score,0),avg=shots.length?total/shots.length:0;
  $("#shots").textContent=shots.length;$("#score").textContent=total;$("#avg").textContent=avg.toFixed(1);
  $("#list").innerHTML=shots.length?shots.slice().reverse().map(s=>`<div class="item"><div class="badge">🔴</div><div><b>Detección #${s.n}</b><br><small>${s.time} · X ${Math.round(s.x)} · Y ${Math.round(s.y)}</small></div><strong>LÁSER</strong></div>`).join(""):'<p class="muted">Sin impactos.</p>';
}
function detect(){
  if(video.readyState<2)return null;
  const W=processor.width,H=processor.height;
  pctx.drawImage(video,0,0,W,H);
  const data=pctx.getImageData(0,0,W,H).data;
  let sx=0,sy=0,count=0;
  const sens=cfg.sensitivity/100;
  // Requiere rojo dominante + luminosidad alta + saturación.
  // Se muestrea cada 2 px para mantener rendimiento en iPhone.
  for(let y=0;y<H;y+=2){
    for(let x=0;x<W;x+=2){
      const i=(y*W+x)*4,r=data[i],g=data[i+1],b=data[i+2];
      const max=Math.max(r,g,b), min=Math.min(r,g,b);
      const sat=max?((max-min)/max):0;
      const redDominance=r-Math.max(g,b);
      const bright=r/255;
      if(bright>0.62+sens*.18 && sat>0.48 && redDominance>75+sens*20){
        sx+=x;sy+=y;count++;
      }
    }
  }
  if(count<cfg.minArea)return null;
  // Rechazo de detecciones enormes: un ambiente rojo completo no es un punto láser.
  const maxReasonable=W*H*0.018;
  if(count>maxReasonable)return null;
  return {x:sx/count*(video.videoWidth/W),y:sy/count*(video.videoHeight/H),area:count};
}
function loop(){
  if(!active)return;
  frames++;fpsFrames++;
  const now=performance.now();
  if(now-fpsAt>1000){$("#fps").textContent=fpsFrames;fpsFrames=0;fpsAt=now}
  const point=detect();
  if(point){
    $("#laserBadge").textContent="● LÁSER DETECTADO";
    $("#laserBadge").classList.add("detected");
    drawOverlay(point);
    if(session)record(point);
  }else{
    $("#laserBadge").textContent="● LÁSER NO DETECTADO";
    $("#laserBadge").classList.remove("detected");
    drawOverlay();
  }
  raf=requestAnimationFrame(loop);
}
$("#cameraBtn").onclick=startCamera;
$("#calibrateBtn").onclick=calibrate;
$("#sessionBtn").onclick=startSession;
$("#stopBtn").onclick=stopSession;
$("#clearBtn").onclick=()=>{shots=[];render();drawOverlay()};
$("#sensitivity").oninput=e=>{cfg.sensitivity=+e.target.value;$("#thresholdText").textContent="Sensibilidad "+e.target.value+"%"};
$("#minArea").oninput=e=>cfg.minArea=+e.target.value;
$("#cooldown").oninput=e=>cfg.cooldown=+e.target.value;
video.addEventListener("loadedmetadata",resize);
window.addEventListener("resize",resize);
