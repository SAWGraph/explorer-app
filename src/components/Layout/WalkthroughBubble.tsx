import { useState } from 'react';

const STORAGE_KEY = 'walkthroughDismissed';

export function WalkthroughBubble() {
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
        onClick={(e) => e.preventDefault()}
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
