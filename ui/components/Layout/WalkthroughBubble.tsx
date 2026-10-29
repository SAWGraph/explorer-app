import { useState } from 'react';
import { useQueryStore } from '../../store/queryStore';

const STORAGE_KEY = 'walkthroughDismissed';

export function WalkthroughBubble() {
  const openTour = useQueryStore((s) => s.openTour);
  const [visible, setVisible] = useState(
    () => localStorage.getItem(STORAGE_KEY) !== '1',
  );

  if (!visible) return null;

  const handleDismiss = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <div className='walkthrough-bubble' role='complementary'>
      <a
        href='#'
        className='walkthrough-bubble-link'
        onClick={(e) => {
          e.preventDefault();
          openTour();
        }}
      >
        Take a quick walkthrough 🎉
      </a>
      <button
        type='button'
        className='walkthrough-bubble-close'
        onClick={handleDismiss}
        aria-label='Dismiss walkthrough'
      >
        ×
      </button>
    </div>
  );
}
