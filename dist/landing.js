(() => {
  const video=document.querySelector("#heroVideo");
  const endAction=document.querySelector("#videoEndAction");
  const replay=document.querySelector("[data-replay]");
  const nav=document.querySelector("#mainNav");
  const menu=document.querySelector("[data-menu]");
  if(video){
    video.muted=true;
    const start=video.play();
    if(start&&typeof start.catch==="function")start.catch(()=>{ replay.hidden=false; });
    video.addEventListener("ended",()=>{endAction.hidden=false;replay.hidden=false;});
    video.addEventListener("play",()=>{endAction.hidden=true;replay.hidden=true;});
    video.addEventListener("error",()=>{replay.hidden=false;});
    replay.addEventListener("click",()=>{video.currentTime=0;video.play().catch(()=>{});});
  }
  menu.addEventListener("click",()=>{
    const opened=nav.classList.toggle("open");
    menu.setAttribute("aria-expanded",String(opened));
    menu.setAttribute("aria-label",opened?"Fechar menu":"Abrir menu");
  });
  nav.addEventListener("click",e=>{if(e.target.closest("a")){nav.classList.remove("open");menu.setAttribute("aria-expanded","false");}});
})();
