const $=s=>document.querySelector(s);const video=$('#video'),overlay=$('#overlay'),ctx=overlay.getContext('2d'),work=$('#work'),wctx=work.getContext('2d');let stream=null,running=false,paused=false,lastPulse=0,quiet=0,prev=0,shotNo=0,total=0,hits=[],raf=0,audio=new Audio('assets/disparo.wav');
const REF={w:1060,h:1484};
function show(id){['home','session','result'].forEach(x=>$('#'+x).classList.toggle('hidden',x!==id))}
function resize(){const r=$('#stage').getBoundingClientRect();overlay.width=Math.max(1,Math.floor(r.width*devicePixelRatio));overlay.height=Math.max(1,Math.floor(r.height*devicePixelRatio));ctx.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}
window.addEventListener('resize',resize);
function status(t){$('#status').textContent=t}
async function camera(){
 if(!navigator.mediaDevices?.getUserMedia) throw new Error('getUserMedia no disponible');
 if(stream) stream.getTracks().forEach(t=>t.stop());
 const base={audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}};
 try{stream=await navigator.mediaDevices.getUserMedia({...base,video:{...base.video,facingMode:{exact:'environment'}}})}catch(e){stream=await navigator.mediaDevices.getUserMedia(base)}
 video.srcObject=stream;await new Promise(res=>video.readyState>=1?res():video.addEventListener('loadedmetadata',res,{once:true}));await video.play();resize();
}
function sample(){
 if(video.videoWidth<10)return null;
 const W=480,H=360;work.width=W;work.height=H;wctx.drawImage(video,0,0,W,H);const d=wctx.getImageData(0,0,W,H).data;let sx=0,sy=0,n=0,best=0,bx=0,by=0;
 // Find compact, saturated red. Reject broad reddish areas by requiring local dominance.
 for(let y=3;y<H-3;y+=2)for(let x=3;x<W-3;x+=2){const i=(y*W+x)*4,r=d[i],g=d[i+1],b=d[i+2];const score=r-Math.max(g,b);if(r>145&&score>80&&r>g*1.65&&r>b*1.55){let around=0,c=0;for(let yy=-2;yy<=2;yy++)for(let xx=-2;xx<=2;xx++){const j=((y+yy)*W+x+xx)*4;around+=d[j]-Math.max(d[j+1],d[j+2]);c++}const q=around/c;if(q>65){n++;sx+=x;sy+=y;if(q>best){best=q;bx=x;by=y}}}}
 if(n===0)return null;return {x:bx/W,y:by/H,strength:Math.min(255,best),mass:n};
}
// Automatic target approximation: the known target has a large dark figure. We estimate its center and use a stable target box.
// This requires no corner tapping. The score zones are mapped from the supplied target artwork.
function targetEstimate(){
 // Camera-space target defaults to the central 72% width x 88% height. It is refined from dark-pixel bounding box.
 const W=240,H=180;const tmp=document.createElement('canvas');tmp.width=W;tmp.height=H;const c=tmp.getContext('2d');c.drawImage(video,0,0,W,H);const d=c.getImageData(0,0,W,H).data;
 let minx=W,maxx=0,miny=H,maxy=0,count=0;
 for(let y=Math.floor(H*.12);y<H*.96;y+=2)for(let x=Math.floor(W*.05);x<W*.95;x+=2){const i=(y*W+x)*4,v=(d[i]+d[i+1]+d[i+2])/3;if(v<62){minx=Math.min(minx,x);maxx=Math.max(maxx,x);miny=Math.min(miny,y);maxy=Math.max(maxy,y);count++}}
 if(count>500 && maxx-minx>W*.45 && maxy-miny>H*.45){const x0=Math.max(0,(minx/W)-.035),x1=Math.min(1,(maxx/W)+.055),y0=Math.max(0,(miny/H)-.17),y1=Math.min(1,(maxy/H)+.045);return {x0,y0,x1,y1,quality:1}}
 return {x0:.04,y0:.03,x1:.96,y1:.97,quality:0};
}
let target=targetEstimate();let targetTick=0;
function score(u,v){let tx=(u-target.x0)/(target.x1-target.x0),ty=(v-target.y0)/(target.y1-target.y0);if(tx<0||tx>1||ty<0||ty>1)return 0;const x=tx*REF.w,y=ty*REF.h;
 // Reference target scoring zones based on supplied artwork.
 if(((x-530)/115)**2+((y-105)/125)**2<1)return 5;
 if(((x-535)/190)**2+((y-910)/390)**2<1)return 5;
 if(x>=300&&x<=500&&y>=270&&y<=770)return 4;
 if(x>=580&&x<=800&&y>=270&&y<=790)return 4;
 if(x>=270&&x<=520&&y>=770&&y<=1420)return 4;
 if(x>=590&&x<=830&&y>=770&&y<=1420)return 4;
 if(x<330&&y>300&&y<1080)return 3;
 if(x>760&&y>300&&y<1280)return 2;
 return 0;
}
function drawHit(u,v,n,sc){const r=$('#stage').getBoundingClientRect();const x=u*r.width,y=v*r.height;ctx.save();ctx.beginPath();ctx.arc(x,y,13,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#ff3038';ctx.stroke();ctx.fillStyle='#ff3038';ctx.font='900 13px -apple-system';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(n,x,y);ctx.restore()}
function register(p){const now=performance.now();if(now-lastPulse<650)return;lastPulse=now;shotNo++;const sc=score(p.x,p.y);total+=sc;hits.push({n:shotNo,x:p.x,y:p.y,score:sc});$('#shots').textContent=shotNo;$('#points').textContent=total;$('#last').textContent=sc;drawHit(p.x,p.y,shotNo,sc);audio.currentTime=0;audio.play().catch(()=>{});status(`DISPARO ${shotNo} · ${sc} PUNTOS`);}
function loop(){if(!running)return;if(!paused){const p=sample();if(p){if(p.strength>92&&p.strength-prev>8){quiet=0;register(p)}else quiet++;prev=p.strength}else{quiet++;prev=0}if(performance.now()-targetTick>900){target=targetEstimate();targetTick=performance.now()}}raf=requestAnimationFrame(loop)}
$('#start').addEventListener('click',async()=>{try{audio.load();await audio.play().catch(()=>{});show('session');status('SOLICITANDO CÁMARA…');await camera();running=true;paused=false;shotNo=0;total=0;hits=[];ctx.clearRect(0,0,overlay.width,overlay.height);$('#shots').textContent='0';$('#points').textContent='0';$('#last').textContent='—';$('#detectState').textContent='CÁMARA ACTIVA · BUSCANDO LÁSER';status('CÁMARA ACTIVA · APUNTÁ AL BLANCO');loop()}catch(e){show('home');alert('No se pudo iniciar la cámara. En Safari debe estar permitido el acceso a cámara para este sitio.')}});
$('#pause').addEventListener('click',()=>{paused=!paused;$('#pause').textContent=paused?'CONTINUAR':'PAUSAR';$('#stage').classList.toggle('paused',paused);if(!paused)status('CÁMARA ACTIVA · BUSCANDO LÁSER')});
$('#finish').addEventListener('click',()=>{running=false;if(stream)stream.getTracks().forEach(t=>t.stop());cancelAnimationFrame(raf);$('#rShots').textContent=shotNo;$('#rPoints').textContent=total;$('#hits').innerHTML=hits.map(h=>`<div class="hitrow"><span>DISPARO ${h.n}</span><b>${h.score} puntos</b></div>`).join('');show('result')});
$('#again').addEventListener('click',()=>show('home'));
