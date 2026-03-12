import { useNavigate, useLocation } from 'react-router-dom';
import logo from '../../assets/sawgraph-explorer-logo.svg';

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isEditor = location.pathname.startsWith('/q');

  return (
    <header className='app-header'>
      <div className='header-left'>
        <button className='header-logo' onClick={() => navigate('/')}>
          <img src={logo} alt='Sawgraph Explorer' width='80' />
        </button>
      </div>
      <div className='header-right'>
        {isEditor && (
          <button className='header-back' onClick={() => navigate('/')}>
            &larr; Back to Dashboard
          </button>
        )}
      </div>
    </header>
  );
}
