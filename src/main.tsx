import {createRoot} from 'react-dom/client';
import {useState,useEffect,useRef} from 'react';
import App from './App.tsx';
import './index.css';
import {installTvNavigation} from './services/tvNavigation';
import {detectInterfaceMode,readInterfaceMode,saveInterfaceMode,type InterfaceMode} from './services/interfaceMode';
import {Smartphone,Tv,Check} from 'lucide-react';

function InterfaceSetup(){
  const [selected,setSelected]=useState<InterfaceMode>(detectInterfaceMode);
  const first=useRef<HTMLButtonElement>(null);
  const second=useRef<HTMLButtonElement>(null);
  useEffect(()=>{(detectInterfaceMode()==='tv'?second:first).current?.focus();},[]);
  return <main className="interface-setup" onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();(e.key==='ArrowLeft'?first:second).current?.focus();}}}>
    <div className="interface-setup-panel">
      <h1>XIPTV <span>Play</span></h1>
      <h2>Uygulama arayüzünü seçin</h2>
      <p>İstediğiniz zaman Ayarlar bölümünden değiştirebilirsiniz.</p>
      <div className="interface-setup-options">
        <button ref={first} type="button" aria-pressed={selected==='phone'} onClick={()=>setSelected('phone')}><Smartphone size={46}/><strong>Telefon</strong><small>Dokunmatik kullanım</small>{selected==='phone'&&<Check/>}</button>
        <button ref={second} type="button" aria-pressed={selected==='tv'} onClick={()=>setSelected('tv')}><Tv size={46}/><strong>TV / Android TV</strong><small>Kumanda ve geniş ekran</small>{selected==='tv'&&<Check/>}</button>
      </div>
      <button type="button" className="interface-setup-confirm" onClick={()=>{saveInterfaceMode(selected);window.location.reload();}}>Devam Et</button>
      <p>Playlistleriniz, favorileriniz ve indirmeleriniz korunur.</p>
    </div>
  </main>;
}
installTvNavigation();
createRoot(document.getElementById('root')!).render(readInterfaceMode() ? <App/> : <InterfaceSetup/>);
