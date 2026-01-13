/**
 * Interactive Onboarding Tour
 * Uses react-joyride to guide users through the UI
 *
 * OFF by default - only runs when explicitly triggered
 */

import { useState, useCallback } from 'react';
import Joyride from 'react-joyride';
import type { Step, CallBackProps } from 'react-joyride';
import './OnboardingTour.css';

const TOUR_COMPLETE_KEY = 'codeflow-tour-complete';

// Tour step definitions
const tourSteps: Step[] = [
  {
    target: '.app-header h1',
    content: 'Welcome to CodeFlow Visualizer! Let\'s take a quick tour of the key features.',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '.view-tabs',
    content: 'Switch between views: Architecture (module overview), Changes (recent edits), Walkthrough (call trees), and Graph (full visualization).',
    placement: 'bottom',
  },
  {
    target: '.search-bar',
    content: 'Search for any function, class, or file. Press / for quick access.',
    placement: 'bottom',
  },
  {
    target: '.main-panel',
    content: 'Your workspace. The content here changes based on which view tab you select.',
    placement: 'right',
  },
  {
    target: '.details-panel',
    content: 'Select any function to see its flow: how you get there, what it does, and where it goes.',
    placement: 'left',
  },
  {
    target: '.status-bar',
    content: 'Connection status and stats. Green means you\'re connected to the analysis server.',
    placement: 'top',
  },
  {
    target: '.keyboard-hints',
    content: 'Power user shortcuts: / to search, F to focus, 1-4 for views, ? for help.',
    placement: 'top',
  },
  {
    target: '.view-tabs',
    content: 'You\'re all set! Start by exploring the Architecture view to understand your codebase structure.',
    placement: 'bottom',
  },
];

// Custom styles for dark theme
const joyrideStyles = {
  options: {
    arrowColor: '#252536',
    backgroundColor: '#252536',
    overlayColor: 'rgba(0, 0, 0, 0.7)',
    primaryColor: '#3b82f6',
    textColor: '#e0e0e0',
    zIndex: 10000,
  },
  tooltip: {
    borderRadius: '12px',
    padding: '20px',
  },
  tooltipContainer: {
    textAlign: 'left' as const,
  },
  tooltipTitle: {
    fontSize: '16px',
    fontWeight: 600,
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: 1.6,
  },
  buttonNext: {
    backgroundColor: '#3b82f6',
    borderRadius: '8px',
    padding: '10px 20px',
    fontSize: '14px',
    fontWeight: 500,
  },
  buttonBack: {
    color: '#888',
    fontSize: '14px',
  },
  buttonSkip: {
    color: '#666',
    fontSize: '14px',
  },
  spotlight: {
    borderRadius: '8px',
  },
};

interface OnboardingTourProps {
  run: boolean;
  onComplete: () => void;
}

export function OnboardingTour({ run, onComplete }: OnboardingTourProps) {
  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, type } = data;

    // Check if tour finished or was skipped
    if (status === 'finished' || status === 'skipped') {
      localStorage.setItem(TOUR_COMPLETE_KEY, 'true');
      onComplete();
    }

    // Handle close button click
    if (type === 'tour:end') {
      onComplete();
    }
  }, [onComplete]);

  return (
    <Joyride
      steps={tourSteps}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleCallback}
      styles={joyrideStyles}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Done',
        next: 'Next',
        skip: 'Skip Tour',
      }}
      floaterProps={{
        disableAnimation: false,
      }}
    />
  );
}

/**
 * Hook to manage tour state
 * Tour is OFF by default - must be explicitly started
 */
export function useOnboardingTour() {
  const [isRunning, setIsRunning] = useState(false);

  const startTour = useCallback(() => {
    setIsRunning(true);
  }, []);

  const stopTour = useCallback(() => {
    setIsRunning(false);
  }, []);

  const hasCompletedTour = useCallback(() => {
    return localStorage.getItem(TOUR_COMPLETE_KEY) === 'true';
  }, []);

  const resetTourCompletion = useCallback(() => {
    localStorage.removeItem(TOUR_COMPLETE_KEY);
  }, []);

  return {
    isRunning,
    startTour,
    stopTour,
    hasCompletedTour,
    resetTourCompletion,
  };
}
