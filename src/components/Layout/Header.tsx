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
          <img src={logo} alt='Sawgraph Explorer' width='100' />
        </button>
      </div>
      <div className='header-right'>
        {isEditor && (
          <button className='header-back' onClick={() => navigate('/')}>
            <svg viewBox='0 0 20 20' width='18' height='18' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
              <polyline points='13 4 7 10 13 16' />
            </svg>
            Back to Dashboard
          </button>
        )}
      </div>
    </header>
  );
}
