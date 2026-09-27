const $=s=>document.querySelector(s);
const video=$('#video'),stage=$('#stage'),overlay=$('#overlay'),ctx=overlay.getContext('2d',{alpha:true}),work=$('#work'),wctx=work.getContext('2d',{willReadFrequently:true});
let stream=null,raf=0,running=false,paused=false,lastShot=0,armed=true,prevLaser=0,shotNo=0,total=0,hits=[],target=null,lastTargetScan=0,audio=new Audio('assets/disparo.wav');
const REF={w:1074,h:1432};
function show(id){['home','session','result'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id))}
function resize(){const r=stage.getBoundingClientRect();const d=Math.min(2,devicePixelRatio||1);overlay.width=Math.max(1,Math.round(r.width*d));overlay.height=Math.max(1,Math.round(r.height*d));ctx.setTransform(d,0,0,d,0,0)}
window.addEventListener('resize',resize);
function setStatus(t){$('#status').textContent=t}
function stopCamera(){if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}video.srcObject=null}
async function startCamera(){
 if(!navigator.mediaDevices?.getUserMedia)throw Error('getUserMedia');
 stopCamera();
 const tries=[{audio:false,video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080}}},{audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}},{audio:false,video:true}];
 let err;
 for(const c of tries){try{stream=await navigator.mediaDevices.getUserMedia(c);break}catch(e){err=e}}
 if(!stream)throw err||Error('camera');
 video.srcObject=stream;await new Promise((ok,bad)=>{let timer=setTimeout(()=>bad(Error('timeout')),7000);if(video.readyState>=1){clearTimeout(timer);ok()}else video.onloadedmetadata=()=>{clearTimeout(timer);ok()}});await video.play();resize();
}
function luminance(r,g,b){return .2126*r+.7152*g+.0722*b}
function detectLaser(){
 if(video.videoWidth<10)return null;
 const W=640,H=480;wctx.drawImage(video,0,0,W,H);const d=wctx.getImageData(0,0,W,H).data;
 let best=null,count=0,sx=0,sy=0,minx=W,miny=H,maxx=0,maxy=0;
 // Detect a compact, saturated red point. Ignore large red regions.
 for(let y=2;y<H-2;y+=2)for(let x=2;x<W-2;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2],dom=r-Math.max(g,b);if(r>125&&dom>48&&r>g*1.45&&r>b*1.35){count++;sx+=x;sy+=y;minx=Math.min(minx,x);miny=Math.min(miny,y);maxx=Math.max(maxx,x);maxy=Math.max(maxy,y);const score=dom+(r>190?35:0);if(!best||score>best.score)best={x,y,score,r,g,b}}}
 if(!best||count<1)return null;
 const area=(maxx-minx+1)*(maxy-miny+1);if(area>1800||count>500)return null;
 return {x:best.x/W,y:best.y/H,strength:best.score,area};
}
function findTarget(){
 // Find the largest bright rectangular sheet with dark content inside. This is deliberately conservative.
 const W=320,H=240;c2.width=W;c2.height=H;c2ctx.drawImage(video,0,0,W,H);const d=c2ctx.getImageData(0,0,W,H).data;
 // Estimate white paper bounds from rows/columns with high white occupancy.
 let xL=0,xR=W-1,yT=0,yB=H-1;
 const col=(x)=>{let n=0;for(let y=10;y<H-10;y+=4){const i=(y*W+x)*4;if(luminance(d[i],d[i+1],d[i+2])>180)n++}return n};
 const row=(y)=>{let n=0;for(let x=10;x<W-10;x+=4){const i=(y*W+x)*4;if(luminance(d[i],d[i+1],d[i+2])>180)n++}return n};
 for(let x=0;x<W;x+=2){if(col(x)>H*.45){xL=x;break}}for(let x=W-1;x>=0;x-=2){if(col(x)>H*.45){xR=x;break}}for(let y=0;y<H;y+=2){if(row(y)>W*.45){yT=y;break}}for(let y=H-1;y>=0;y-=2){if(row(y)>W*.45){yB=y;break}}
 if(xR-xL>W*.5&&yB-yT>H*.55)return{x0:xL/W,y0:yT/H,x1:xR/W,y1:yB/H,quality:1};
 return null;
}
const c2=document.createElement('canvas'),c2ctx=c2.getContext('2d',{willReadFrequently:true});
function scoreAt(u,v){
 if(!target)return null;let tx=(u-target.x0)/(target.x1-target.x0),ty=(v-target.y0)/(target.y1-target.y0);if(tx<0||tx>1||ty<0||ty>1)return 0;
 const x=tx*REF.w,y=ty*REF.h;
 if(((x-537)/118)**2+((y-115)/132)**2<1)return 5;
 if(((x-535)/198)**2+((y-905)/400)**2<1)return 5;
 if(x>=300&&x<=510&&y>=275&&y<=770)return 4;
 if(x>=580&&x<=805&&y>=275&&y<=795)return 4;
 if(x>=270&&x<=520&&y>=770&&y<=1425)return 4;
 if(x>=590&&x<=835&&y>=770&&y<=1425)return 4;
 if(x<335&&y>300&&y<1080)return 3;
 if(x>760&&y>300&&y<1280)return 2;
 return 0;
}
function drawTargetBox(){if(!target)return;const r=stage.getBoundingClientRect();ctx.save();ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=2;ctx.setLineDash([8,6]);ctx.strokeRect(target.x0*r.width,target.y0*r.height,(target.x1-target.x0)*r.width,(target.y1-target.y0)*r.height);ctx.restore()}
function drawHit(p,n,sc){const r=stage.getBoundingClientRect(),x=p.x*r.width,y=p.y*r.height;ctx.save();ctx.beginPath();ctx.arc(x,y,17,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#ff2933';ctx.stroke();ctx.fillStyle='#ff2933';ctx.font='900 14px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n,x,y);ctx.font='900 11px -apple-system';ctx.fillText(sc===null?'?':sc+' P',x,y+31);ctx.restore()}
function register(p){const now=performance.now();if(now-lastShot<700||!armed)return;const sc=scoreAt(p.x,p.y);shotNo++;if(sc!==null)total+=sc;hits.push({n:shotNo,x:p.x,y:p.y,score:sc});lastShot=now;armed=false;$('#shots').textContent=shotNo;$('#points').textContent=total;$('#last').textContent=sc===null?'?':sc;drawHit(p,shotNo,sc);audio.currentTime=0;audio.play().catch(()=>{});setStatus(`DISPARO ${shotNo} · ${sc===null?'FUERA':sc+' PUNTOS'}`);setTimeout(()=>armed=true,650)}
function loop(){if(!running)return;if(!paused){const p=detectLaser();const strength=p?p.strength:0;if(p&&strength>prevLaser+5)register(p);prevLaser=strength;if(!p)prevLaser=Math.max(0,prevLaser-8);if(performance.now()-lastTargetScan>500){target=findTarget();$('#targetStatus').textContent=target?'BLANCO DETECTADO':'BUSCANDO BLANCO';lastTargetScan=performance.now();ctx.clearRect(0,0,stage.clientWidth,stage.clientHeight);drawTargetBox();for(const h of hits)drawHit(h,h.n,h.score)}}raf=requestAnimationFrame(loop)}
$('#start').addEventListener('click',async()=>{try{show('session');setStatus('SOLICITANDO CÁMARA…');await startCamera();shotNo=0;total=0;hits=[];target=null;lastShot=0;armed=true;prevLaser=0;$('#shots').textContent='0';$('#points').textContent='0';$('#last').textContent='—';$('#targetStatus').textContent='BUSCANDO BLANCO';running=true;paused=false;$('#pause').textContent='PAUSAR';setStatus('CÁMARA ACTIVA · APUNTÁ AL BLANCO');resize();loop();audio.load()}catch(e){stopCamera();show('home');alert('No se pudo iniciar la cámara. Revisá el permiso de cámara de Safari para decaramarcosdaniel.github.io.')}});
$('#pause').addEventListener('click',()=>{paused=!paused;$('#pause').textContent=paused?'CONTINUAR':'PAUSAR';setStatus(paused?'PAUSADO':'CÁMARA ACTIVA · APUNTÁ AL BLANCO')});
$('#finish').addEventListener('click',()=>{running=false;cancelAnimationFrame(raf);stopCamera();$('#rShots').textContent=shotNo;$('#rPoints').textContent=total;$('#hits').innerHTML=hits.map(h=>`<div class="hitrow"><span>DISPARO ${h.n}</span><b>${h.score===null?'FUERA':h.score+' puntos'}</b></div>`).join('');show('result')});
$('#again').addEventListener('click',()=>show('home'));
