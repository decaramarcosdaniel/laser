const $=s=>document.querySelector(s);
const video=$("#video"),overlay=$("#overlay"),oc=overlay.getContext("2d"),work=$("#work"),wc=work.getContext("2d",{willReadFrequently:true});
const target=$("#target"),marks=$("#marks"),mc=marks.getContext("2d");
let stream=null,active=false,running=false,paused=false,raf=0,prev=null,lastShot=0,shots=[];
let cfg={sens:72,cool:450}, targetW=1074,targetH=1432;

function resize(){if(!video.videoWidth)return;overlay.width=video.videoWidth;overlay.height=video.videoHeight;work.width=480;work.height=Math.round(480*video.videoHeight/video.videoWidth);resizeMarks()}
function resizeMarks(){const r=target.getBoundingClientRect();marks.width=Math.round(r.width*2);marks.height=Math.round(r.height*2);drawMarks()}
function drawPoint(p){oc.clearRect(0,0,overlay.width,overlay.height);if(!p)return;const r=Math.max(12,overlay.width/70);oc.beginPath();oc.arc(p.x,p.y,r,0,Math.PI*2);oc.strokeStyle="#fff";oc.lineWidth=3;oc.stroke();oc.beginPath();oc.arc(p.x,p.y,r*.65,0,Math.PI*2);oc.fillStyle="#ef4444";oc.fill()}
async function start(){
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error("La cámara requiere HTTPS.");
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}}});
  video.srcObject=stream;await new Promise(r=>video.onloadedmetadata=r);await video.play();active=true;resize();
  $("#startScreen").style.display="none";$("#detectStatus").textContent="BUSCANDO BLANCO…";$("#sessionState").textContent="Buscando blanco";$("#pause").disabled=false;$("#finish").disabled=false;
  requestAnimationFrame(loop);
 }catch(e){$("#startScreen h2").textContent="No se pudo abrir la cámara";$("#startScreen p").textContent=e.message}
}

/* Reconocimiento automático simplificado del blanco.
   Usa la silueta/zonas oscuras de la plantilla y busca una región vertical
   con suficiente contraste. */
function detectTarget(){
 const W=work.width,H=work.height;
 wc.drawImage(video,0,0,W,H);const d=wc.getImageData(0,0,W,H).data;
 let minX=W,maxX=0,minY=H,maxY=0,dark=0;
 for(let y=Math.floor(H*.04);y<H*.96;y+=4)for(let x=Math.floor(W*.05);x<W*.95;x+=4){
  const i=(y*W+x)*4, lum=.299*d[i]+.587*d[i+1]+.114*d[i+2];
  if(lum<70){dark++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}
 }
 const area=(maxX-minX)*(maxY-minY);
 if(dark<100||area<W*H*.12)return null;
 return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};
}
function detectLaser(){
 const W=work.width,H=work.height;wc.drawImage(video,0,0,W,H);const d=wc.getImageData(0,0,W,H).data;
 let sx=0,sy=0,n=0,s=cfg.sens/100;
 for(let y=0;y<H;y+=2)for(let x=0;x<W;x+=2){
  const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx?((mx-mn)/mx):0;
  if(r>160+s*30&&sat>.52&&r-Math.max(g,b)>82+s*18){sx+=x;sy+=y;n++}
 }
 if(n<4||n>180)return null;
 return{x:sx/n*(video.videoWidth/W),y:sy/n*(video.videoHeight/H)}
}
function scoreAt(u,v){
 const x=u*targetW,y=v*targetH;
 const head=((x-548)/110)**2+((y-190)/150)**2;if(head<1)return 5;
 const center=((x-570)/175)**2+((y-895)/390)**2;if(center<1)return 5;
 if(x>=355&&x<=510&&y>=300&&y<=760)return 4;
 if(x>=590&&x<=770&&y>=300&&y<=790)return 4;
 if(x>=285&&x<=520&&y>=780&&y<=1410)return 4;
 if(x>=610&&x<=840&&y>=780&&y<=1410)return 4;
 if(x<360&&y>360&&y<1050)return 3;
 if(x>760&&y>350&&y<1260)return 2;
 return 0;
}
/* La posición del impacto se normaliza usando el área detectada del blanco.
   No pide tocar esquinas: se ajusta automáticamente al contorno encontrado. */
