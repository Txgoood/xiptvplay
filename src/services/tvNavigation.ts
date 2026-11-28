import {getInterfaceMode,detectInterfaceMode} from './interfaceMode';
const selector = 'summary,button:not(:disabled),a[href],input:not(:disabled):not([type=hidden]):not([type=file]),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';
export const isTvMode = () => getInterfaceMode()==='tv';
export function installTvNavigation() {
  document.documentElement.classList.toggle('xiptv-tv',isTvMode());
  document.documentElement.classList.toggle('xiptv-tv-reduced-motion',isTvMode()&&localStorage.getItem('xiptv_tv_reduced_motion')==='1');
  if (!isTvMode() && detectInterfaceMode()!=='tv') return;
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
  let remembered:{scope:string;id:string;index:number}|null=null;
  let pending:{grid:HTMLElement;index:number;attempts:number}|null=null;
  let lastRepeat=0;
  let suppressConfirmRelease=false;
  window.addEventListener('xiptv-long-confirm',()=>{suppressConfirmRelease=true;},true);
  window.addEventListener('keydown',e=>{if(suppressConfirmRelease&&(e.key==='Enter'||e.key===' ')){if(!e.repeat){suppressConfirmRelease=false;return;}e.preventDefault();e.stopImmediatePropagation();}},true);
  window.addEventListener('keyup',e=>{if(suppressConfirmRelease&&(e.key==='Enter'||e.key===' ')){suppressConfirmRelease=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  const gridScope=(grid:HTMLElement)=>grid.closest('[data-catalog-tab]')?.getAttribute('data-catalog-tab')||'';
  const findTile=(grid:HTMLElement,index:number)=>grid.querySelector<HTMLElement>('[data-grid-index="'+index+'"] [data-tv-poster]');
  const restoreTile=()=>{
    if(!isTvMode()||last||!remembered)return false;
    const grid=document.querySelector<HTMLElement>('[data-testid="catalog-grid"]');
    if(!grid||gridScope(grid)!==remembered.scope)return false;
    const tile=Array.from(grid.querySelectorAll<HTMLElement>('[data-media-id]')).find(x=>x.dataset.mediaId===remembered?.id)?.querySelector<HTMLElement>('[data-tv-poster]');
    if(tile){focus(tile);return true;}
    return false;
  };
  const requestTile=(grid:HTMLElement,index:number)=>{
    const tile=findTile(grid,index);
    if(tile){pending=null;focus(tile);return;}
    pending={grid,index,attempts:0};
    grid.dispatchEvent(new CustomEvent('xiptv-grid-jump',{detail:index}));
    const retry=()=>{
      if(!pending||pending.grid!==grid||pending.index!==index)return;
      if(!grid.isConnected||last){pending=null;return;}
      const target=findTile(grid,index);
      if(target){pending=null;focus(target);return;}
      if(++pending.attempts<20)requestAnimationFrame(retry);else pending=null;
    };
    requestAnimationFrame(retry);
  };
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
      for(const dialog of saved.keys())if(!dialog.isConnected)saved.delete(dialog);
      if(restore?.isConnected&&(!m||m.contains(restore))&&(!m||!m.contains(document.activeElement))) focus(restore);
      else if(!m && previous && !restore?.isConnected) { restoreTile(); }
      else if(m&&!m.contains(document.activeElement)) {
        const list=targets(m);focus(list.find(e=>e.matches('input:not([type=checkbox]):not([type=range])'))||list[0]);
      }
    }
  }
  let frame=0;
  const observer=new MutationObserver(()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;reconcile();});});
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('focusin',e=>{
    const m=modal();if(m&&e.target instanceof Node&&!m.contains(e.target)) {focus(targets(m)[0]);return;}
    if(!m&&e.target instanceof HTMLElement&&e.target.matches('[data-tv-poster]')){const grid=e.target.closest<HTMLElement>('[data-testid="catalog-grid"]'),card=e.target.closest<HTMLElement>('[data-media-id]'),cell=e.target.closest<HTMLElement>('[data-grid-index]');if(grid&&card&&cell)remembered={scope:gridScope(grid),id:card.dataset.mediaId||'',index:Number(cell.dataset.gridIndex)};}
  });
  let lastHorizontal = 0, lastDirection = '', lastChip: HTMLElement | undefined;
  window.addEventListener('keydown',e=>{
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
    reconcile();
    if(e.repeat){const now=performance.now();if(now-lastRepeat<75){e.preventDefault();e.stopImmediatePropagation();return;}lastRepeat=now;}
    if(!last&&isTvMode()){
      const active=document.activeElement as HTMLElement;
      const grid=active?.closest<HTMLElement>('[data-testid="catalog-grid"]');
      const cell=active?.closest<HTMLElement>('[data-grid-index]');
      if(grid&&cell&&active.matches('[data-tv-poster]')){
        const columns=Number(grid.dataset.tvColumns)||1,total=Number(grid.dataset.total)||0,index=pending?.grid===grid?pending.index:Number(cell.dataset.gridIndex);
        let next=index;
        if(e.key==='ArrowLeft'&&index%columns>0)next=index-1;
        if(e.key==='ArrowRight'&&index%columns<columns-1)next=index+1;
        if(e.key==='ArrowDown')next=Math.min(total-1,index+columns);
        if(e.key==='ArrowUp'&&index>=columns)next=index-columns;
        if(next!==index&&next>=0&&next<total){e.preventDefault();e.stopImmediatePropagation();requestTile(grid,next);return;}
        if(e.key!=='ArrowUp'||index>=columns){e.preventDefault();e.stopImmediatePropagation();return;}
      }
      if(!pending&&active===document.body&&restoreTile()){e.preventDefault();e.stopImmediatePropagation();return;}
    }
    const root=last||document;
    const active=document.activeElement as HTMLElement;
    const list=targets(root);
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
