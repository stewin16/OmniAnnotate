import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { DEFAULT_CLASSES } from '../constants';

const ProjectContext = createContext();

export const ProjectProvider = ({ children }) => {
  // --- Core State (Session-Only) ---
  const [images, setImages] = useState([]);
  const [annotations, setAnnotations] = useState({});
  const [classes, setClasses] = useState(DEFAULT_CLASSES);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, syncing, saved

  // Persistence disabled per Phase 42 requirements for "Fresh Workspace" behavior.

  // --- Actions ---
  const commitBatch = (newImages, newAnnotations, newClasses) => {
    setClasses(newClasses);
    setImages(prev => [...prev, ...newImages]);
    setAnnotations(prev => {
      const next = { ...prev };
      Object.entries(newAnnotations).forEach(([idx, anns]) => {
        const offsetIdx = parseInt(idx) + images.length;
        next[offsetIdx] = [...(next[offsetIdx] || []), ...anns];
      });
      return next;
    });
    setCurrentIndex(images.length);
  };

  const clearProject = () => {
    setImages([]);
    setAnnotations({});
    setClasses(DEFAULT_CLASSES);
    setCurrentIndex(0);
    localStorage.clear();
  };

  const value = useMemo(() => ({
    images, setImages,
    annotations, setAnnotations,
    classes, setClasses,
    currentIndex, setCurrentIndex,
    isSyncing, setIsSyncing,
    saveStatus, setSaveStatus,
    commitBatch,
    clearProject
  }), [images, annotations, classes, currentIndex, isSyncing, saveStatus]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within a ProjectProvider');
  return context;
};
