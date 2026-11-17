import { TRACKS, getCompleted, isUnlocked, type TrackId } from '../../tours/tours';

interface HowItWorksModalProps {
  onClose: () => void;
  onStart: (id: TrackId) => void;
}

export function HowItWorksModal({ onClose, onStart }: HowItWorksModalProps) {
  const completed = getCompleted();

  return (
    <div className='modal-overlay' onClick={onClose}>
      <div
        className='how-it-works'
        onClick={(e) => e.stopPropagation()}
        role='dialog'
        aria-modal='true'
        aria-label='How it works'
      >
        <h2 className='how-it-works-title'>How it works?</h2>

        <div className='how-it-works-tracks'>
          {TRACKS.map((t, i) => {
            const unlocked = isUnlocked(t.id);
            const done = completed.includes(t.id);
            return (
              <div className='how-it-works-track' key={t.id}>
                <span className='how-it-works-track-label'>
                  <strong>{i + 1}.</strong> {t.label}
                  {done && <span className='how-it-works-done'> ✓</span>}
                </span>
                <button
                  type='button'
                  className='how-it-works-start'
                  disabled={!unlocked}
                  title={unlocked ? undefined : 'Complete the previous step to unlock'}
                  onClick={() => onStart(t.id)}
                >
                  {done ? 'Replay' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>

        <button type='button' className='how-it-works-skip' onClick={onClose}>
          I don&apos;t need a tour, skip
        </button>
      </div>
    </div>
  );
}
