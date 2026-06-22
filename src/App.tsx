import { Outlet } from 'react-router-dom';
import { Header } from './components/Layout/Header';
import { WalkthroughBubble } from './components/Layout/WalkthroughBubble';
import './App.css';

function App() {
  return (
    <div className="app">
      <Header />
      <Outlet />
      <WalkthroughBubble />
    </div>
  );
}

export default App;
