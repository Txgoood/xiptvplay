import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { installTvNavigation } from './services/tvNavigation';
installTvNavigation();

createRoot(document.getElementById('root')!).render(<App />);