function mapImpact(p,t){
 const u=(p.x/video.videoWidth-t.x/work.width)/(t.w/work.width);
 const v=(p.y/video.videoHeight-t.y/work.height)/(t.h/work.height);
 return {u:Math.max(0,Math.min(1,u)),v:Math.max(0,Math.min(1,v))};
}
function addShot(p,t){
 const now=performance.now();if(now-lastShot<cfg.cool)return;lastShot=now;
 const q=mapImpact(p,t),score=scoreAt(q.u,q.v);
 shots.push({n:shots.length+1,ts:now,t:new Date().toLocaleTimeString(),u:q.u,v:q.v,score});
 render();drawMarks();
}
function drawMarks(){
 mc.clearRect(0,0,marks.width,marks.height);
 const sx=marks.width/targetW,sy=marks.height/targetH;
 shots.forEach(s=>{const x=s.u*targetW*sx,y=s.v*targetH*sy,r=Math.max(9,marks.width/60);
  mc.beginPath();mc.arc(x,y,r,0,Math.PI*2);mc.fillStyle="#e11d48";mc.fill();mc.strokeStyle="#fff";mc.lineWidth=3;mc.stroke();
  mc.fillStyle="#fff";mc.font=`bold ${Math.max(13,marks.width/42)}px sans-serif`;mc.textAlign="center";mc.textBaseline="middle";mc.fillText(String(s.n),x,y)
 });
}
function render(){
 const total=shots.reduce((a,s)=>a+s.score,0),avg=shots.length?total/shots.length:0,best=shots.length?Math.max(...shots.map(s=>s.score)):0;
 $("#shots").textContent=shots.length;$("#score").textContent=total;$("#avg").textContent=avg.toFixed(1).replace(".",",");$("#last").textContent=shots.length?shots.at(-1).score:"—";
}
function finish(){
 running=false;paused=false;$("#pause").disabled=true;$("#finish").disabled=true;$("#newSession").disabled=false;
 $("#rShots").textContent=shots.length;$("#rScore").textContent=shots.reduce((a,s)=>a+s.score,0);$("#rAvg").textContent=(shots.length?shots.reduce((a,s)=>a+s.score,0)/shots.length:0).toFixed(1).replace(".",",");$("#rBest").textContent=shots.length?Math.max(...shots.map(s=>s.score)):0;$("#results").classList.remove("hidden");$("#sessionState").textContent="Sesión finalizada";
}
function loop(){
 if(!active)return;
 const t=detectTarget();
 if(t){$("#detectStatus").textContent="✓ BLANCO DETECTADO";$("#detectStatus").classList.add("ok");if(running&&!paused){const p=detectLaser();if(p){$("#detectStatus").textContent="🔴 IMPACTO DETECTADO";$("#detectStatus").classList.add("laser");if(!prev||Math.hypot(p.x-prev.x,p.y-prev.y)<Math.max(80,video.videoWidth*.08)){addShot(p,t)}prev=p;drawPoint(p)}}}
 else{$("#detectStatus").textContent="BUSCANDO BLANCO…";$("#detectStatus").classList.remove("ok","laser")}
 raf=requestAnimationFrame(loop);
}
$("#start").onclick=()=>{shots=[];render();start().then(()=>{running=true;$("#sessionState").textContent="Sesión activa"})};
$("#pause").onclick=()=>{paused=!paused;$("#pause").textContent=paused?"▶ CONTINUAR":"⏸ PAUSAR";$("#sessionState").textContent=paused?"Sesión pausada":"Sesión activa"};
$("#finish").onclick=finish;$("#newSession").onclick=()=>{shots=[];render();$("#results").classList.add("hidden");running=true;paused=false;$("#pause").textContent="⏸ PAUSAR";$("#pause").disabled=false;$("#finish").disabled=false;$("#sessionState").textContent="Sesión activa"};
$("#settings").onclick=()=>$("#settingsPanel").classList.remove("hidden");$("#closeSettings").onclick=()=>$("#settingsPanel").classList.add("hidden");
$("#sens").oninput=e=>{cfg.sens=+e.target.value;$("#sensText").textContent=cfg.sens+"%"};$("#cool").oninput=e=>{cfg.cool=+e.target.value;$("#coolText").textContent=cfg.cool+" ms"};
video.addEventListener("loadedmetadata",resize);target.addEventListener("load",resizeMarks);window.addEventListener("resize",resizeMarks);
