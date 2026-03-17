import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trash2, Download, Layers, Play, Plus, X, Search, Sun, Contrast, 
  Square, Hexagon, MousePointer2, Image as ImageIcon, Box, Activity, 
  HelpCircle, Settings, ChevronLeft, ChevronRight, Maximize2, FileSymlink, FolderPlus
} from 'lucide-react';

import JSZip from 'jszip';

// Core v2 Imports
import { useProject } from './context/ProjectContext';
import { DEFAULT_CLASSES } from './constants';
import { useHistory } from './hooks/useHistory';
import Shell from './components/layout/Shell';
import IngestionHub from './components/ingestion/IngestionHub';
import AnnotatorCanvas from './components/AnnotatorCanvas';

// Styles
import './App.css';

// Custom Error Boundary for V2
class ErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    render() {
      if (this.state.hasError) {
        return (
          <div style={{ padding: '40px', textAlign: 'center', background: '#0f172a', color: 'white', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Activity size={64} color="var(--accent-color)" className="animate-pulse" />
            <h2 style={{ marginTop: '24px', letterSpacing: '2px' }}>VIRTUAL_BUFFER_CRASH</h2>
            <p style={{ color: 'var(--text-dim)', maxWidth: '400px', marginTop: '12px', fontSize: '12px' }}>
              The Sovereign engine encountered a critical exception: {this.state.error?.message}
            </p>
            <button className="btn btn-primary" style={{ marginTop: '32px' }} onClick={() => window.location.reload()}>REBOOT_SYSTEM</button>
          </div>
        );
      }
      return this.props.children;
    }
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  // --- Global Project State ---
  const { 
    images, setImages, annotations, setAnnotations, classes, setClasses,
    currentIndex, setCurrentIndex, clearProject
  } = useProject();

  // --- Layout & UI State ---
  const [annoMode, setAnnoMode] = useState('box'); // 'box', 'poly', 'select'
  const [currentClass, setCurrentClass] = useState(0);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isPortalOpen, setIsPortalOpen] = useState(false);
  const [filters, setFilters] = useState({ brightness: 100, contrast: 100 });
  const [classSearch, setClassSearch] = useState('');
  const [editingClassIdx, setEditingClassIdx] = useState(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  
  const canvasRef = useRef(null);
  const { state: historyState, push: pushHistory, undo, redo, canUndo, canRedo } = useHistory(annotations);

  // --- Hotkey Orchestration ---
  useEffect(() => {
    const handleKey = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const key = e.key.toLowerCase();

      // Navigation
      if (key === 'arrowleft') setCurrentIndex(prev => Math.max(0, prev - 1));
      if (key === 'arrowright') setCurrentIndex(prev => Math.min(images.length - 1, prev + 1));

      // Tools
      if (key === 'b') setAnnoMode('box');
      if (key === 'p') setAnnoMode('poly');
      if (key === 'v') setAnnoMode('select');
      
      // Class Switching (1-9)
      if (/^[1-9]$/.test(key)) {
        const idx = parseInt(key) - 1;
        if (idx < classes.length) {
          setCurrentClass(idx);
          setAnnoMode('box');
        }
      }

      // History
      if (e.ctrlKey && key === 'z') undo();
      if (e.ctrlKey && key === 'y') redo();

      // Actions
      if (key === 'n') handleDuplicateToNext();
      if (key === 'delete' || key === 'backspace') handleDeleteSelected();
      if (key === '?') setIsHelpOpen(prev => !prev);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [images.length, classes.length, undo, redo]);

  // --- Annotation Actions ---
  const handleUpdateAnnotations = (newAnns) => {
    const next = { ...annotations, [currentIndex]: newAnns };
    setAnnotations(next);
    pushHistory(next);
  };

  const handleDuplicateToNext = () => {
    if (currentIndex >= images.length - 1) return;
    const cur = annotations[currentIndex] || [];
    if (cur.length === 0) return;
    
    const cloned = cur.map(a => ({ ...a, id: Math.random().toString(36).substr(2, 9) }));
    const next = [...(annotations[currentIndex + 1] || []), ...cloned];
    
    setAnnotations(prev => ({ ...prev, [currentIndex + 1]: next }));
    setCurrentIndex(currentIndex + 1);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    const cur = annotations[currentIndex] || [];
    const filtered = cur.filter(a => !selectedIds.has(String(a.id)));
    handleUpdateAnnotations(filtered);
    setSelectedIds(new Set());
  };

  const handleExportYOLO = async () => {
    if (images.length === 0) return;
    const zip = new JSZip();
    const dateStr = new Date().toISOString().split('T')[0];
    const exportName = `OmniAnnotate_Export_${dateStr}`;
    
    const imgFolder = zip.folder("images");
    const labelFolder = zip.folder("labels");

    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (img.file) {
            imgFolder.file(img.name, img.file);
        }
        
        const curAnns = annotations[i] || [];
        const yoloLines = curAnns.filter(a => a.type === 'box').map(ann => {
            const { x, y, w, h } = ann.coords;
            const xc = (x + w / 2) / img.width;
            const yc = (y + h / 2) / img.height;
            const nw = w / img.width;
            const nh = h / img.height;
            return `${ann.class} ${xc.toFixed(6)} ${yc.toFixed(6)} ${nw.toFixed(6)} ${nh.toFixed(6)}`;
        });
        labelFolder.file(img.name.replace(/\.[^/.]+$/, "") + ".txt", yoloLines.join('\n'));
    }
    
    zip.file("classes.txt", classes.join('\n'));
    const content = await zip.generateAsync({ type: "blob" });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `${exportName}.zip`;
    link.click();
  };

// --- Sidebar Renderers ---
  const renderSidebarLeft = () => (
    <div className="flex-col" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      <button className="btn btn-primary" style={{ width: '100%', padding: '10px' }} onClick={() => setIsPortalOpen(true)}>
        <Plus size={16} /> Ingest Assets
      </button>
      
      <div className="sidebar-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <h4 className="section-title">Asset Index</h4>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {images.map((img, i) => (
            <button 
              key={img.id || i}
              className={`btn ${currentIndex === i ? 'active' : ''}`}
              style={{ 
                justifyContent: 'flex-start', 
                fontSize: '12px', 
                padding: '8px 12px',
                border: '1px solid transparent',
                borderRadius: '8px',
                background: currentIndex === i ? 'var(--bg-color)' : 'transparent',
                color: currentIndex === i ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontWeight: currentIndex === i ? 600 : 400
              }}
              onClick={() => setCurrentIndex(i)}
            >
              <div style={{ 
                width: '6px', height: '6px', borderRadius: '50%', 
                background: currentIndex === i ? 'var(--text-primary)' : 'var(--border-color)', 
                marginRight: '12px' 
              }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{img.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const renderSidebarRight = () => (
    <div className="flex-col" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
       <div className="sidebar-section">
          <h4 className="section-title">Engine Controls</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button className={`btn ${annoMode === 'box' ? 'active' : ''}`} onClick={() => setAnnoMode('box')}><Square size={14} /> Bounding Box</button>
            <button className={`btn ${annoMode === 'poly' ? 'active' : ''}`} onClick={() => setAnnoMode('poly')}><Hexagon size={14} /> Polygon</button>
            <button className={`btn ${annoMode === 'select' ? 'active' : ''}`} style={{ gridColumn: 'span 2' }} onClick={() => setAnnoMode('select')}><MousePointer2 size={14} /> Select Mode</button>
          </div>
       </div>

       <div className="sidebar-section">
          <h4 className="section-title">Label Hierarchy</h4>
          <div style={{ position: 'relative', marginBottom: '12px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input 
              className="input-studio" 
              placeholder="Search classes..." 
              value={classSearch} 
              onChange={e => setClassSearch(e.target.value)} 
              style={{ paddingLeft: '32px' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '300px', overflowY: 'auto' }}>
              {classes.filter(c => c.toLowerCase().includes(classSearch.toLowerCase())).map((cls, i) => (
                <div 
                  key={cls + i}
                  className={`btn ${currentClass === i ? 'active' : ''}`}
                  style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between', 
                    fontSize: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: currentClass === i ? 'var(--bg-color)' : 'transparent',
                    color: currentClass === i ? 'var(--text-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    gap: '12px'
                  }}
                  onClick={() => setCurrentClass(i)}
                  onDoubleClick={() => setEditingClassIdx(i)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                    <div 
                      className="class-swatch" 
                      style={{ background: `hsl(${i * 137.5 % 360}, 70%, 45%)` }} 
                    />
                    {editingClassIdx === i ? (
                      <input 
                        className="input-studio"
                        autoFocus
                        style={{ height: '24px', padding: '0 4px', fontSize: '12px', width: '80%' }}
                        defaultValue={cls}
                        onBlur={(e) => {
                          const next = [...classes];
                          next[i] = e.target.value || cls;
                          setClasses(next);
                          setEditingClassIdx(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                        }}
                      />
                    ) : (
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cls}</span>
                    )}
                  </div>
                  <span style={{ opacity: 0.5, fontSize: '10px', fontWeight: 600 }}>
                    {Object.values(annotations).reduce((acc, curr) => acc + curr.filter(a => a.class === i).length, 0)}
                  </span>
                </div>
             ))}
          </div>
       </div>

       <div className="sidebar-section" style={{ borderBottom: 'none' }}>
          <h4 className="section-title">Signal Processing</h4>
          <div className="grid-stack" style={{ gap: '16px', display: 'flex', flexDirection: 'column' }}>
             <div>
                <div className="flex-between" style={{ fontSize: '11px', marginBottom: '8px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                   <span>Brightness Offset</span>
                   <span style={{ color: 'var(--text-primary)' }}>{filters.brightness}%</span>
                </div>
                <input type="range" min="50" max="200" value={filters.brightness} onChange={e => setFilters({...filters, brightness: e.target.value})} style={{ width: '100%', accentColor: 'var(--text-primary)' }} />
             </div>
             <div>
                <div className="flex-between" style={{ fontSize: '11px', marginBottom: '8px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                   <span>Contrast Ratio</span>
                   <span style={{ color: 'var(--text-primary)' }}>{filters.contrast}%</span>
                </div>
                <input type="range" min="50" max="200" value={filters.contrast} onChange={e => setFilters({...filters, contrast: e.target.value})} style={{ width: '100%', accentColor: 'var(--text-primary)' }} />
             </div>
          </div>
       </div>
    </div>
  );

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Shell sidebars={{
        leftContent: renderSidebarLeft(),
        rightContent: renderSidebarRight(),
        headerActions: (
          <div className="flex-center" style={{ gap: '8px' }}>
             <button className="btn" onClick={() => canvasRef.current?.resetView()} title="Reset Viewport">
                <Maximize2 size={14} /> Center View
             </button>
             <button className="btn" onClick={() => setIsHelpOpen(true)} title="Shortcut Legend">
                <HelpCircle size={14} />
             </button>
             <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 8px' }} />
             <button className="btn" disabled={!canUndo} onClick={undo} style={{ padding: '6px 12px' }}><ChevronLeft size={16} /> Undo</button>
             <button className="btn" disabled={!canRedo} onClick={redo} style={{ padding: '6px 12px' }}>Redo <ChevronRight size={16} /></button>
             <button className="btn btn-primary" onClick={handleExportYOLO} style={{ padding: '6px 16px' }}>
                <Download size={14} /> Export Dataset
             </button>
          </div>
        )
      }}>
        {/* --- Workspace Frame --- */}
        <div className="workspace-frame">
          <AnimatePresence mode="wait">
            {images.length > 0 ? (
              <motion.div 
                key={images[currentIndex]?.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ width: '100%', height: '100%' }}
              >
                <AnnotatorCanvas
                  ref={canvasRef}
                  image={images[currentIndex]}
                  annotations={annotations[currentIndex] || []}
                  onUpdateAnnotations={handleUpdateAnnotations}
                  mode={annoMode}
                  currentClass={currentClass}
                  selectedIds={selectedIds}
                  onSelectIds={setSelectedIds}
                  filters={filters}
                  onAddAnnotation={(ann) => {
                     const next = [...(annotations[currentIndex] || []), ann];
                     handleUpdateAnnotations(next);
                  }}
                />
              </motion.div>
            ) : (
              <div className="studio-empty-state">
                 <div style={{ 
                   width: '120px', height: '120px', 
                   background: '#fff', 
                   border: '1px solid var(--border-color)',
                   borderRadius: '32px', 
                   display: 'flex', alignItems: 'center', justifyContent: 'center', 
                   boxShadow: 'var(--shadow-lg)'
                 }}>
                    <img src="/assets/logo.png" className="logo-icon" style={{ width: '64px', height: '64px' }} alt="Studio Logo" />
                 </div>
                 <div style={{ textAlign: 'center' }}>
                    <h2 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Ready for Analysis</h2>
                    <p style={{ color: 'var(--text-dim)', marginTop: '12px', fontSize: '14px', fontWeight: 500, maxWidth: '400px' }}>
                      Initialize your workstation to begin the precision annotation workflow. 
                      Import your images or directory to start.
                    </p>
                 </div>
                 <button className="btn btn-primary" onClick={() => setIsPortalOpen(true)} style={{ padding: '14px 40px', fontSize: '15px', borderRadius: '12px' }}>
                    <FolderPlus size={18} /> Ingest Assets
                 </button>
              </div>
            )}
          </AnimatePresence>
        </div>

        {/* Overlays */}
        <IngestionHub isOpen={isPortalOpen} onClose={() => setIsPortalOpen(false)} />
        
        <AnimatePresence>
          {isHelpOpen && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'fixed', inset: 0, zIndex: 2000,
                background: 'rgba(15, 23, 42, 0.4)',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '40px'
              }}
              onClick={() => setIsHelpOpen(false)}
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                style={{
                  background: 'white', padding: '40px', borderRadius: '32px',
                  maxWidth: '500px', width: '100%', boxShadow: 'var(--shadow-xl)',
                  border: '1px solid var(--border-color)'
                }}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex-between" style={{ marginBottom: '32px' }}>
                  <h3 style={{ fontSize: '24px' }}>Studio Hotkeys</h3>
                  <button className="btn-icon" onClick={() => setIsHelpOpen(false)}><X size={20} /></button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                   {[
                     { k: 'B / P / V', d: 'Switch tool (Box, Poly, Select)' },
                     { k: '1-9', d: 'Fast class selection' },
                     { k: 'Arrows', d: 'Previous / Next asset' },
                     { k: 'Space (Hold)', d: 'Pan viewport' },
                     { k: 'Del / Backspace', d: 'Delete selection' },
                     { k: 'Ctrl + Z/Y', d: 'Undo / Redo action' },
                     { k: 'N', d: 'Duplicate boxes to next asset' },
                     { k: '?', d: 'Toggle this legend' }
                   ].map(h => (
                     <div key={h.k} style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '12px', borderBottom: '1px solid var(--border-color)' }}>
                        <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '13px', background: 'var(--bg-color)', padding: '2px 8px', borderRadius: '4px' }}>{h.k}</span>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{h.d}</span>
                     </div>
                   ))}
                </div>
                
                <button className="btn btn-primary" style={{ width: '100%', marginTop: '32px', padding: '12px' }} onClick={() => setIsHelpOpen(false)}>Dismiss</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </Shell>
    </div>
  );
}

export default App;
