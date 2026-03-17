import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useProject } from '../../context/ProjectContext';
import { 
  Grid, Zap, FolderPlus, FileSymlink, Layers, Settings, HelpCircle, 
  ChevronLeft, ChevronRight, Maximize2, X, Command, Hash, Activity,
  Menu, PanelLeft, PanelRight, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Shell v3 - Studio Precision Edition
 * Professional high-density layout with resizable sidebars and mercury-glass styling.
 */
const Shell = ({ children, sidebars = {} }) => {
  const { saveStatus, images, currentIndex, clearProject } = useProject();
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(340);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const startResizeLeft = useCallback((e) => {
    setIsResizingLeft(true);
    e.preventDefault();
  }, []);

  const startResizeRight = useCallback((e) => {
    setIsResizingRight(true);
    e.preventDefault();
  }, []);

  const stopResize = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  const resize = useCallback((e) => {
    if (isResizingLeft) {
      setLeftWidth(Math.max(200, Math.min(450, e.clientX)));
    }
    if (isResizingRight) {
      setRightWidth(Math.max(200, Math.min(500, window.innerWidth - e.clientX)));
    }
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResize);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResize);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResize);
    };
  }, [isResizingLeft, isResizingRight, resize, stopResize]);

  const handlePurge = () => {
    if (window.confirm("Are you sure you want to clear all project data? This cannot be undone.")) {
      clearProject();
    }
  };

  return (
    <div className="app-shell" style={{
      gridTemplateColumns: `${leftWidth}px 1fr ${rightWidth}px`,
    }}>
      {/* --- Studio Header --- */}
      <header className="glass-panel flex-between" style={{ 
        gridArea: 'header', 
        padding: '0 20px', 
        borderBottom: '1px solid var(--border-color)',
        zIndex: 100,
        background: 'var(--header-bg)',
      }}>
        <div className="flex-center" style={{ gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <img src="/assets/logo.png" className="logo-icon" alt="Studio Logo" />
             <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h1 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px', lineHeight: 1 }}>
                  OmniAnnotate
                  <span className="badge-status" style={{ fontSize: '9px', padding: '1px 4px' }}>STUDIO</span>
                </h1>
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 500 }}>ALPHABUILD_V4.2.0</span>
             </div>
          </div>

          <div style={{ width: '1px', height: '20px', background: 'var(--border-color)', margin: '0 8px' }} />
          
          <div className="flex-center" style={{ gap: '8px', fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>
             <div style={{ 
               width: '6px', height: '6px', borderRadius: '50%', 
               background: saveStatus === 'syncing' ? 'var(--warning)' : 'var(--success)' 
             }} />
             {saveStatus === 'syncing' ? 'Vault Syncing...' : 'Stable'}
          </div>
        </div>

        <div className="flex-center" style={{ gap: '12px' }}>
          {sidebars.headerActions}
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)' }} />
          <button className="btn-icon" title="Clear All Data" onClick={handlePurge}><X size={18} /></button>
          <button className="btn-icon"><Settings size={18} /></button>
        </div>
      </header>

      {/* --- Left Resizable Sidebar --- */}
      <aside className="glass-panel" style={{ 
        gridArea: 'sidebar', 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border-color)',
        position: 'relative'
      }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {sidebars.leftContent}
        </div>
        <div 
          className={`resize-handle right ${isResizingLeft ? 'active' : ''}`} 
          onMouseDown={startResizeLeft} 
          style={{ right: 0 }}
        />
      </aside>

      {/* --- Main Workspace Area --- */}
      <main style={{ 
        gridArea: 'canvas', 
        position: 'relative', 
        overflow: 'hidden', 
        background: '#f1f5f9',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {children}
        </div>
      </main>

      {/* --- Right Resizable Sidebar --- */}
      <aside className="glass-panel" style={{ 
        gridArea: 'right-sidebar', 
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--sidebar-bg)',
        borderLeft: '1px solid var(--border-color)',
        position: 'relative'
      }}>
        <div 
          className={`resize-handle left ${isResizingRight ? 'active' : ''}`} 
          onMouseDown={startResizeRight} 
          style={{ left: 0 }}
        />
        <div style={{ padding: '16px', height: '100%', overflowY: 'auto' }}>
           {sidebars.rightContent}
        </div>
      </aside>

      {/* --- Studio Footer --- */}
      <footer className="glass-panel flex-between" style={{ 
        gridArea: 'footer', 
        padding: '0 20px',
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--text-dim)',
        borderTop: '1px solid var(--border-color)',
        background: 'var(--header-bg)',
      }}>
        <div className="flex-center" style={{ gap: '24px' }}>
           <div className="flex-center" style={{ gap: '6px' }}>
              <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{images.length}</span> Assets
           </div>
           <div className="flex-center" style={{ gap: '6px' }}>
              Index: <span style={{ color: 'var(--text-secondary)', fontWeight: 700 }}>{currentIndex}</span>
           </div>
        </div>
        <div className="flex-center" style={{ gap: '12px' }}>
           <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Mercury Engine Stable</span>
           <div style={{ width: '1px', height: '12px', background: 'var(--border-color)' }} />
           <Zap size={12} color="var(--text-dim)" />
        </div>
      </footer>
    </div>
  );
};

export default Shell;
