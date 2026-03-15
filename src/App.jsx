import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Square, Hexagon, MousePointer2, Trash2, Download, Upload, 
  Settings, HelpCircle, ChevronLeft, ChevronRight, 
  Eye, EyeOff, Plus, Play, Pause, Sun, Contrast, 
  Dna, Layers, Zap, Info, X, Save, Camera, FileJson, Crosshair, Archive, Image, XCircle, BarChart3
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
  const [hiddenClasses, setHiddenClasses] = useState(new Set());
  const [isSyncing, setIsSyncing] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // 'all', 'annotated', 'pending'
  const [history, setHistory] = useState({ past: [], present: {}, future: [] });
  const canvasRef = useRef(null);

  useEffect(() => {
    if (Object.keys(annotations).length > 0 && history.past.length === 0 && Object.keys(history.present).length === 0) {
      setHistory(prev => ({ ...prev, present: annotations }));
    }
  }, [annotations]);

  useEffect(() => {
    localStorage.setItem('omni_images', JSON.stringify(images));
    localStorage.setItem('omni_annotations', JSON.stringify(annotations));
    localStorage.setItem('omni_classes', JSON.stringify(classes));
    setIsSyncing(true);
    const timeout = setTimeout(() => setIsSyncing(false), 800);
    return () => clearTimeout(timeout);
  }, [images, annotations, classes]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT') return;
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
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key) - 1;
        if (idx < classes.length) { setCurrentClass(idx); setAnnoMode('box'); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showHUD, showHelp, history, selectedAnnIds, currentIndex, annotations, classes, annoMode, flash]);

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
    if (window.confirm('Wipe entire workspace? This total reset cannot be undone.')) {
      setImages([]); setAnnotations({}); setHistory({ past: [], present: {}, future: [] });
      setCurrentIndex(0); setSelectedAnnIds(new Set());
      localStorage.clear(); window.location.reload();
    }
  };

  const handleSnapshot = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.getSnapshot();
    if (!url) return;
    const link = document.createElement('a'); link.href = url;
    link.download = `OmniAnnotate_Snapshot_${currentIndex + 1}.png`; link.click();
  };

  const handleUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({ name: file.name, url: URL.createObjectURL(file), file: file }));
    setImages(prev => [...prev, ...newImages]);
  };

  const handleDownloadFullProject = async () => {
    const zip = new JSZip(); const imgFolder = zip.folder("images"); const labelFolder = zip.folder("labels");
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      try { const response = await fetch(img.url); const blob = await response.blob(); imgFolder.file(img.name, blob); } catch (e) {}
      const yoloLines = (annotations[i] || []).filter(a => a.type === 'box').map(ann => {
        const { x, y, w, h } = ann.coords;
        return `${ann.class} ${((x + w / 2) / 1000).toFixed(6)} ${((y + h / 2) / 1000).toFixed(6)} ${(w / 1000).toFixed(6)} ${(h / 1000).toFixed(6)}`;
      });
      labelFolder.file(img.name.replace(/\.[^/.]+$/, "") + ".txt", yoloLines.join('\n'));
    }
    zip.file("classes.txt", classes.join('\n'));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a'); link.href = URL.createObjectURL(content);
    link.download = `OmniProject_${new Date().toISOString().split('T')[0]}.zip`; link.click();
  };

  const handleUnifiedBatchImport = async (e) => {
    const files = Array.from(e.target.files);
    const imgFiles = files.filter(f => f.type.startsWith('image/'));
    const labelFiles = files.filter(f => f.name.endsWith('.txt') && f.name !== 'classes.txt');
    const classesFile = files.find(f => f.name === 'classes.txt');

    if (classesFile) { const text = await classesFile.text(); setClasses(text.split('\n').filter(l => l.trim())); }

    const loadedImages = await Promise.all(imgFiles.map(file => new Promise(resolve => {
      const reader = new FileReader(); reader.onload = (ev) => resolve({ name: file.name, url: ev.target.result }); reader.readAsDataURL(file);
    })));
    const allImages = [...images, ...loadedImages]; setImages(allImages);

    const newAnnotations = { ...annotations };
    for (const file of labelFiles) {
      const imgIdx = allImages.findIndex(img => img.name.replace(/\.[^/.]+$/, "") === file.name.replace('.txt', ''));
      if (imgIdx !== -1) {
        const text = await file.text();
        const imgAnns = text.split('\n').filter(l => l.trim()).map(line => {
          const [cls, xc, yc, w, h] = line.split(/\s+/).map(Number);
          return { id: Math.random(), type: 'box', class: cls, coords: { x: (xc - w/2) * 1000, y: (yc - h/2) * 1000, w: w * 1000, h: h * 1000 } };
        });
        newAnnotations[imgIdx] = [...(newAnnotations[imgIdx] || []), ...imgAnns];
      }
    }
    setAnnotations(newAnnotations); setShowImportHub(false);
  };

  const handleDownloadVOC = async () => {
    const zip = new JSZip(); const vocFolder = zip.folder("pascal_voc_labels");
    images.forEach((img, idx) => {
      const imgAnns = annotations[idx] || []; if (imgAnns.length === 0) return;
      let xml = `<?xml version="1.0"?><annotation><folder>images</folder><filename>${img.name}</filename><size><width>1000</width><height>1000</height><depth>3</depth></size>`;
      imgAnns.forEach(ann => {
        if (ann.type === 'box') {
          const { x, y, w, h } = ann.coords;
          xml += `<object><name>${classes[ann.class] || 'unknown'}</name><bndbox><xmin>${Math.round(x)}</xmin><ymin>${Math.round(y)}</ymin><xmax>${Math.round(x + w)}</xmax><ymax>${Math.round(y + h)}</ymax></bndbox></object>`;
        }
      });
      xml += `</annotation>`;
      vocFolder.file(`${img.name.replace(/\.[^/.]+$/, "")}.xml`, xml);
    });
    zip.file("classes.txt", classes.join('\n'));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a'); link.href = URL.createObjectURL(content);
    link.download = `VOC_Export_${new Date().toISOString().split('T')[0]}.zip`; link.click();
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
        <header className="app-header glass-panel">
          <div className="brand"><Crosshair size={24} color="var(--accent-color)" /> <span>OmniAnnotate Master</span></div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={() => setShowImportHub(true)}><Upload size={16} /> Import</button>
            <div className="btn-group">
              <button className="btn btn-success" onClick={handleDownloadFullProject} title="Zip Archive">Archive</button>
              <button className="btn btn-success" onClick={handleDownloadVOC} title="Pascal VOC XML">VOC</button>
            </div>
            <button className="btn btn-danger" onClick={handleClearWorkspace}><Trash2 size={16} /></button>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(0,0,0,0.03)', padding: '4px 12px', borderRadius: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', opacity: 0.6 }}>JUMP TO:</span>
            <input 
              type="number" 
              min="1" max={images.length} 
              value={currentIndex + 1}
              onChange={(e) => {
                const val = parseInt(e.target.value) - 1;
                if (val >= 0 && val < images.length) setCurrentIndex(val);
              }}
              style={{ width: '50px', border: 'none', background: 'transparent', fontWeight: '800', color: 'var(--accent-color)', textAlign: 'center' }}
            />
            <span style={{ fontSize: '11px', fontWeight: '800', opacity: 0.6 }}>/ {images.length}</span>
          </div>
        </header>

        <main className="main-content">
          <aside className="sidebar glass-panel">
             <div className="sidebar-section">
                <h3 className="section-title">Workflow Tools</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  <button className="btn" onClick={handleCopyToNext} disabled={currentIndex === images.length - 1}>
                    <Plus size={14} /> COPY TO NEXT (N)
                  </button>
                  <button className="btn" onClick={handleDuplicateSelected} disabled={selectedAnnIds.size === 0}>
                    <Layers size={14} /> DUPLICATE (Ctrl+D)
                  </button>
                </div>
             </div>

             <div className="sidebar-section">
                <h3 className="section-title">Annotation Tools</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button className={`btn ${annoMode === 'box' ? 'btn-primary' : ''}`} onClick={() => setAnnoMode('box')}><Square size={16} /> BOX</button>
                  <button className={`btn ${annoMode === 'poly' ? 'btn-primary' : ''}`} onClick={() => setAnnoMode('poly')}><Hexagon size={16} /> POLY</button>
                  <button className={`btn ${annoMode === 'select' ? 'btn-primary' : ''}`} style={{ gridColumn: 'span 2' }} onClick={() => setAnnoMode('select')}><MousePointer2 size={16} /> SELECT (V)</button>
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
                <h3 className="section-title">Image Engine</h3>
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
            <div className="floating-toolbar glass-panel">
              <div className={`tool-btn ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')} title="Show All">ALL</div>
              <div className={`tool-btn ${filterMode === 'annotated' ? 'active' : ''}`} onClick={() => setFilterMode('annotated')} title="Annotated">DONE</div>
              <div className={`tool-btn ${filterMode === 'pending' ? 'active' : ''}`} onClick={() => setFilterMode('pending')} title="Pending">TODO</div>
              <div style={{ width: '20px', height: '1px', background: 'var(--border-color)', margin: '4px auto' }} />
              <button className="tool-btn" onClick={handleSnapshot} title="Snapshot (S)"><Camera size={20} /></button>
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
              <div style={{ textAlign: 'center' }}>
                <Dna size={64} color="var(--accent-color)" style={{ marginBottom: 24 }} />
                <h2 style={{ letterSpacing: 4, fontWeight: 900 }}>READY FOR INITIALIZATION</h2>
                <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setShowImportHub(true)}>START IMPORT</button>
              </div>
            )}
          </section>

          <aside className="right-sidebar glass-panel">
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 'bold' }}>CLASSES</span>
              <button className="btn" style={{ padding: '4px 8px' }} onClick={() => { const n = prompt('Class:'); if(n) setClasses([...classes, n]); }}><Plus size={14} /></button>
            </header>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {classes.map((cls, idx) => (
                <div key={idx} className={`label-item ${currentClass === idx ? 'active' : ''}`} onClick={() => setCurrentClass(idx)}>
                  <div style={{ width: 12, height: 12, background: `hsl(${idx * 137.5}, 70%, 50%)`, borderRadius: 2 }} />
                  <input 
                    className="class-input"
                    value={cls} 
                    onChange={(e) => {
                      const nc = [...classes]; nc[idx] = e.target.value; setClasses(nc);
                    }}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '13px', fontWeight: 600, color: 'inherit' }}
                  />
                  <button className="btn-icon-tiny" onClick={(e) => { e.stopPropagation(); setClasses(classes.filter((_, i) => i !== idx)); }}><X size={12} /></button>
                </div>
              ))}
            </div>
          </aside>
        </main>

        <footer className="footer glass-panel">
          <button className="btn" onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}><ChevronLeft /></button>
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
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ 
                    position: 'absolute', top: 4, right: 4, width: 8, height: 8, 
                    borderRadius: '50%', background: hasAnns ? 'var(--success-color)' : 'rgba(0,0,0,0.2)',
                    border: '1px solid white'
                  }} />
                </div>
              );
            })}
          </div>
          <button className="btn" onClick={() => setCurrentIndex(Math.min(images.length - 1, currentIndex + 1))}><ChevronRight /></button>
        </footer>

        <AnimatePresence>
          {showImportHub && (
            <div className="modal-overlay" onClick={() => setShowImportHub(false)}>
              <motion.div className="import-hub glass-panel" initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}>
                <h2 style={{ marginBottom: 32, fontWeight: 900 }}>IMPORT HUB</h2>
                <div className="import-grid">
                  <label className="import-card" style={{ gridColumn: 'span 3', border: '2px solid var(--accent-color)', background: 'rgba(59,130,246,0.05)' }}>
                    <Layers size={48} color="var(--accent-color)" />
                    <h3>BATCH IMPORT (YOLO)</h3>
                    <input type="file" multiple hidden onChange={handleUnifiedBatchImport} />
                  </label>
                  <label className="import-card">
                    <Image size={32} />
                    <h3>Images</h3>
                    <input type="file" multiple accept="image/*" hidden onChange={handleUpload} />
                  </label>
                  <label className="import-card" onClick={() => setShowImportHub(false)}><XCircle size={32} /> <h3>Close</h3></label>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}

export default App;
