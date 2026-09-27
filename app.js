const $=s=>document.querySelector(s);
const video=$("#video"), target=$("#target");
let stream=null;

function showState(text, ok=true){
  $("#state").textContent=text;
  $(".dot").style.background=ok?"#2ee66b":"#ffb020";
}

async function openCamera(){
  if(!window.isSecureContext){
    showState("ABRÍ ESTA PÁGINA CON HTTPS",false);
    alert("La cámara necesita HTTPS. En GitHub Pages debería aparecer como https://...");
    return false;
  }
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    showState("ESTE NAVEGADOR NO EXPONE LA CÁMARA",false);
    alert("Safari no está ofreciendo acceso a la cámara en esta página.");
    return false;
  }
  try{
    if(stream) stream.getTracks().forEach(t=>t.stop());

    const constraints={
      audio:false,
      video:{
        facingMode:{ideal:"environment"},
        width:{ideal:1280},
        height:{ideal:1920}
      }
    };

    stream=await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject=stream;
    video.muted=true;
    video.setAttribute("autoplay","");
    video.setAttribute("playsinline","");
    video.setAttribute("webkit-playsinline","");

    await new Promise(resolve=>{
      if(video.readyState>=2) return resolve();
      const done=()=>{video.removeEventListener("loadeddata",done);video.removeEventListener("canplay",done);resolve()};
      video.addEventListener("loadeddata",done,{once:true});
      video.addEventListener("canplay",done,{once:true});
      setTimeout(resolve,2500);
    });

    await video.play();

    const track=stream.getVideoTracks()[0];
    const settings=track ? track.getSettings() : {};
    showState("CÁMARA ACTIVA",true);
    console.log("CAMERA",{readyState:video.readyState,videoWidth:video.videoWidth,videoHeight:video.videoHeight,settings});
    return true;
  }catch(e){
    console.error(e);
    showState("NO SE PUDO MOSTRAR LA CÁMARA",false);
    alert("La cámara fue autorizada, pero Safari no pudo iniciar el video. Cerrá esta pestaña, volvé a abrirla y tocá INICIAR nuevamente.");
    return false;
  }
}

async function start(){
  $("#home").classList.add("hidden");
  $("#session").classList.remove("hidden");
  showState("ABRIENDO CÁMARA…",false);
  const ok=await openCamera();
  if(!ok){
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    $("#session").classList.add("hidden");
    $("#home").classList.remove("hidden");
  }
}

function finish(){
  if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
  video.srcObject=null;
  $("#session").classList.add("hidden");
  $("#home").classList.remove("hidden");
}

target.addEventListener("error",()=>$("#loadError").classList.remove("hidden"));
$("#start").addEventListener("click",start);
$("#finish").addEventListener("click",finish);
