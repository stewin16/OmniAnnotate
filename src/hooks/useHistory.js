import { useState, useCallback, useRef } from 'react';

export const useHistory = (initialState = {}) => {
  const [history, setHistory] = useState({
    past: [],
    present: initialState,
    future: []
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const push = useCallback((newPresent) => {
    setHistory(prev => ({
      past: [...prev.past, prev.present].slice(-50), // Limit to 50 steps
      present: newPresent,
      future: []
    }));
  }, []);

  const undo = useCallback(() => {
    if (!canUndo) return;
    setHistory(prev => {
      const newPast = prev.past.slice(0, prev.past.length - 1);
      const previous = prev.past[prev.past.length - 1];
      return {
        past: newPast,
        present: previous,
        future: [prev.present, ...prev.future]
      };
    });
  }, [canUndo]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    setHistory(prev => {
      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: newFuture
      };
    });
  }, [canRedo]);

  const reset = useCallback((newState = {}) => {
    setHistory({
      past: [],
      present: newState,
      future: []
    });
  }, []);

  return { state: history.present, push, undo, redo, reset, canUndo, canRedo };
};
