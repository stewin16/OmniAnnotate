import React, { useState, useRef, useEffect, useCallback } from 'react';

import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderPlus, Upload, Trash2, Crosshair, Move, Hand, Activity, Dna, Download,
  Layers, Package, ChevronRight, ChevronLeft, Hexagon, Maximize, MousePointer2,
  Image, Folder, XCircle, FileArchive, MousePointerClick, Grid, BoxSelect, Square, Play, Plus, X, Search, FileSymlink, FileBox, Sun, Contrast, Camera, Zap, Maximize2
} from 'lucide-react';
import AnnotatorCanvas from './components/AnnotatorCanvas';
import JSZip from 'jszip';
import './App.css';

// Mock/Init data for general project
const DEFAULT_CLASSES = ['Object', 'Person', 'Vehicle'];

// Custom Error Boundary for Production Stability
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error) { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', background: '#ffffff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <XCircle size={64} color="var(--accent-color)" />
          <h2 style={{ color: 'var(--text-color)', marginTop: '24px' }}>Neural Link Severed</h2>
          <p style={{ color: 'var(--text-dim)', maxWidth: '400px', marginTop: '12px' }}>A fatal error occurred in the visualization engine. The session has been safely isolated.</p>
          <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={() => window.location.reload()}>RESTORE LINK</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [images, setImages] = useState(() => {
    const saved = localStorage.getItem('omni_images');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [classes, setClasses] = useState(() => {
    const saved = localStorage.getItem('omni_classes');
    return saved ? JSON.parse(saved) : DEFAULT_CLASSES;
  });
  const [currentClass, setCurrentClass] = useState(0);
  const [annoMode, setAnnoMode] = useState('box'); // 'box', 'poly', 'select'
  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, sharpness: 100 });
  const [annotations, setAnnotations] = useState(() => {
    const saved = localStorage.getItem('omni_annotations');
    return saved ? JSON.parse(saved) : {};
  });

  const [selectedAnnIds, setSelectedAnnIds] = useState(new Set()); // Support multi-select
  const [showImportHub, setShowImportHub] = useState(false);
  const [showHUD, setShowHUD] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1024);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(window.innerWidth > 1280);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [hiddenClasses, setHiddenClasses] = useState(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'annotated', 'pending'
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [history, setHistory] = useState({ past: [], present: {}, future: [] });
  const [flash, setFlash] = useState(0);
  const [saveStatus, setSaveStatus] = useState('idle'); // 'idle', 'syncing', 'saved'
  const [mediaError, setMediaError] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState({ current: 0, total: 0 });
  const [classSearch, setClassSearch] = useState('');
  
  const canvasRef = useRef(null);

  useEffect(() => {
    if (Object.keys(annotations).length > 0 && history.past.length === 0 && Object.keys(history.present).length === 0) {
      setHistory(prev => ({ ...prev, present: annotations }));
    }
  }, [annotations, history]); // Added history to dependencies

  useEffect(() => {
    localStorage.setItem('omni_images', JSON.stringify(images));
    localStorage.setItem('omni_annotations', JSON.stringify(annotations));
    localStorage.setItem('omni_classes', JSON.stringify(classes));
    setSaveStatus('syncing');
    const timeout = setTimeout(() => setSaveStatus('saved'), 400);
    const hideTimeout = setTimeout(() => setSaveStatus('idle'), 3000);
    return () => { clearTimeout(timeout); clearTimeout(hideTimeout); };

  }, [images, annotations, classes]);


  useEffect(() => {
    if (images.length > 0 && !mediaError) {
      const interval = setInterval(async () => {
        const url = images[currentIndex]?.url;
        if (!url) return;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          if (!res.ok) setMediaError(true);
        } catch (e) {
          setMediaError(true);
        }
      }, 30000); // Check every 30s
      return () => clearInterval(interval);
    }
  }, [images, currentIndex, mediaError]);

  const handleRestoreSession = (e) => {
    const files = Array.from(e.target.files);
    const updatedImages = images.map(img => {
      const match = files.find(f => f.name === img.name);
      if (match) {
         return { ...img, url: URL.createObjectURL(match), file: match };
      }
      return img;
    });
    setImages(updatedImages);
    setMediaError(false);
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 'z') {
        if (history.past.length > 0) {
          const previous = history.past[history.past.length - 1];
          const newPast = history.past.slice(0, history.past.length - 1);
          setHistory({ past: newPast, present: previous, future: [history.present, ...history.future] });
          setAnnotations(previous);
        }
        return;
      }
      if (e.ctrlKey && (key === 'y' || (e.shiftKey && key === 'z'))) {
        if (history.future.length > 0) {
          const next = history.future[0];
          const newFuture = history.future.slice(1);
          setHistory({ past: [...history.past, history.present], present: next, future: newFuture });
          setAnnotations(next);
        }
        return;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (canvasRef.current && annoMode === 'select') canvasRef.current.nudgeSelected(key, step);
        return;
      }
      if (key === 'delete' || key === 'backspace') {
        const curAnns = annotations[currentIndex] || [];
        if (selectedAnnIds.size > 0) {
          const newAnns = curAnns.filter(a => !selectedAnnIds.has(String(a.id)));
          handleUpdateAnnotations(newAnns);
          setSelectedAnnIds(new Set());
        }
        return;
      }

      if (e.ctrlKey && key === 'd') {
        e.preventDefault();
        handleDuplicateSelected();
        return;
      }

      if (key === 'n') { // Copy to next
        handleCopyToNext();
        return;
      }

      if (key === 'b') setAnnoMode('box');
      if (key === 'p') setAnnoMode('poly');
      if (key === 'v') setAnnoMode('select');
      if (key === 'a') setShowAnalytics(!showAnalytics);
      if (key === 'h') setShowHUD(!showHUD);
      if (key === '?') setShowHelp(!showHelp);
      if (key === 's') handleSnapshot();
      if (key === 'f') canvasRef.current?.resetView(); // Fit to View
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key) - 1;
        if (idx < classes.length) { setCurrentClass(idx); setAnnoMode('box'); }
      }
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        const allIds = new Set(
          (annotations[currentIndex] || [])
            .filter(ann => !hiddenClasses.has(ann.class))
            .map(ann => String(ann.id))
        );
        setSelectedAnnIds(allIds);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showHUD, showHelp, history, selectedAnnIds, currentIndex, annotations, classes, annoMode, flash, hiddenClasses]);

  const handleUpdateAnnotations = (newAnns) => {
    const nextAnnotations = { ...annotations, [currentIndex]: newAnns };
    setHistory(prev => ({ past: [...prev.past, prev.present], present: nextAnnotations, future: [] }));
    setAnnotations(nextAnnotations);
  };

  const handleAddAnnotation = (ann) => {
    const nextAnnotations = { ...annotations, [currentIndex]: [...(annotations[currentIndex] || []), ann] };
    setHistory(prev => ({ past: [...prev.past, prev.present], present: nextAnnotations, future: [] }));
    setAnnotations(nextAnnotations);
  };

  const handlePurgeAnnotations = () => {
    handleUpdateAnnotations([]);
    setFlash(0.8);
  };

  const handleCopyToNext = () => {

    if (currentIndex >= images.length - 1) return;
    const currentAnns = annotations[currentIndex] || [];
    if (currentAnns.length === 0) return;

    // Deep clone current annotations
    const cloned = currentAnns.map(ann => ({ ...ann, id: Math.random() }));
    const nextAnns = [...(annotations[currentIndex + 1] || []), ...cloned];

    setAnnotations(prev => ({
      ...prev,
      [currentIndex + 1]: nextAnns
    }));
    setCurrentIndex(currentIndex + 1);
    setFlash(1.0);
  };

  const handleDuplicateSelected = () => {
    if (selectedAnnIds.size === 0) return;
    const currentAnns = annotations[currentIndex] || [];
    const newAnns = [...currentAnns];

    currentAnns.forEach(ann => {
      if (selectedAnnIds.has(String(ann.id))) {
        const clone = JSON.parse(JSON.stringify(ann));
        clone.id = Math.random();
        if (clone.type === 'box') {
          clone.coords.x += 20; clone.coords.y += 20;
        } else if (clone.type === 'poly') {
          clone.points = clone.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
        }
        newAnns.push(clone);
      }
    });

    handleUpdateAnnotations(newAnns);
    setFlash(0.5);
  };

  const handleClearWorkspace = () => {
    // Redacted - Removing from UI as per user request
  };

  const handleSnapshot = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.getSnapshot();
    if (!url) return;
    const link = document.createElement('a'); 
    link.href = url;
    link.download = `OmniAnnotate_Snapshot_${currentIndex + 1}.png`; 
    link.click();
  };


  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    const loadedPromises = files.map(file => new Promise(resolve => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({ name: file.name, url, width: img.width, height: img.height, file });
      };
      img.onerror = () => resolve(null);
      img.src = url;
    }));
    const loadedImages = (await Promise.all(loadedPromises)).filter(img => img !== null);
    setImages(prev => [...prev, ...loadedImages]);
  };

  const handleDownloadFullProject = async () => {
    const zip = new JSZip();
    const imgFolder = zip.folder("images");
    const labelFolder = zip.folder("labels");

    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try {
        const response = await fetch(img.url);
        const blob = await response.blob();
        imgFolder.file(img.name, blob);
      } catch (e) {}

      // Get real dimensions for normalization
      const imageDims = await new Promise((resolve) => {
        const item = new Image();
        item.onload = () => resolve({ w: item.width, h: item.height });
        item.onerror = () => resolve({ w: 1000, h: 1000 }); // Fallback
        item.src = img.url;
      });

      const yoloLines = (annotations[i] || []).filter(a => a.type === 'box').map(ann => {
        const { x, y, w, h } = ann.coords;
        const xc = (x + w / 2) / imageDims.w;
        const yc = (y + h / 2) / imageDims.h;
        const nw = w / imageDims.w;
        const nh = h / imageDims.h;
        return `${ann.class} ${xc.toFixed(6)} ${yc.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`;
      });
      labelFolder.file(img.name.replace(/\.[^/.]+$/, "") + ".txt", yoloLines.join('\n'));
    }
    zip.file("classes.txt", classes.join('\n'));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(content);
    link.download = `OmniProject_YOLO_${new Date().toISOString().split('T')[0]}.zip`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleDownloadCOCO = async () => {
    const coco = {
      images: [],
      annotations: [],
      categories: classes.map((c, i) => ({ id: i, name: c, supercategory: "none" }))
    };

    let annId = 1;
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const imageDims = await new Promise((resolve) => {
        const item = new Image();
        item.onload = () => resolve({ w: item.width, h: item.height });
        item.src = img.url;
      });

      coco.images.push({
        id: i,
        file_name: img.name,
        width: imageDims.w,
        height: imageDims.h
      });

      const imgAnns = annotations[i] || [];
      imgAnns.forEach(ann => {
        if (ann.type === 'box') {
          const { x, y, w, h } = ann.coords;
          coco.annotations.push({
            id: annId++,
            image_id: i,
            category_id: ann.class,
            bbox: [x, y, w, h],
            area: w * h,
            segmentation: [],
            iscrowd: 0
          });
        }
      });
    }

    const blob = new Blob([JSON.stringify(coco, null, 2)], { type: 'application/json' });
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(blob);
    link.download = `OmniProject_COCO_${new Date().toISOString().split('T')[0]}.json`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const handleUnifiedBatchImport = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsIndexing(true);
    setIndexProgress({ current: 0, total: files.length });
    console.log(`[OmniAnnotate] Elite Ingestion Protocol Initiated: ${files.length} files.`);
    
    const imgFiles = files.filter(f => f.type.startsWith('image/') || f.name.match(/\.(jpg|jpeg|png|webp|bmp|gif)$/i));
    const labelFiles = files.filter(f => f.name.endsWith('.txt') && f.name !== 'classes.txt');
    const classesFile = files.find(f => f.name === 'classes.txt');

    // 1. Index Classes
    if (classesFile) { 
      const text = await classesFile.text(); 
      const newClasses = text.split('\n').map(l => l.trim()).filter(l => l);
      setClasses(newClasses);
    }

    // 2. Index Media (Parallel)
    const validImages = [];
    let processedFiles = 0;

    for (const file of imgFiles) {
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.onload = () => resolve({ name: file.name, url, width: i.width, height: i.height, file });
          i.onerror = () => reject();
          i.src = url;
        });
        validImages.push(img);
      } catch (err) {
        console.error(`[OmniAnnotate] Extraction Error: ${file.name}`);
      }
      processedFiles++;
      setIndexProgress(prev => ({ ...prev, current: processedFiles }));
    }

    // 3. Reconcile Annotations (Single Pass)
    const bufferAnns = {};
    const finalImages = [...images, ...validImages];
    
    for (const file of labelFiles) {
      const labelBaseName = file.name.replace(/\.[^/.]+$/, "").toLowerCase();
      const imgIdx = finalImages.findIndex(img => 
        img.name.replace(/\.[^/.]+$/, "").toLowerCase() === labelBaseName
      );
      
      if (imgIdx !== -1) {
        const text = await file.text();
        const img = finalImages[imgIdx];
        const imgAnns = text.split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('#'))
          .map(line => {
            const parts = line.split(/\s+/).map(Number);
            if (parts.length < 5 || parts.some(isNaN)) return null;
            const [cls, xc, yc, w, h] = parts;
            return { 
              id: Math.random(), 
              type: 'box', 
              class: cls, 
              coords: { 
                x: (xc - w/2) * img.width, 
                y: (yc - h/2) * img.height, 
                w: w * img.width, 
                h: h * img.height 
              } 
            };
          }).filter(a => a);
        
        bufferAnns[imgIdx] = [...(bufferAnns[imgIdx] || []), ...imgAnns];
      }
      processedFiles++;
      setIndexProgress(prev => ({ ...prev, current: processedFiles }));
    }

    // 4. Batch State Commit
    setImages(finalImages);
    setAnnotations(prev => {
      const next = { ...prev };
      Object.keys(bufferAnns).forEach(idx => {
        next[idx] = [...(next[idx] || []), ...bufferAnns[idx]];
      });
      return next;
    });

    setIsIndexing(false);
    setShowImportHub(false);
    console.log(`[OmniAnnotate] Ingestion Success: ${validImages.length} images, ${Object.values(bufferAnns).flat().length} boxes.`);
  };


  const handleDownloadVOC = async () => {
    const zip = new JSZip(); const vocFolder = zip.folder("pascal_voc_labels");
    for (let idx = 0; idx < images.length; idx++) {
      const img = images[idx];
      const imgAnns = annotations[idx] || []; if (imgAnns.length === 0) continue;

      const imageDims = await new Promise((resolve) => {
        const item = new Image();
        item.onload = () => resolve({ w: item.width, h: item.height });
        item.src = img.url;
      });

      let xml = `<?xml version="1.0"?><annotation><folder>images</folder><filename>${img.name}</filename><size><width>${imageDims.w}</width><height>${imageDims.h}</height><depth>3</depth></size>`;
      imgAnns.forEach(ann => {
        if (ann.type === 'box') {
          const { x, y, w, h } = ann.coords;
          xml += `<object><name>${classes[ann.class] || 'unknown'}</name><pose>Unspecified</pose><truncated>0</truncated><difficult>0</difficult><bndbox><xmin>${Math.round(x)}</xmin><ymin>${Math.round(y)}</ymin><xmax>${Math.round(x + w)}</xmax><ymax>${Math.round(y + h)}</ymax></bndbox></object>`;
        }
      });
      xml += `</annotation>`;
      vocFolder.file(`${img.name.replace(/\.[^/.]+$/, "")}.xml`, xml);
    }
    zip.file("classes.txt", classes.join('\n'));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a'); 
    link.href = URL.createObjectURL(content);
    link.download = `VOC_Export_${new Date().toISOString().split('T')[0]}.zip`; 
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const filteredImages = images.map((img, idx) => ({ ...img, originalIdx: idx })).filter((img) => {
    const hasAnns = (annotations[img.originalIdx] || []).length > 0;
    if (filterMode === 'annotated') return hasAnns;
    if (filterMode === 'pending') return !hasAnns;
    return true;
  });

  const currentImage = images[currentIndex];
  const selectedBoxes = (annotations[currentIndex] || []).filter(a => selectedAnnIds.has(String(a.id)));

  return (
    <ErrorBoundary>
      <div className="app-container">
        <header className="app-header">
          <div className="brand" style={{ gap: '8px' }}>
            <button 
              className="btn-icon" 
              style={{ padding: 8, background: sidebarOpen ? 'var(--bg-color)' : 'transparent', borderRadius: 8 }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Grid size={20} color={sidebarOpen ? 'var(--accent-color)' : 'var(--text-dim)'} />
            </button>
            <img src="/omni-logo.png" alt="OmniAnnotate" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }} className="brand-text">
                <h2 style={{ letterSpacing: 1, fontWeight: 800, margin: 0, color: '#0f172a', fontSize: '18px' }}>OMNI<span style={{ color: 'var(--accent-color)' }}>ANNOTATE</span></h2>
                <span className="brand-subtitle" style={{ fontSize: 10, color: 'var(--text-dim)', letterSpacing: 1, fontWeight: 700 }}>ADVANCED_PRECISION_MEDIA_SUITE</span>
            </div>
            <div style={{ marginLeft: '12px', fontSize: '10px', color: saveStatus === 'saved' ? 'var(--success-color)' : 'var(--text-dim)', opacity: saveStatus === 'idle' ? 0 : 1, transition: 'opacity 0.3s', fontWeight: 800 }}>
              {saveStatus === 'syncing' ? 'SYNCING...' : 'ARCHIVE_STABLE'}
            </div>
          </div>

          {mediaError && (
            <motion.div 
              initial={{ y: -20, opacity: 0 }} 
              animate={{ y: 0, opacity: 1 }}
              style={{ background: 'var(--accent-color)', color: 'white', padding: '4px 12px', fontSize: '11px', fontWeight: 700, borderRadius: '2px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
              onClick={() => document.getElementById('restore-input').click()}
            >
              <Zap size={14} /> SESSION EXPIRED: RE-LINK LOCAL IMAGES TO RESTORE VIEWS
              <input type="file" id="restore-input" multiple hidden onChange={handleRestoreSession} />
            </motion.div>
          )}

          <div className="header-actions-desktop" style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={() => setShowImportHub(true)}>
              <FileSymlink size={16} /> INDEX FILES
            </button>
            <div className="btn-group">
              <button 
                className="btn btn-secondary"
                onClick={() => {
                  canvasRef.current?.resetView();
                }}
              >
                <Maximize2 size={16} /> FIT TO VIEW
              </button>
              <button className="btn btn-success" onClick={handleDownloadFullProject} title="YOLO Export">YOLO</button>
              <button className="btn btn-success" onClick={handleDownloadCOCO} title="COCO Export">COCO</button>
              <button className="btn btn-success" onClick={handleDownloadVOC} title="Pascal VOC XML">VOC</button>
            </div>
          </div>

          <div className="header-actions-mobile">
             <button className="btn btn-primary" onClick={() => setShowMobileMenu(!showMobileMenu)}>
               <Layers size={16} /> EXPORT
             </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-color)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-dim)' }}>FILE:</span>
              {images.length > 0 ? (
                <input
                  type="number"
                  value={currentIndex + 1}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (!isNaN(val) && val >= 1 && val <= images.length) setCurrentIndex(val - 1);
                  }}
                  style={{ width: 40, background: 'transparent', border: 'none', borderBottom: '1px solid var(--text-color)', textAlign: 'center', fontWeight: 'bold', fontSize: 14, color: 'var(--text-color)', outline: 'none' }}
                />
              ) : <span style={{ fontWeight: 'bold' }}>0</span>}
              <span style={{ fontSize: 12, fontWeight: 700 }}>/ {images.length}</span>
            </div>
            <button 
              className="btn btn-icon" 
              title="Fit to View (F)"
              onClick={() => canvasRef.current?.resetView()}
            >
              <Maximize2 size={18} />
            </button>
            <button 
              className="btn-icon" 
              style={{ padding: 8, background: rightSidebarOpen ? 'var(--bg-color)' : 'transparent', borderRadius: 8 }}
              onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
            >
              <Activity size={20} color={rightSidebarOpen ? 'var(--accent-color)' : 'var(--text-dim)'} />
            </button>
          </div>
        </header>

        <main className="main-content">
          <AnimatePresence>
            {(sidebarOpen || rightSidebarOpen) && window.innerWidth <= 1024 && (
              <motion.div 
                className="drawer-backdrop" 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }}
                onClick={() => { setSidebarOpen(false); setRightSidebarOpen(false); }}
              />
            )}
          </AnimatePresence>

          <aside className={`sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
            {window.innerWidth <= 1024 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
                <button className="btn-icon" onClick={() => setSidebarOpen(false)}><X size={24} /></button>
              </div>
            )}
             <div className="sidebar-section">
                <h3 className="section-title">ANNOTATION TOOLS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className={`btn ${annoMode === 'box' ? 'btn-primary' : ''}`} onClick={() => setAnnoMode('box')}><Square size={16} /> BOX</button>
                  <button className={`btn ${annoMode === 'poly' ? 'btn-primary' : ''}`} onClick={() => setAnnoMode('poly')}><Hexagon size={16} /> POLY</button>
                  <button className={`btn ${annoMode === 'select' ? 'btn-primary' : ''}`} style={{ gridColumn: 'span 2' }} onClick={() => setAnnoMode('select')}><MousePointer2 size={16} /> SELECT (V)</button>
                </div>
             </div>


              <div className="sidebar-section">
                <h3 className="section-title">WORKFLOW TOOLS</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  <button className="btn" onClick={handleCopyToNext} disabled={currentIndex === images.length - 1}>
                    <Plus size={14} /> COPY TO NEXT (N)
                  </button>
                  <button className="btn" onClick={handleDuplicateSelected} disabled={selectedAnnIds.size === 0}>
                    <Layers size={14} /> DUPLICATE (Ctrl+D)
                  </button>
                  <button className="btn btn-danger" style={{ marginTop: '12px' }} onClick={handlePurgeAnnotations} disabled={!annotations[currentIndex] || annotations[currentIndex].length === 0}>
                    <Trash2 size={14} /> PURGE DATA
                  </button>
                </div>
             </div>


             {selectedBoxes.length === 1 && selectedBoxes[0].type === 'box' && (
               <div className="sidebar-section" style={{ background: 'rgba(59,130,246,0.03)', border: '1px solid rgba(59,130,246,0.1)' }}>
                  <h3 className="section-title" style={{ color: 'var(--accent-color)' }}>COORDINATES</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', fontSize: '11px', fontWeight: '800' }}>
                    <div>X1: {Math.round(selectedBoxes[0].coords.x)}</div>
                    <div>Y1: {Math.round(selectedBoxes[0].coords.y)}</div>
                    <div>X2: {Math.round(selectedBoxes[0].coords.x + selectedBoxes[0].coords.w)}</div>
                    <div>Y2: {Math.round(selectedBoxes[0].coords.y + selectedBoxes[0].coords.h)}</div>
                  </div>
               </div>
             )}

             <div className="sidebar-section">
                <h3 className="section-title">IMAGE ENGINE</h3>
                <div className="filter-group">
                  <label><Sun size={12} /> Brightness</label>
                  <input type="range" min="50" max="200" value={filters.brightness} onChange={(e) => setFilters({...filters, brightness: e.target.value})} />
                  <label><Contrast size={12} /> Contrast</label>
                  <input type="range" min="50" max="200" value={filters.contrast} onChange={(e) => setFilters({...filters, contrast: e.target.value})} />
                </div>
                <button className="btn" style={{ marginTop: '16px', width: '100%' }} onClick={() => setFilters({brightness: 100, contrast: 100})}>Reset Engine</button>
             </div>
          </aside>

          <section className="canvas-area">
            <div className="floating-toolbar">
              <button className={`tool-btn ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')} title="Show All">ALL</button>
              <button className={`tool-btn ${filterMode === 'annotated' ? 'active' : ''}`} onClick={() => setFilterMode('annotated')} title="Annotated">DONE</button>
              <button className={`tool-btn ${filterMode === 'pending' ? 'active' : ''}`} onClick={() => setFilterMode('pending')} title="Pending">TODO</button>
              <div style={{ width: '20px', height: '1px', background: 'var(--border-color)', margin: '4px auto' }} />
              <button className="tool-btn" onClick={() => canvasRef.current.resetView()} title="Center View"><Maximize size={20} /></button>
              <button className="tool-btn" onClick={handleSnapshot} title="Snapshot (S)"><Camera size={20} /></button>
              <button className="tool-btn" onClick={() => setShowHelp(true)} title="Help (?)"><Search size={20} /></button>
            </div>



            <AnimatePresence>
              {showHUD && (
                <motion.div className="holographic-hud" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <div className="hud-pill"><MousePointer2 size={14} /> <span>{annoMode.toUpperCase()} MODE</span></div>
                  <div className="hud-pill"><Layers size={14} /> <span>{ (annotations[currentIndex] || []).length } OBJECTS</span></div>
                  {selectedAnnIds.size > 0 && (
                    <div className="hud-pill" style={{ background: 'var(--accent-color)', color: 'white' }}>
                      <span>{selectedAnnIds.size} SELECTED</span>
                    </div>
                  )}
                  {isSyncing && <div className="hud-pill" style={{ color: 'var(--success-color)' }}><Zap size={14} /> <span>SYNCING</span></div>}
                </motion.div>
              )}
            </AnimatePresence>

            {currentImage ? (
              <AnnotatorCanvas 
                ref={canvasRef} 
                image={currentImage} 
                annotations={annotations[currentIndex] || []} 
                onAddAnnotation={handleAddAnnotation} 
                onUpdateAnnotations={handleUpdateAnnotations} 
                mode={annoMode} 
                activeClass={currentClass} 
                classes={classes} 
                hiddenClasses={hiddenClasses} 
                filters={filters} 
                selectedIds={selectedAnnIds} 
                onSelectIds={setSelectedAnnIds} 
              />
            ) : (
              <div style={{ textAlign: 'center', opacity: 0.8, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ width: 140, height: 180, border: '1px solid var(--border-color)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, background: 'white', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.05)' }}>
                <div style={{ position: 'relative' }}>
                  <FolderPlus size={64} color="var(--accent-color)" opacity={0.4} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Zap size={24} color="var(--accent-color)" />
                  </div>
                </div>
              </div>
              <h2 style={{ letterSpacing: 1, fontWeight: 800, margin: 0, color: '#0f172a' }}>OMNIANNOTATE EMPTY</h2>
              <p style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 12, maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
                Awaiting media assets for precision classification. Proceed via the <b>INDEX FILES</b> portal to begin.
              </p>
                <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setShowImportHub(true)}>
                  <FileSymlink size={16}/> INITIALIZE ARCHIVE
                </button>
              </div>
            )}
          </section>

          <aside className={`right-sidebar ${rightSidebarOpen ? '' : 'collapsed'}`}>
            {window.innerWidth <= 1024 && (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 20 }}>
                <button className="btn-icon" onClick={() => setRightSidebarOpen(false)}><X size={24} /></button>
              </div>
            )}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed var(--border-color)', paddingBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: 1 }}>CLASSIFICATIONS</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-icon" style={{ padding: 4 }} onClick={() => setClassSearch('')} title="Reset Search"><Layers size={14} /></button>
                <button className="btn" style={{ padding: '2px 6px' }} onClick={() => setShowAddClass(true)}><Plus size={14} /></button>
              </div>
            </header>

            <div style={{ margin: '12px 0' }}>
              <div className="search-bar" style={{ background: 'rgba(255,255,255,1)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px 12px', display: 'flex', alignItems: 'center' }}>
                <Search size={14} opacity={0.4} />
                <input 
                  placeholder="Search classifications..." 
                  value={classSearch}
                  onChange={e => setClassSearch(e.target.value)}
                  style={{ border: 'none', background: 'transparent', width: '100%', fontSize: '12px', padding: '6px 8px', outline: 'none' }}
                />
              </div>
            </div>

            {showAddClass && (
              <div style={{ padding: '8px', borderBottom: '1px dashed var(--border-color)', display: 'flex', gap: '4px', marginBottom: '12px' }}>
                <input 
                  autoFocus
                  placeholder="Class Name"
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (newClassName.trim()) {
                        setClasses([...classes, newClassName.trim()]);
                        setNewClassName('');
                        setShowAddClass(false);
                      }
                    } else if (e.key === 'Escape') {
                      setShowAddClass(false);
                    }
                  }}
                  style={{ flex: 1, border: '1px solid var(--border-color)', background: 'var(--bg-color)', padding: '4px 8px', fontSize: '12px', color: 'var(--text-color)', outline: 'none' }}
                />
                <button className="btn btn-success" style={{ padding: '4px 8px' }} onClick={() => {
                  if (newClassName.trim()) setClasses([...classes, newClassName.trim()]);
                  setNewClassName('');
                  setShowAddClass(false);
                }}><Plus size={12} /></button>
              </div>
            )}

            <div style={{ overflowY: 'auto', flex: 1 }}>
              {classes
                .filter(c => c.toLowerCase().includes(classSearch.toLowerCase()))
                .map((cls) => {
                  const originalIdx = classes.indexOf(cls);
                  const isSelected = currentClass === originalIdx;
                  return (
                    <div 
                      key={originalIdx} 
                      className={`label-item ${isSelected ? 'active' : ''}`} 
                      onClick={() => setCurrentClass(originalIdx)}
                    >
                      <div style={{ width: 16, height: 16, background: `hsl(${originalIdx * 137.5}, 50%, 50%)`, borderRadius: 0, border: '1px solid var(--border-color)' }} />
                      <input 
                        className="class-input"
                        value={cls} 
                        onChange={(e) => {
                          const nc = [...classes]; 
                          nc[originalIdx] = e.target.value; 
                          setClasses(nc);
                        }}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 600, color: 'inherit', fontFamily: 'var(--font-main)' }}
                      />
                      <button className="btn-icon-tiny" onClick={(e) => { e.stopPropagation(); setClasses(classes.filter((_, i) => i !== originalIdx)); }}>
                        <X size={12} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </aside>
        </main>

        <footer className="footer">
          <button className="btn" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}><ChevronLeft size={16}/></button>
          <div style={{ flex: 1, display: 'flex', gap: 12, overflowX: 'auto', padding: '10px 0' }}>
            {filteredImages.map((img, i) => {
              const hasAnns = (annotations[img.originalIdx] || []).length > 0;
              return (
                <div 
                  key={i} 
                  className={`thumb-card ${currentIndex === img.originalIdx ? 'active' : ''}`} 
                  onClick={() => setCurrentIndex(img.originalIdx)}
                  style={{ position: 'relative' }}
                >
                  <img 
                    src={img.url} 
                    alt={img.name} 
                    onError={(e) => { e.target.src = 'https://placehold.co/100x100?text=Error'; console.error('Thumbnail Load Error:', img.name); }}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                  />
                  <div style={{ 
                    position: 'absolute', top: 4, right: 4, width: 8, height: 8, 
                    borderRadius: '50%', background: hasAnns ? 'var(--success-color)' : 'rgba(0,0,0,0.2)',
                    border: '1px solid var(--bg-color)'
                  }} />
                  {/* Paper clip / stamped corner visual */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 12, height: 12, background: 'linear-gradient(135deg, transparent 50%, var(--panel-bg) 50%)' }} />
                </div>
              );
            })}
          </div>

          <button className="btn" onClick={() => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))}><ChevronRight size={16}/></button>
        </footer>

        <AnimatePresence>
          {showHelp && (
            <div className="modal-overlay" onClick={() => setShowHelp(false)}>
              <div className="modal-content" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', borderBottom: '2px solid var(--accent-color)', paddingBottom: '12px' }}>
                  <h2 style={{ margin: 0, letterSpacing: 2 }}>OPERATIONAL MANUAL</h2>
                  <button className="btn-icon" onClick={() => setShowHelp(false)}><X size={20}/></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '16px 24px', fontSize: '14px' }}>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>B</span> <span>Activate Bounding Box Mode</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>P</span> <span>Activate Polygon Mode</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>V</span> <span>Activate Selection Mode</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>N</span> <span>Copy current data to next image</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>DEL/BS</span> <span>Remove selected objects</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>1-9</span> <span>Quick-switch active class</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>CTRL+D</span> <span>Duplicate selected objects</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>CTRL+Z/Y</span> <span>Undo / Redo history</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>H</span> <span>Toggle HUD overlay visibility</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>S</span> <span>Capture image snapshot</span>
                  <span style={{ fontWeight: 800, color: 'var(--accent-color)' }}>SPACE</span> <span>Hold to Pan map view</span>
                </div>
                <div style={{ marginTop: '32px', textAlign: 'center', opacity: 0.6, fontSize: '11px', borderTop: '1px dashed var(--border-color)', paddingTop: '16px' }}>
                  CONFIDENTIAL ARCHIVAL SYSTEM // VERSION 1.0.42
                </div>
              </div>
            </div>
          )}

          {showImportHub && (

            <div className="modal-overlay" onClick={() => setShowImportHub(false)}>
              <div className="import-hub" onClick={e => e.stopPropagation()}>
              <button 
                className="btn-icon" 
                style={{ position: 'absolute', top: 24, right: 24, padding: 8, background: '#f1f5f9', borderRadius: '50%' }}
                onClick={() => setShowImportHub(false)}
              >
                <X size={20} />
              </button>
              <h2 style={{ marginBottom: 32, fontWeight: 800, letterSpacing: 1, color: '#0f172a' }}>IMPORT ASSETS</h2>
              <div className="import-grid">
                <label className="import-card" style={{ gridColumn: 'span 3', border: '2px solid var(--accent-color)', background: 'rgba(14,165,233,0.05)' }}>
                  <Layers size={48} color="var(--accent-color)" />
                  <h3 style={{ margin: 0, fontWeight: 700 }}>PROJECT BATCH (YOLO)</h3>
                  <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Import images, labels, and classes collectively</p>
                  <input type="file" multiple hidden onChange={handleUnifiedBatchImport} />
                </label>
                <label className="import-card" style={{ gridColumn: 'span 3' }}>
                  <Image size={32} color="var(--accent-color)" />
                  <h3 style={{ margin: 0, fontWeight: 700 }}>MEDIA UPLOAD</h3>
                  <p style={{ fontSize: 12, opacity: 0.6, margin: 0 }}>Add individual image documents to current archive</p>
                  <input type="file" multiple accept="image/*" hidden onChange={handleUpload} />
                </label>
              </div>
            </div>
            </div>
          )}
          {showMobileMenu && (
            <div className="modal-overlay" onClick={() => setShowMobileMenu(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                 <h2 style={{ marginBottom: 24, fontWeight: 800 }}>PROJECT ACTIONS</h2>
                 <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { setShowImportHub(true); setShowMobileMenu(false); }}>
                      <FileSymlink size={16} /> INDEX FILES
                    </button>
                    <div style={{ height: 1, background: 'var(--border-color)', margin: '8px 0' }} />
                    <button className="btn btn-success" style={{ width: '100%' }} onClick={() => { handleDownloadFullProject(); setShowMobileMenu(false); }}>EXPORT YOLO (.ZIP)</button>
                    <button className="btn btn-success" style={{ width: '100%' }} onClick={() => { handleDownloadCOCO(); setShowMobileMenu(false); }}>EXPORT COCO (.JSON)</button>
                    <button className="btn btn-success" style={{ width: '100%' }} onClick={() => { handleDownloadVOC(); setShowMobileMenu(false); }}>EXPORT VOC (.XML)</button>
                 </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

export default App;
