import React,{useLayoutEffect,useRef,useState} from 'react';
import type {CatalogView} from '../services/catalogDiscovery';
interface Props<T>{items:T[];view:CatalogView;render:(item:T)=>React.ReactNode;getKey:(item:T)=>string}
// Kaydırma konumu korunurken DOM sayısı katalog uzunluğundan bağımsız kalır.
export function VirtualCatalogGrid<T>({items,view,render,getKey}:Props<T>) {
 const container=useRef<HTMLDivElement>(null),probe=useRef<HTMLDivElement>(null);
 const [layout,setLayout]=useState({columns:1,rowHeight:420,gap:14,start:0,end:12});
 useLayoutEffect(()=>{
  let frame=0;
  const measure=()=>{
   frame=0;const root=container.current;if(!root)return;
   const style=getComputedStyle(root),columns=style.gridTemplateColumns.split(' ').length,gap=parseFloat(style.rowGap)||14;
   const height=probe.current?.getBoundingClientRect().height||420,rowHeight=height+gap;
   const relative=-root.getBoundingClientRect().top;
   const count=Math.ceil(items.length/columns);
   const start=Math.max(0,Math.min(Math.max(0,count-1),Math.floor(relative/rowHeight)-3));
   const end=Math.min(count,Math.max(start+1,Math.ceil((relative+window.innerHeight)/rowHeight)+3));
   setLayout(old=>old.columns===columns&&Math.abs(old.rowHeight-rowHeight)<1&&old.start===start&&old.end===end?old:{columns,rowHeight,gap,start,end});
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
  const observer=new ResizeObserver(schedule);if(container.current)observer.observe(container.current);if(probe.current)observer.observe(probe.current);
  // Recommandation rafı veya üst başlık boyutu değişirse başlangıç konumu da ölçülür.
  if(container.current?.parentElement)observer.observe(container.current.parentElement);
  window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);measure();
  return()=>{observer.disconnect();window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);cancelAnimationFrame(frame);};
 },[items,view]);
 useLayoutEffect(()=>{
  const root=container.current;if(!root)return;
  const jump=(event:Event)=>{
   const index=(event as CustomEvent<number>).detail;
   if(!Number.isInteger(index)||index<0||index>=items.length)return;
   const row=Math.floor(index/layout.columns);
   const top=window.scrollY+root.getBoundingClientRect().top+row*layout.rowHeight;
   window.scrollTo({top:Math.max(0,top-160),behavior:'instant'});
   setLayout(old=>({...old,start:Math.max(0,row-3),end:Math.min(Math.ceil(items.length/old.columns),row+Math.ceil(window.innerHeight/old.rowHeight)+4)}));
  };
  root.addEventListener('xiptv-grid-jump',jump);
  return()=>root.removeEventListener('xiptv-grid-jump',jump);
 },[items.length,layout.columns,layout.rowHeight]);
 const first=layout.start*layout.columns,last=layout.end*layout.columns;
 const totalRows=Math.ceil(items.length/layout.columns);
 return <div ref={container} className={`catalog-grid catalog-grid--${view}`} data-testid="catalog-grid" data-total={items.length} data-tv-columns={layout.columns}>
  {layout.start>0&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,layout.start*layout.rowHeight-layout.gap)}}/>}
  {items.slice(first,last).map((item,index)=><div key={getKey(item)} ref={index===0?probe:undefined} className="virtual-catalog-cell" data-grid-index={first+index}>{render(item)}</div>)}
  {layout.end<totalRows&&<div aria-hidden="true" style={{gridColumn:'1 / -1',height:Math.max(0,(totalRows-layout.end)*layout.rowHeight-layout.gap)}}/>}
 </div>;
}
