const $=s=>document.querySelector(s);
const v=$("#video"),ov=$("#overlay"),oc=ov.getContext("2d"),work=$("#work"),wc=work.getContext("2d",{willReadFrequently:true});
const target=$("#target"),marks=$("#marks"),mc=marks.getContext("2d");
let stream=null,active=false,running=false,calibrating=false,calPts=[],H=null,prev=null,last=0,shots=[];
let cfg={s:72,a:4,m:180,c:450};

function state(t,c){$("#state").textContent=t;$("#state").className=c}
function resize(){
 if(!v.videoWidth)return;
 ov.width=v.videoWidth;ov.height=v.videoHeight;
 work.width=480;work.height=Math.round(480*v.videoHeight/v.videoWidth);
 resizeMarks();draw();
}
function resizeMarks(){const r=target.getBoundingClientRect();marks.width=Math.round(r.width*2);marks.height=Math.round(r.height*2);drawMarks()}
function draw(p){
 oc.clearRect(0,0,ov.width,ov.height);
 if(calPts.length){
  oc.strokeStyle="#f59e0b";oc.lineWidth=4;oc.beginPath();
  calPts.forEach((q,i)=>i?oc.lineTo(q.x,q.y):oc.moveTo(q.x,q.y));
  oc.stroke();
  calPts.forEach((q,i)=>{oc.beginPath();oc.arc(q.x,q.y,12,0,Math.PI*2);oc.fillStyle="#f59e0b";oc.fill();oc.fillStyle="#111";oc.font="bold 12px sans-serif";oc.textAlign="center";oc.textBaseline="middle";oc.fillText(String(i+1),q.x,q.y)});
 }
 if(p){const r=Math.max(12,ov.width/70);oc.beginPath();oc.arc(p.x,p.y,r,0,Math.PI*2);oc.strokeStyle="#fff";oc.lineWidth=3;oc.stroke();oc.beginPath();oc.arc(p.x,p.y,r*.65,0,Math.PI*2);oc.fillStyle="#ef4444";oc.fill()}
}
async function start(){
 try{
  if(!navigator.mediaDevices?.getUserMedia)throw Error("La cámara requiere HTTPS.");
  stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:1920}}});
  v.srcObject=stream;await new Promise(r=>v.onloadedmetadata=r);await v.play();active=true;resize();state("CÁMARA ON","on");$("#startBox").style.display="none";$("#calibrate").disabled=false;$("#info").textContent="Cámara activa. Iniciá la calibración.";requestAnimationFrame(loop);
 }catch(e){state("ERROR CÁMARA","err");$("#startBox").querySelector("h2").textContent="No se pudo abrir la cámara";$("#startBox").querySelector("p").textContent=e.message}
}
function beginCalibration(){
 if(!active)return;calibrating=true;calPts=[];H=null;$("#calState").textContent="0 / 4";$("#calibrate").textContent="TOCÁ LAS 4 ESQUINAS";$("#info").textContent="Tocá las esquinas del blanco en orden: ↖ → ↗ → ↘ → ↙.";draw()
}
ov.addEventListener("pointerup",e=>{
 if(!calibrating)return;
 const r=ov.getBoundingClientRect(),x=(e.clientX-r.left)*ov.width/r.width,y=(e.clientY-r.top)*ov.height/r.height;
 calPts.push({x,y});$("#calState").textContent=calPts.length+" / 4";draw();
 if(calPts.length===4){
  H=homography(calPts,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
  calibrating=false;$("#calibrate").textContent="✓ BLANCO CALIBRADO";$("#go").disabled=false;$("#info").textContent="Perspectiva calibrada. Iniciá la sesión.";draw()
 }
});
function resetCal(){calPts=[];H=null;calibrating=false;$("#calState").textContent="0 / 4";$("#calibrate").textContent="🎯 INICIAR CALIBRACIÓN";$("#go").disabled=true;draw()}
function homography(src,dst){
 // 8x8 Gaussian elimination for projective transform.
 const A=[],b=[];
 for(let i=0;i<4;i++){const x=src[i].x,y=src[i].y,u=dst[i].x,v=dst[i].y;
  A.push([x,y,1,0,0,0,-u*x,-u*y]);b.push(u);
  A.push([0,0,0,x,y,1,-v*x,-v*y]);b.push(v);
 }
 for(let i=0;i<8;i++){let p=i;for(let j=i+1;j<8;j++)if(Math.abs(A[j][i])>Math.abs(A[p][i]))p=j;[A[i],A[p]]=[A[p],A[i]];[b[i],b[p]]=[b[p],b[i]];let z=A[i][i];if(Math.abs(z)<1e-10)return null;for(let k=i;k<8;k++)A[i][k]/=z;b[i]/=z;for(let j=0;j<8;j++)if(j!==i){z=A[j][i];for(let k=i;k<8;k++)A[j][k]-=z*A[i][k];b[j]-=z*b[i]}}
 return [b[0],b[1],b[2],b[3],b[4],b[5],b[6],b[7],1]
}
function mapPoint(p){
 if(!H)return null;const d=H[6]*p.x+H[7]*p.y+1;
 return{x:(H[0]*p.x+H[1]*p.y+H[2])/d,y:(H[3]*p.x+H[4]*p.y+H[5])/d}
}
function scoreAt(u,v){
 // Normalized map of the supplied target. Central white scoring zones and
 // exterior silhouette are approximated; the perspective itself is exact.
 const x=u*1074,y=v*1432;
 const head=((x-548)/110)**2+((y-190)/150)**2;if(head<1)return 5;
 const center=((x-570)/175)**2+((y-895)/390)**2;if(center<1)return 5;
 if(x>=355&&x<=510&&y>=300&&y<=760)return 4;
 if(x>=590&&x<=770&&y>=300&&y<=790)return 4;
 if(x>=285&&x<=520&&y>=780&&y<=1410)return 4;
 if(x>=610&&x<=840&&y>=780&&y<=1410)return 4;
 if(x<360&&y>360&&y<1050)return 3;
 if(x>760&&y>350&&y<1260)return 2;
 return 0
}
function drawMarks(){
 mc.clearRect(0,0,marks.width,marks.height);
 const sx=marks.width/1074,sy=marks.height/1432;
 shots.forEach(s=>{const x=s.u*1074*sx,y=s.v*1432*sy,r=Math.max(9,marks.width/60);
  mc.beginPath();mc.arc(x,y,r,0,Math.PI*2);mc.fillStyle="#e11d48";mc.fill();mc.strokeStyle="#fff";mc.lineWidth=3;mc.stroke();
  mc.fillStyle="#fff";mc.font=`bold ${Math.max(13,marks.width/42)}px sans-serif`;mc.textAlign="center";mc.textBaseline="middle";mc.fillText(String(s.n),x,y)
 })
}
function startSession(){if(!H)return;running=true;shots=[];prev=null;last=0;render();$("#go").disabled=true;$("#stop").disabled=false;$("#info").textContent="SESIÓN ACTIVA — dispará al blanco."}
function stopSession(){running=false;$("#go").disabled=false;$("#stop").disabled=true;$("#info").textContent="Sesión detenida."}
function detect(){
 wc.drawImage(v,0,0,work.width,work.height);const d=wc.getImageData(0,0,work.width,work.height).data;let sx=0,sy=0,n=0,s=cfg.s/100;
 for(let y=0;y<work.height;y+=2)for(let x=0;x<work.width;x+=2){const i=(y*work.width+x)*4,r=d[i],g=d[i+1],b=d[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b),sat=mx?((mx-mn)/mx):0;if(r>160+s*30&&sat>.52&&r-Math.max(g,b)>82+s*18){sx+=x;sy+=y;n++}}
 if(n<cfg.a||n>cfg.m)return null;return{x:sx/n*(v.videoWidth/work.width),y:sy/n*(v.videoHeight/work.height)}
}
function add(p){
 const now=performance.now();if(now-last<cfg.c)return;last=now;
 const q=mapPoint({x:p.x/v.videoWidth,y:p.y/v.videoHeight});if(!q)return;
 const score=scoreAt(q.x,q.y),inter=shots.length?(now-shots.at(-1).ts)/1000:null;
 shots.push({n:shots.length+1,ts:now,time:new Date().toLocaleTimeString(),u:q.x,v:q.y,score,inter});
 render();drawMarks()
}
function render(){
 const total=shots.reduce((a,s)=>a+s.score,0),avg=shots.length?total/shots.length:0;
 $("#shots").textContent=shots.length;$("#score").textContent=total;$("#avg").textContent=avg.toFixed(1);$("#last").textContent=shots.length?shots.at(-1).score:"—";
 $("#targetStatus").textContent=shots.length?`${shots.length} impactos · ${total} puntos`:"Calibración requerida";
 $("#list").innerHTML=shots.length?shots.slice().reverse().map(s=>`<div class="item"><div class="badge">${s.score}</div><div><b>Disparo #${s.n} — zona ${s.score}</b><br><small>${s.time} · ${Math.round(s.u*100)}% × ${Math.round(s.v*100)}%${s.inter?` · Δ ${s.inter.toFixed(2)} s`:''}</small></div><span class="score">${s.score} pts</span></div>`).join(""):'<p class="muted">Todavía no hay disparos.</p>'
}
function loop(){
 if(!active)return;
 const p=detect();
 if(p&&running){const now=performance.now();if(!prev||Math.hypot(p.x-prev.x,p.y-prev.y)<Math.max(80,v.videoWidth*.08)){if(now-last>=cfg.c){add(p);draw(p)}}prev=p;$("#laser").textContent="● IMPACTO DETECTADO";$("#laser").classList.add("hit")}
 else{$("#laser").textContent="● ESPERANDO LÁSER";$("#laser").classList.remove("hit");draw()}
 requestAnimationFrame(loop)
}
$("#start").onclick=start;$("#calibrate").onclick=beginCalibration;$("#resetCal").onclick=resetCal;$("#go").onclick=startSession;$("#stop").onclick=stopSession;$("#reload").onclick=()=>location.reload();$("#clear").onclick=()=>{shots=[];prev=null;render();drawMarks()};
$("#sens").oninput=e=>{cfg.s=+e.target.value;$("#sv").textContent=cfg.s+"%"};$("#area").oninput=e=>{cfg.a=+e.target.value;$("#av").textContent=cfg.a};$("#maxarea").oninput=e=>{cfg.m=+e.target.value;$("#xv").textContent=cfg.m};$("#cool").oninput=e=>{cfg.c=+e.target.value;$("#cv").textContent=cfg.c+" ms"};
v.addEventListener("loadedmetadata",resize);target.addEventListener("load",resizeMarks);window.addEventListener("resize",resize)
