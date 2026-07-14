import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import confetti from 'canvas-confetti';

export type TrackId = 'dashboard' | 'map' | 'edit';

export const TRACKS: { id: TrackId; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard Walkthrough' },
  { id: 'map', label: 'Explore Map Interface' },
  { id: 'edit', label: 'Learn to edit questions' },
];

const PROGRESS_KEY = 'tourProgress';

export function getCompleted(): TrackId[] {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]');
  } catch {
    return [];
  }
}

function markCompleted(id: TrackId) {
  const done = new Set(getCompleted());
  done.add(id);
  localStorage.setItem(PROGRESS_KEY, JSON.stringify([...done]));
}

// A track is unlocked if it's the first one, or the previous track is completed.
export function isUnlocked(id: TrackId): boolean {
  const idx = TRACKS.findIndex((t) => t.id === id);
  if (idx <= 0) return true;
  return getCompleted().includes(TRACKS[idx - 1].id);
}

function dashboardSteps(openSearchModal: () => void): DriveStep[] {
  return [
    {
      element: '[data-tour="recent"]',
      popover: {
        title: 'Welcome to Your Dashboard',
        description:
          'This screen shows your most recent work, helping you quickly resume where you left off. Click on an analysis question to continue, or select another analysis question from prebuilt section.',
      },
    },
    {
      element: '[data-tour="prebuilt"]',
      popover: {
        title: 'Explore Prebuilt Questions',
        description:
          'Browse through a list of ready-to-use analysis questions tailored to common use cases. Click on any card to preview details and begin working with that workflow.',
      },
    },
    {
      element: '[data-tour="view-more"]',
      popover: {
        title: 'Need More Options?',
        description:
          'If you don’t see what you’re looking for, click “Explore More Prebuilt Analyses” to explore the full library. You’ll find questions sorted by features, geography, and relevance.',
        // Open the search modal before advancing so step 4's element exists.
        onNextClick: (_el, _step, { driver: d }) => {
          openSearchModal();
          // ponytail: 150ms lets the modal mount; bump if it ever races.
          setTimeout(() => d.moveNext(), 150);
        },
      },
    },
    {
      element: '.search-modal-input',
      popover: {
        title: 'Looking for Something Specific?',
        description:
          'Use the search bar to quickly find predefined analysis questions. You can search by keywords, features, or geographic regions to locate the most relevant workflows.',
      },
    },
  ];
}

function mapSteps(): DriveStep[] {
  return [
    {
      // The layer panel only renders once results load; fall back to the map.
      element: () =>
        document.querySelector('.custom-layer-panel__body') ??
        document.querySelector('.map-container') ??
        document.body,
      popover: {
        title: 'Explore the Map Controls',
        description:
          'Use the Map Controls panel to show or hide different layers on the map — facilities, reaches, downstream reaches and water samples. Toggle these to focus on the data that matters most to your analysis.',
      },
    },
    {
      element: '[data-tour="publish"]',
      popover: {
        title: 'Sharing Your Work',
        description:
          'Use the Save button to keep your progress as a draft. When you’re ready to share, click Publish to make your analysis available on the dashboard.',
      },
    },
  ];
}

function editSteps(): DriveStep[] {
  const entityBlock = (i: number) => () =>
    (document.querySelectorAll('.query-editor .entity-block')[i] as Element) ??
    document.body;
  return [
    {
      element: '.query-editor .question-preview',
      popover: {
        title: 'Understand the Analysis Question',
        description:
          'This is the core question you’re building or editing. It’s automatically generated based on the selections below and updates dynamically to reflect your input.',
      },
    },
    {
      element: entityBlock(0),
      popover: {
        title: 'Add or Edit a Feature or Observation',
        description:
          'What you’re analyzing — industrial facilities, landfills, water supply wells, or similar features, or the locations of observation where PFAS samples have been taken or PFAS release has been reported.',
      },
    },
    {
      element: '.query-editor .relationship-selector',
      popover: {
        title: 'Define the Relationship',
        description:
          'This defines the spatial relationship between two features — in this case, water bodies and sources of pollution. It’s a powerful way to analyze cause-effect by location (e.g., upstream/downstream, nearby, within radius, etc.).',
      },
    },
    {
      element: entityBlock(1),
      popover: {
        title: 'Add a Source Feature',
        description:
          'This is your source or influencing feature — the facilities or sites potentially impacting the target feature. Essential for risk analysis or tracing pollution sources. Add sectors by NAICS code or category.',
      },
    },
    {
      element: '.modal-footer',
      popover: {
        title: 'Apply or Discard Changes',
        description:
          'These are final actions. Changes won’t apply until you click Apply — giving you confidence to experiment with your query before committing.',
      },
    },
  ];
}

// openSearchModal is only needed for the dashboard track. onFinish runs after a
// successful Finish (not on skip/close) — used to return to the dashboard + reopen the hub.
export function startTour(
  id: TrackId,
  opts: { openSearchModal?: () => void; onFinish?: () => void } = {},
) {
  const steps =
    id === 'dashboard'
      ? dashboardSteps(opts.openSearchModal ?? (() => {}))
      : id === 'map'
        ? mapSteps()
        : editSteps();

  const d = driver({
    showProgress: true,
    allowClose: true,
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Finish 🎉',
    steps,
    onDoneClick: (_el, _step, { driver: drv }) => {
      drv.destroy();
      markCompleted(id);
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 } });
      opts.onFinish?.();
    },
  });

  d.drive();
}
