const selector = 'button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]):not([type=file]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
export const isTvMode = () => /XIPTV-TV|Android TV|Google TV/i.test(navigator.userAgent);
export function installTvNavigation() {
  if (!isTvMode()) return;
  document.documentElement.classList.add('xiptv-tv');
  const visible = (e: HTMLElement) => {
    const r=e.getBoundingClientRect(), s=getComputedStyle(e);
    return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none' && !e.closest('[inert],[aria-hidden="true"]');
  };
  const modal = () => {
    const items=Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"],[class*="fixed"][class*="inset-0"]')).filter(e=>visible(e)&&e.querySelector(selector));
    return items.sort((a,b)=>(Number(getComputedStyle(a).zIndex)||0)-(Number(getComputedStyle(b).zIndex)||0)).pop() || null;
  };
  const targets=(root: ParentNode)=>Array.from(root.querySelectorAll<HTMLElement>(selector)).filter(e=>visible(e)&&e.tabIndex>=0);
  const focus=(e?:HTMLElement)=>{ if(e){ e.focus({preventScroll:true}); e.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}); }};
  let last:HTMLElement|null=null;
  const saved=new Map<HTMLElement,HTMLElement>();
  function reconcile(){
    const m=modal();
    if(m!==last){
      if(m&&last?.contains(m)===false || m&&!last) {
        const active=document.activeElement;
        if(active instanceof HTMLElement&&!m.contains(active)) saved.set(m,active);
      }
      const previous=last;last=m;
      const restore=previous?saved.get(previous):undefined;
      if(previous&&!previous.isConnected) saved.delete(previous);
      if(restore?.isConnected&&(!m||m.contains(restore))&&(!m||!m.contains(document.activeElement))) focus(restore);
      else if(m&&!m.contains(document.activeElement)) {
        const list=targets(m);focus(list.find(e=>e.matches('input:not([type=checkbox]):not([type=range])'))||list[0]);
      }
    }
  }
  let frame=0;
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;reconcile();});});
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('focusin',e=>{
    const m=modal();if(m&&e.target instanceof Node&&!m.contains(e.target)) focus(targets(m)[0]);
  });
  let lastHorizontal = 0, lastDirection = '', lastChip: HTMLElement | undefined;
  window.addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    reconcile();
    const root=last||document;
    const list=targets(root), active=document.activeElement as HTMLElement;
    const row=active?.closest('[data-tv-category-row]');
    const tool=active?.closest('[data-tv-category-tool]');
    if(!last && (row||tool) && ['ArrowLeft','ArrowRight'].includes(e.key)){
      const now=performance.now(), double=!e.repeat&&lastDirection===e.key&&now-lastHorizontal<280;
      lastHorizontal=now;lastDirection=e.key;
      const chips=Array.from(document.querySelectorAll<HTMLElement>('[data-tv-category-row] button'));
      const tools=Array.from(document.querySelectorAll<HTMLElement>('[data-tv-category-tool]'));
      let next:HTMLElement|undefined;
      if(row){lastChip=active; const i=chips.indexOf(active);
        next=double&&e.key==='ArrowRight'?tools[0]:chips[i+(e.key==='ArrowRight'?1:-1)]||(e.key==='ArrowRight'?tools[0]:undefined);
      }else{const i=tools.indexOf(active);next=double&&e.key==='ArrowLeft'?(lastChip?.isConnected?lastChip:chips[0]):tools[i+(e.key==='ArrowRight'?1:-1)]||(e.key==='ArrowLeft'?(lastChip?.isConnected?lastChip:chips[chips.length-1]):undefined);}
      e.preventDefault();e.stopImmediatePropagation();focus(next);return;
    }
    if(active instanceof HTMLSelectElement && (e.key==='ArrowLeft'||e.key==='ArrowRight'))return;
    if(active instanceof HTMLInputElement && active.type==='range' && (e.key==='ArrowLeft'||e.key==='ArrowRight'))return;
    if(active instanceof HTMLInputElement && !['range','checkbox','radio','button'].includes(active.type) && (e.key==='ArrowLeft'||e.key==='ArrowRight'))return;
    e.preventDefault();e.stopImmediatePropagation();
    if(!list.includes(active)){focus(list[0]);return;}
    const a=active.getBoundingClientRect(), x=a.left+a.width/2,y=a.top+a.height/2;
    const horizontal=e.key==='ArrowLeft'||e.key==='ArrowRight', sign=e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1;
    let best:HTMLElement|undefined, score=Infinity;
    for(const candidate of list){
      if(candidate===active)continue;
      const b=candidate.getBoundingClientRect(), dx=b.left+b.width/2-x,dy=b.top+b.height/2-y;
      const primary=(horizontal?dx:dy)*sign, cross=Math.abs(horizontal?dy:dx);
      if(primary<2)continue;
      const value=primary+cross*3;
      if(value<score){score=value;best=candidate;}
    }
    focus(best);
  },true);
}
