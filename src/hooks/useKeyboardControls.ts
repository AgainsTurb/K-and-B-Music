// src/hooks/useKeyboardControls.ts
import { useEffect } from 'react';

interface KeyboardActions {
  onTogglePlay?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  // You can easily add onVolumeUp, onMute, etc., here later!
}

export function useKeyboardControls(actions: KeyboardActions) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ignore keystrokes if the user is typing in the Search Bar or a text input
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      // 2. Map the keys to the actions
      switch (e.code) {
        case 'Space':
          e.preventDefault(); // Stop the page from scrolling down
          if (actions.onTogglePlay) actions.onTogglePlay();
          break;
          
        // Future-proofing: We will uncomment these when you are ready!
        /*
        case 'ArrowRight':
          e.preventDefault();
          if (actions.onNext) actions.onNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (actions.onPrev) actions.onPrev();
          break;
        */
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup the listener when the component unmounts
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}