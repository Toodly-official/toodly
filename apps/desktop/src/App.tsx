import { createRoot } from 'react-dom/client';
import { MainView } from './components/MainView';
import { PinView } from './components/PinView';
import { useToodlyData } from './hooks/useToodlyData';
import './styles.css';

function App() {
  const { data, updateData, rememberTag } = useToodlyData();
  const view = new URLSearchParams(window.location.search).get('window');
  return view === 'pin' ? <PinView data={data} updateData={updateData} rememberTag={rememberTag} /> : <MainView data={data} updateData={updateData} rememberTag={rememberTag} />;
}

createRoot(document.getElementById('root')!).render(<App />);
