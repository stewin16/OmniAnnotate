import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FolderPlus, Upload, FileText, CheckCircle2, AlertCircle, 
  BarChart3, Loader2, X, ChevronRight, Activity, FileSymlink
} from 'lucide-react';
import { useProject } from '../../context/ProjectContext';

const IngestionHub = ({ isOpen, onClose }) => {
  const { commitBatch } = useProject();
  const [stage, setStage] = useState('entry'); // entry, scanning, reconcile, finalizing
  const [files, setFiles] = useState([]);
  const [stats, setStats] = useState({ images: 0, annotations: 0, classes: new Set() });
  const [scanProgress, setScanProgress] = useState(0);
  const dirInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // --- Scan Orchestration ---
  const handleFileSelection = async (e, mode = 'dir') => {
    const selectedFiles = Array.from(e.target.files);
    if (selectedFiles.length === 0) return;
    
    setStage('scanning');
    setFiles(selectedFiles);
    
    // Artificial Scan Delay (Industrial feel)
    const steps = mode === 'dir' ? 10 : 3;
    for (let i = 0; i <= 100; i += (100/steps)) {
      setScanProgress(Math.min(100, Math.round(i)));
      await new Promise(r => setTimeout(r, mode === 'dir' ? 100 : 50));
    }

    // Process Files
    const imageFiles = selectedFiles.filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f.name));
    const labelFiles = selectedFiles.filter(f => /\.(txt|json|xml)$/i.test(f.name));
    const classFile = selectedFiles.find(f => f.name === 'classes.txt' || f.name === 'obj.names');
    
    let externalClassesCount = 0;
    if (classFile) {
      try {
        const text = await classFile.text();
        externalClassesCount = text.split('\n').filter(l => l.trim()).length;
      } catch (err) {}
    }

    setStats({
      images: imageFiles.length,
      annotations: labelFiles.length,
      classes: externalClassesCount || 0
    });

    setStage('reconcile');
  };

  const handleFinalize = async () => {
    setStage('finalizing');
    
    const imageFiles = files.filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f.name));
    const labelFiles = files.filter(f => /\.txt$/i.test(f.name));
    const classFile = files.find(f => f.name === 'classes.txt' || f.name === 'obj.names');
    
    let externalClasses = [];
    if (classFile) {
      try {
        const text = await classFile.text();
        externalClasses = text.split('\n').map(l => l.trim()).filter(l => l);
      } catch (err) {
        console.error("Class file parse failed:", err);
      }
    }

    // Process images and detect real dimensions + parse sync labels
    const newAssets = [];
    const newAnnotations = {};
    const seenIndices = new Set();
    
    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      const img = new Image();
      img.src = URL.createObjectURL(file);
      
      await new Promise((resolve) => {
        img.onload = async () => {
          const assetId = Math.random().toString(36).substr(2, 9);
          const width = img.naturalWidth;
          const height = img.naturalHeight;
          
          newAssets.push({
            id: assetId,
            name: file.name,
            url: img.src,
            file: file,
            width,
            height
          });

          // Check for matching YOLO signature
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const labelFile = labelFiles.find(f => f.name.replace(/\.[^/.]+$/, "") === baseName);
          
          if (labelFile) {
            try {
              const text = await labelFile.text();
              const anns = text.split('\n').map(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length < 5) return null;
                const clsIdx = parseInt(parts[0]);
                seenIndices.add(clsIdx);
                
                const cx = parseFloat(parts[1]) * width;
                const cy = parseFloat(parts[2]) * height;
                const w = parseFloat(parts[3]) * width;
                const h = parseFloat(parts[4]) * height;
                
                return {
                  id: Math.random().toString(36).substr(2, 9),
                  type: 'box',
                  class: clsIdx,
                  coords: { x: cx - w/2, y: cy - h/2, w, h }
                };
              }).filter(a => a);
              newAnnotations[i] = anns;
            } catch (err) {
              console.error("Signature parse failed:", err);
            }
          }
          resolve();
        };
        img.onerror = () => resolve();
      });
    }

    // Auto-update project classes
    let finalClasses = externalClasses;
    if (finalClasses.length === 0) {
      const maxIdx = Math.max(-1, ...Array.from(seenIndices));
      finalClasses = Array.from({ length: maxIdx + 1 }, (_, idx) => `Class_${idx}`);
    }
    if (finalClasses.length === 0) finalClasses = ['Object'];

    commitBatch(newAssets, newAnnotations, finalClasses);
    onClose();
    setStage('entry');
    setFiles([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex-center" style={{ 
      zIndex: 1000, 
      background: 'rgba(2, 6, 23, 0.8)',
      backdropFilter: 'blur(20px)'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="command-center"
        style={{ 
          width: '90%', 
          maxWidth: '900px', 
          height: '700px',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header - Studio Suite Dark */}
        <div className="suite-header flex-between">
          <div className="flex-center" style={{ gap: '20px' }}>
            <div style={{ 
              width: '48px', height: '48px', 
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', 
              borderRadius: '12px', 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <img src="/assets/logo.png" className="logo-icon" alt="Studio Logo" style={{ width: '32px', height: '32px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
               <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>Ingestion Suite</h2>
               <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                  <span className="badge-status" style={{ background: 'rgba(255,255,255,0.05)', color: '#94a3b8', border: '1px solid rgba(255,255,255,0.1)', fontSize: '9px' }}>STUDIO_CORE_V4.2</span>
                  <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--success)' }} />
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 600 }}>READY_FOR_SCAN</span>
               </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ color: '#94a3b8' }}><X size={24} /></button>
        </div>

        {/* Content - Deep Slate Gradient */}
        <div className="suite-content" style={{ flex: 1, overflowY: 'auto' }}>
          <AnimatePresence mode="wait">
            {stage === 'entry' && (
              <motion.div 
                key="entry"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div style={{ width: '100%', maxWidth: '600px', textAlign: 'center' }}>
                   <div style={{ 
                     display: 'inline-flex', padding: '24px', 
                     background: 'rgba(255,255,255,0.02)', 
                     borderRadius: '24px', marginBottom: '32px',
                     border: '1px solid rgba(255,255,255,0.05)',
                     boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                   }}>
                      <FolderPlus size={48} color="#fff" strokeWidth={1.5} />
                   </div>
                   <h3 style={{ fontSize: '28px', fontWeight: 800, color: '#fff', marginBottom: '12px', letterSpacing: '-0.03em' }}>Ingest Workspace Assets</h3>
                   <p style={{ color: '#94a3b8', fontSize: '15px', marginBottom: '40px', maxWidth: '440px', marginInline: 'auto', lineHeight: '1.6', fontWeight: 500 }}>
                     Connect your local data to the Studio Engine. Choose between a full directory scan or picking specific files.
                   </p>
                   
                   <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                     <button 
                       className="btn-suite-entry" 
                       onClick={() => dirInputRef.current?.click()}
                     >
                       <FolderPlus size={20} />
                       <div style={{ textAlign: 'left' }}>
                         <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#fff' }}>Initialize Scan</span>
                         <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Full Directory Recursion</span>
                       </div>
                     </button>
                     
                     <button 
                       className="btn-suite-entry" 
                       onClick={() => fileInputRef.current?.click()}
                     >
                       <FileSymlink size={20} />
                       <div style={{ textAlign: 'left' }}>
                         <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: '#fff' }}>Direct Select</span>
                         <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Choose Individual Media</span>
                       </div>
                     </button>
                   </div>

                   <input 
                     type="file" 
                     ref={dirInputRef} 
                     webkitdirectory="true" 
                     directory="" 
                     multiple 
                     hidden 
                     onChange={(e) => handleFileSelection(e, 'dir')} 
                   />
                   <input 
                     type="file" 
                     ref={fileInputRef} 
                     multiple 
                     hidden 
                     onChange={(e) => handleFileSelection(e, 'file')} 
                   />
                </div>
              </motion.div>
            )}

            {stage === 'scanning' && (
               <motion.div key="scanning" style={{ textAlign: 'center', padding: '100px 40px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <div className="flex-center">
                    <div style={{ position: 'relative' }}>
                       <Activity size={80} color="var(--success)" className="animate-pulse" strokeWidth={1} style={{ opacity: 0.8 }} />
                       <div style={{ position: 'absolute', inset: -20, border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '50%', animation: 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
                    </div>
                  </div>
                  <h3 style={{ marginTop: '48px', color: '#fff', fontSize: '14px', letterSpacing: '4px', fontWeight: 800 }}>ANALYZING_FILESYSTEM...</h3>
                  <div style={{ width: '100%', maxWidth: '400px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', margin: '32px auto', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <motion.div style={{ height: '100%', width: `${scanProgress}%`, background: 'var(--success)', boxShadow: '0 0 20px var(--success)' }} />
                  </div>
                  <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 700 }}>{scanProgress}% COMPLETE</span>
               </motion.div>
            )}

            {stage === 'reconcile' && (
              <motion.div key="reconcile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', marginBottom: '32px' }}>
                  <StatCardDark icon={<ImageIcon size={24} />} label="ASSETS_LOCATED" value={stats.images} />
                  <StatCardDark icon={<FileText size={24} />} label="SIGNATURE_MAPS" value={stats.annotations} />
                  <StatCardDark icon={<BarChart3 size={24} />} label="DETECTED_CLASSES" value={stats.classes} />
                </div>

                <div style={{ flex: 1, overflowY: 'auto', marginBottom: '32px' }}>
                   <div style={{ padding: '24px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <h4 style={{ color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '1px', marginBottom: '20px', opacity: 0.6 }}>PREVIEW_SPOOL</h4>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '12px' }}>
                         {files.filter(f => /\.(jpe?g|png|webp|bmp)$/i.test(f.name)).slice(0, 10).map((file, idx) => (
                            <div key={idx} style={{ aspectRatio: '1/1', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                               <img 
                                 src={URL.createObjectURL(file)} 
                                 alt="preview" 
                                 style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} 
                               />
                            </div>
                         ))}
                         {stats.images > 10 && (
                            <div style={{ aspectRatio: '1/1', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
                               +{stats.images - 10}
                            </div>
                         )}
                      </div>
                   </div>
                </div>
                
                <div style={{ 
                  padding: '32px', 
                  background: 'rgba(255, 255, 255, 0.02)', 
                  borderRadius: '24px', 
                  border: '1px solid rgba(255, 255, 255, 0.05)'
                }}>
                   <div className="flex-between">
                     <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <CheckCircle2 color="var(--success)" size={24} />
                        </div>
                        <div>
                          <h4 style={{ color: '#fff', fontSize: '16px' }}>Reconciliation Successful</h4>
                          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>Engine has verified <b>{stats.images}</b> assets for parallel processing.</p>
                        </div>
                     </div>
                     <button className="btn btn-primary" onClick={handleFinalize} style={{ padding: '14px 32px', borderRadius: '12px', background: 'var(--success)', borderColor: 'var(--success)' }}>Initialize Engine</button>
                   </div>
                </div>
              </motion.div>
            )}

            {stage === 'finalizing' && (
               <div style={{ textAlign: 'center', padding: '100px 40px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                 <Loader2 size={64} className="animate-spin" color="#fff" strokeWidth={1} />
                 <h3 style={{ marginTop: '32px', color: '#fff', fontSize: '12px', letterSpacing: '2px' }}>COMMITING_TO_BUFFER...</h3>
               </div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

const StatCardDark = ({ icon, label, value }) => (
  <div className="stat-card-dark">
    <div style={{ color: '#fff', marginBottom: '16px', opacity: 0.6 }}>{icon}</div>
    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '1px', marginBottom: '4px' }}>{label}</div>
    <div style={{ fontSize: '32px', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>{value}</div>
  </div>
);

const ImageIcon = ({ size }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>;

export default IngestionHub;
