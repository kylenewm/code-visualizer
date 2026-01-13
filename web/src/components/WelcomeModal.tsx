/**
 * Welcome Modal - Professional onboarding experience
 * Shows on first visit, explains features and keyboard shortcuts
 */

import { useState, useEffect } from 'react';
import './WelcomeModal.css';

const STORAGE_KEY = 'codeflow-onboarding-complete';

interface WelcomeModalProps {
  onClose: () => void;
  onStartTour?: () => void;
}

export function WelcomeModal({ onClose, onStartTour }: WelcomeModalProps) {
  const [step, setStep] = useState(0);

  const steps = [
    {
      title: 'Welcome to CodeFlow Visualizer',
      subtitle: 'Real-time code intelligence for your projects',
      content: (
        <div className="welcome-intro">
          <p>
            CodeFlow analyzes your codebase in real-time, tracking function calls,
            dependencies, and changes as you code.
          </p>
          <div className="feature-grid">
            <div className="feature-item">
              <span className="feature-icon">🏗️</span>
              <span className="feature-label">Architecture</span>
              <span className="feature-desc">Module-level overview</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span className="feature-label">Changes</span>
              <span className="feature-desc">Track modifications</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🔍</span>
              <span className="feature-label">Walkthrough</span>
              <span className="feature-desc">Explore call trees</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🕸️</span>
              <span className="feature-label">Graph</span>
              <span className="feature-desc">Interactive flow map</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Navigate with Keyboard',
      subtitle: 'Power-user shortcuts for fast navigation',
      content: (
        <div className="shortcuts-grid">
          <div className="shortcut-row">
            <div className="shortcut-keys">
              <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd>
            </div>
            <div className="shortcut-desc">
              <strong>Switch Views</strong>
              <span>Architecture, Changes, Walkthrough, Graph</span>
            </div>
          </div>
          <div className="shortcut-row">
            <div className="shortcut-keys">
              <kbd>/</kbd>
            </div>
            <div className="shortcut-desc">
              <strong>Quick Search</strong>
              <span>Find any function or class instantly</span>
            </div>
          </div>
          <div className="shortcut-row">
            <div className="shortcut-keys">
              <kbd>F</kbd>
            </div>
            <div className="shortcut-desc">
              <strong>Focus Mode</strong>
              <span>Isolate a node and its connections</span>
            </div>
          </div>
          <div className="shortcut-row">
            <div className="shortcut-keys">
              <kbd>Esc</kbd>
            </div>
            <div className="shortcut-desc">
              <strong>Clear Selection</strong>
              <span>Deselect current node</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'You\'re All Set',
      subtitle: 'Start exploring your codebase',
      content: (
        <div className="welcome-ready">
          <div className="ready-icon">🚀</div>
          <p>
            Click on any function to see its call chain, callers, and source preview.
            Changes are tracked in real-time as you edit files.
          </p>
          <div className="tip-box">
            <span className="tip-icon">💡</span>
            <span>Press <kbd>?</kbd> anytime to see this guide again</span>
          </div>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
  };

  const handleSkip = () => {
    handleComplete();
  };

  const currentStep = steps[step];

  return (
    <div className="welcome-overlay" onClick={handleSkip}>
      <div className="welcome-modal" onClick={(e) => e.stopPropagation()}>
        <button className="welcome-close" onClick={handleSkip} title="Skip intro">
          ✕
        </button>

        <div className="welcome-header">
          <h2>{currentStep.title}</h2>
          <p className="welcome-subtitle">{currentStep.subtitle}</p>
        </div>

        <div className="welcome-content">
          {currentStep.content}
        </div>

        <div className="welcome-footer">
          <div className="step-dots">
            {steps.map((_, idx) => (
              <span
                key={idx}
                className={`step-dot ${idx === step ? 'active' : ''} ${idx < step ? 'completed' : ''}`}
                onClick={() => setStep(idx)}
              />
            ))}
          </div>

          <div className="welcome-actions">
            {step < steps.length - 1 ? (
              <>
                <button className="btn-secondary" onClick={handleSkip}>
                  Skip
                </button>
                <button className="btn-primary" onClick={handleNext}>
                  Next
                </button>
              </>
            ) : (
              <>
                <button className="btn-secondary" onClick={handleComplete}>
                  Skip Tour
                </button>
                {onStartTour && (
                  <button className="btn-primary" onClick={onStartTour}>
                    Take Interactive Tour
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useWelcomeModal() {
  const [showWelcome, setShowWelcome] = useState(false);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem(STORAGE_KEY);
    if (!hasSeenOnboarding) {
      // Small delay so the app loads first
      const timer = setTimeout(() => setShowWelcome(true), 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const openWelcome = () => setShowWelcome(true);
  const closeWelcome = () => setShowWelcome(false);

  return { showWelcome, openWelcome, closeWelcome };
}

export function resetOnboarding() {
  localStorage.removeItem(STORAGE_KEY);
}
