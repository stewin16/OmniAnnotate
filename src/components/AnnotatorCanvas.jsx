import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const AnnotatorCanvas = forwardRef((props, ref) => {
  const { 
    image, 
    annotations = [], 
    onAddAnnotation, 
    mode, 
    currentClass, 
    classes = [],
    hiddenClasses = new Set(),
    filters,
    onUpdateAnnotations,
    selectedIds = new Set(),
    onSelectIds
  } = props;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const modificationRef = useRef(null);
  const dragStateRef = useRef({ isDragging: false });
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Transform State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Drawing State
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [polyPoints, setPolyPoints] = useState([]);
  const [flash, setFlash] = useState(0); 
  const [rubberBand, setRubberBand] = useState(null);

  // High-Frequency Image State
  const [imgObj, setImgObj] = useState(null);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => canvasRef.current?.toDataURL('image/png'),
    resetView: () => {
      if (!imgObj) return;
      const container = containerRef.current;
      const fitScale = Math.min(container.clientWidth / imgObj.width, container.clientHeight / imgObj.height) * 0.9;
      setTransform({
        x: (container.clientWidth - imgObj.width * fitScale) / 2,
        y: (container.clientHeight - imgObj.height * fitScale) / 2,
        scale: fitScale
      });
    }
  }));

  // Utility Functions
  const dist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);
  const getBoxHandles = (c) => [
    { x: c.x, y: c.y }, { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h }, { x: c.x, y: c.y + c.h }
  ];

  const toImageCoords = useCallback((canvasX, canvasY) => ({
    x: (canvasX - transform.x) / transform.scale,
    y: (canvasY - transform.y) / transform.scale
  }), [transform.x, transform.y, transform.scale]);

  const isPointInAnn = (p, ann) => {
    if (ann.type === 'box') {
      const { x, y, w, h } = ann.coords;
      const minX = Math.min(x, x + w), maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h), maxY = Math.max(y, y + h);
      return p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    }
    if (ann.type === 'poly') {
      let isInside = false;
      for (let i = 0, j = ann.points.length - 1; i < ann.points.length; j = i++) {
        const xi = ann.points[i].x, yi = ann.points[i].y;
        const xj = ann.points[j].x, yj = ann.points[j].y;
        const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) isInside = !isInside;
      }
      return isInside;
    }
    return false;
  };

  const applyModification = (ann, mod) => {
    if (mod.type === 'move') {
      const dx = (mod.currentImgX ?? mod.startImgX) - mod.startImgX;
      const dy = (mod.currentImgY ?? mod.startImgY) - mod.startImgY;
      if (ann.type === 'box') {
        const start = mod.startStates[ann.id];
        return { ...ann, coords: { ...start, x: start.x + dx, y: start.y + dy } };
      } else {
        const start = mod.startStates[ann.id];
        return { ...ann, points: start.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      }
    }
    if (mod.type === 'resize') {
      const x = mod.currentImgX ?? mod.startImgX, y = mod.currentImgY ?? mod.startImgY;
      const nc = { ...mod.startCoords }, start = mod.startCoords;
      if (mod.handleIdx === 0) { nc.x = x; nc.y = y; nc.w = start.x + start.w - x; nc.h = start.y + start.h - y; }
      else if (mod.handleIdx === 1) { nc.y = y; nc.w = x - start.x; nc.h = start.y + start.h - y; }
      else if (mod.handleIdx === 2) { nc.w = x - start.x; nc.h = y - start.y; }
      else if (mod.handleIdx === 3) { nc.x = x; nc.w = start.x + start.w - x; nc.h = y - start.y; }
      return { ...ann, coords: nc };
    }
    return ann;
  };

  // Lifecycle: Load Media
  useEffect(() => {
    if (!image?.url) { setImgObj(null); return; }
    const img = new Image();
    img.src = image.url;
    img.onload = () => {
      setImgObj(img);
      const container = containerRef.current;
      if (container) {
        const fitScale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height) * 0.9;
        setTransform({
          x: (container.clientWidth - img.width * fitScale) / 2,
          y: (container.clientHeight - img.height * fitScale) / 2,
          scale: fitScale
        });
      }
    };
  }, [image]);

  // Shared Render State Ref (Game Engine Pattern)
  const renderStateRef = useRef({
    imgObj: null,
    transform: { x: 0, y: 0, scale: 1 },
    annotations: [],
    filters: null,
    isDrawing: false,
    drawStart: null,
    mode: 'box',
    polyPoints: [],
    selectedIds: new Set(),
    hiddenClasses: new Set(),
    classes: [],
    rubberBand: null,
    mousePos: { x: 0, y: 0 }
  });

  // Synchronize Ref with React State
  useEffect(() => {
    renderStateRef.current = {
      imgObj, transform, annotations, filters, isDrawing, drawStart, 
      mode, polyPoints, selectedIds, hiddenClasses, classes, rubberBand,
      mousePos: mousePosRef.current
    };
  }, [imgObj, transform, annotations, filters, isDrawing, drawStart, mode, polyPoints, selectedIds, hiddenClasses, classes, rubberBand]);

  // Lifecycle: Sync Canvas Dimensions
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    
    const observer = new ResizeObserver(entries => {
      if (!entries[0]) return;
      const { width, height } = entries[0].contentRect;
      canvas.width = width;
      canvas.height = height;
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Persistent Rendering Pipeline (Zero-Blink)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    const render = () => {
      const state = renderStateRef.current;
      
      if (!canvas.width || !canvas.height || !state.imgObj) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        animationId = requestAnimationFrame(render);
        return;
      }
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.translate(state.transform.x, state.transform.y);
      ctx.scale(state.transform.scale, state.transform.scale);
      
      // Image Tier
      ctx.filter = `brightness(${state.filters?.brightness || 100}%) contrast(${state.filters?.contrast || 100}%)`;
      ctx.drawImage(state.imgObj, 0, 0);
      ctx.filter = 'none';

      // Annotation Tier
      state.annotations.filter(a => !state.hiddenClasses.has(a.class)).forEach(ann => {
        let displayAnn = ann;
        if (modificationRef.current) {
          const mod = modificationRef.current;
          const isTarget = mod.type === 'move' ? mod.ids.has(String(ann.id)) : String(mod.id) === String(ann.id);
          if (isTarget) displayAnn = applyModification(ann, mod);
        }

        const isSelected = state.selectedIds.has(String(ann.id));
        const baseHue = (ann.class ?? 0) * 137.5 % 360;
        let color = isSelected ? '#15803d' : `hsl(${baseHue}, 70%, 45%)`;
        const adaptiveWidth = (isSelected ? 2 : 1) / state.transform.scale;

        if (displayAnn.type === 'box') {
          const { x, y, w, h } = displayAnn.coords;
          
          ctx.strokeStyle = 'rgba(0,0,0,0.15)';
          ctx.lineWidth = adaptiveWidth + (1 / state.transform.scale);
          ctx.strokeRect(x, y + (1/state.transform.scale), w, h);

          ctx.strokeStyle = color;
          ctx.lineWidth = adaptiveWidth;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = isSelected ? 'rgba(21, 128, 61, 0.05)' : 'rgba(0,0,0,0.03)';
          ctx.fillRect(x, y, w, h);

          // Tactile Label
          const label = state.classes[displayAnn.class]?.toUpperCase() || `OBJ_${displayAnn.class ?? 0}`;
          ctx.font = `bold ${11 / state.transform.scale}px var(--font-sans)`;
          const tw = ctx.measureText(label).width;
          const th = 18 / state.transform.scale;
          
          ctx.fillStyle = color;
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(x, y - th, tw + 12 / state.transform.scale, th, [4 / state.transform.scale, 4 / state.transform.scale, 0, 0]);
          else ctx.rect(x, y - th, tw + 12 / state.transform.scale, th);
          ctx.fill();

          ctx.fillStyle = '#fff';
          ctx.fillText(label, x + 6 / state.transform.scale, y - 5 / state.transform.scale);

          if (isSelected) {
            ctx.fillStyle = '#15803d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1/state.transform.scale;
            getBoxHandles(displayAnn.coords).forEach(hp => {
              ctx.beginPath(); ctx.arc(hp.x, hp.y, 4/state.transform.scale, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            });
          }
        } else if (displayAnn.type === 'poly') {
          ctx.strokeStyle = color; ctx.lineWidth = adaptiveWidth;
          ctx.beginPath();
          displayAnn.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = isSelected ? 'rgba(21, 128, 61, 0.05)' : 'rgba(0,0,0,0.03)';
          ctx.fill();
        }
      });

      // UI Helpers
      const getImg = (cx, cy) => ({
         x: (cx - state.transform.x) / state.transform.scale,
         y: (cy - state.transform.y) / state.transform.scale
      });

      if (state.isDrawing && state.mode === 'box' && state.drawStart) {
        const s = getImg(state.drawStart.x, state.drawStart.y), e = getImg(state.mousePos.x, state.mousePos.y);
        ctx.strokeStyle = '#15803d'; ctx.setLineDash([5/state.transform.scale]); ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y); ctx.setLineDash([]);
      }
      
      if (state.mode === 'poly' && state.polyPoints.length > 0) {
        ctx.strokeStyle = '#15803d'; ctx.lineWidth = 2/state.transform.scale; ctx.beginPath();
        state.polyPoints.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        const mc = getImg(state.mousePos.x, state.mousePos.y); ctx.lineTo(mc.x, mc.y); ctx.stroke();
      }

      if (state.rubberBand) {
        const s = getImg(state.rubberBand.startX, state.rubberBand.startY), e = getImg(state.rubberBand.endX, state.rubberBand.endY);
        ctx.strokeStyle = 'rgba(21, 128, 61, 0.3)'; ctx.setLineDash([5/state.transform.scale]); ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y); ctx.setLineDash([]);
      }

      ctx.restore();

      // Crosshair
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.1)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(state.mousePos.x, 0); ctx.lineTo(state.mousePos.x, canvas.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, state.mousePos.y); ctx.lineTo(canvas.width, state.mousePos.y); ctx.stroke();

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, []);

  // Event Handlers
  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = Math.pow(2, -e.deltaY * 0.002);
    setTransform(prev => {
      const s = Math.max(0.05, Math.min(20, prev.scale * factor));
      const f = s / prev.scale;
      return { scale: s, x: mx - (mx - prev.x) * f, y: my - (my - prev.y) * f };
    });
  };

  const handleMouseDown = (e) => {
    if (!imgObj) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const ic = toImageCoords(x, y);

    if (e.button === 1 || (e.button === 0 && (e.altKey || isSpaceDown))) {
      setIsPanning(true); setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    } else if (e.button === 0) {
      // 1. Check for resize handle hits on selected boxes first
      const invScale = 1 / transform.scale;
      let handleHit = null;
      
      for (const id of selectedIds) {
        const ann = annotations.find(a => String(a.id) === id);
        if (ann?.type === 'box') {
          const handles = getBoxHandles(ann.coords);
          const hIdx = handles.findIndex(hp => dist(ic, hp) < 8 * invScale);
          if (hIdx !== -1) {
            handleHit = { id, handleIdx: hIdx, startCoords: { ...ann.coords } };
            break;
          }
        }
      }

      if (handleHit) {
        modificationRef.current = { type: 'resize', ...handleHit, startImgX: ic.x, startImgY: ic.y };
        setIsDragging(true); dragStateRef.current.isDragging = true;
        return;
      }

      // 2. Normal hit detection
      const hit = annotations.find(a => isPointInAnn(ic, a));
      if (hit) {
        const id = String(hit.id);
        const next = new Set(e.shiftKey ? selectedIds : []);
        if (next.has(id)) next.delete(id); else next.add(id);
        onSelectIds(next);
        
        const startStates = {};
        next.forEach(sid => {
          const a = annotations.find(sa => String(sa.id) === sid);
          if (a) startStates[sid] = a.type === 'box' ? { ...a.coords } : [...a.points];
        });
        modificationRef.current = { type: 'move', ids: next, startStates, startImgX: ic.x, startImgY: ic.y };
        setIsDragging(true); dragStateRef.current.isDragging = true;
      } else {
        if (mode === 'box') { setIsDrawing(true); setDrawStart({ x, y }); }
        else if (mode === 'poly') setPolyPoints(p => [...p, ic]);
        else if (mode === 'select') { if (!e.shiftKey) onSelectIds(new Set()); setRubberBand({ startX: x, startY: y, endX: x, endY: y }); }
      }
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    mousePosRef.current = { x, y };
    const ic = toImageCoords(x, y);

    if (isPanning) setTransform(p => ({ ...p, x: e.clientX - startPan.x, y: e.clientY - startPan.y }));
    else if (rubberBand) setRubberBand(p => ({ ...p, endX: x, endY: y }));
    else if (dragStateRef.current.isDragging && modificationRef.current) {
      modificationRef.current.currentImgX = ic.x;
      modificationRef.current.currentImgY = ic.y;
    }
  };

  const handleMouseUp = (e) => {
    setIsPanning(false);
    if (rubberBand) {
      const s = toImageCoords(rubberBand.startX, rubberBand.startY), end = toImageCoords(rubberBand.endX, rubberBand.endY);
      const minX = Math.min(s.x, end.x), maxX = Math.max(s.x, end.x), minY = Math.min(s.y, end.y), maxY = Math.max(s.y, end.y);
      const next = new Set();
      annotations.forEach(a => {
        if (a.type === 'box') {
          const { x, y, w, h } = a.coords;
          if (x+w/2 >= minX && x+w/2 <= maxX && y+h/2 >= minY && y+h/2 <= maxY) next.add(String(a.id));
        }
      });
      if (next.size > 0) onSelectIds(next);
      setRubberBand(null);
    }
    if (dragStateRef.current.isDragging && modificationRef.current) {
      const mod = modificationRef.current;
      const final = annotations.map(a => {
        if (mod.type === 'move' ? mod.ids.has(String(a.id)) : String(a.id) === String(mod.id)) {
          const u = applyModification(a, mod);
          if (u.type === 'box') return { ...u, coords: { x: u.coords.w < 0 ? u.coords.x + u.coords.w : u.coords.x, y: u.coords.h < 0 ? u.coords.y + u.coords.h : u.coords.y, w: Math.abs(u.coords.w), h: Math.abs(u.coords.h) } };
          return u;
        }
        return a;
      });
      onUpdateAnnotations(final); modificationRef.current = null; dragStateRef.current.isDragging = false; setIsDragging(false);
    }
    if (isDrawing && drawStart && mode === 'box') {
      const rect = canvasRef.current.getBoundingClientRect();
      const s = toImageCoords(drawStart.x, drawStart.y), end = toImageCoords(e.clientX - rect.left, e.clientY - rect.top);
      const ann = { id: Math.random(), type: 'box', class: currentClass, coords: { x: Math.min(s.x, end.x), y: Math.min(s.y, end.y), w: Math.abs(end.x - s.x), h: Math.abs(end.y - s.y) } };
      if (ann.coords.w > 2) onAddAnnotation(ann);
      setIsDrawing(false); setDrawStart(null);
    }
  };

  useEffect(() => {
    const down = (e) => { if (e.code === 'Space') { setIsSpaceDown(true); if (e.target === document.body) e.preventDefault(); } if (e.key === 'Enter' && polyPoints.length > 2) { onAddAnnotation({ id: Math.random(), type: 'poly', class: currentClass, points: polyPoints }); setPolyPoints([]); } if (e.key === 'Escape') setPolyPoints([]); };
    const up = (e) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [polyPoints, currentClass, onAddAnnotation]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas ref={canvasRef} onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onContextMenu={e => e.preventDefault()} />
      
      {/* Telemetry HUD */}
      <div style={{
        position: 'absolute',
        top: '24px',
        left: '24px',
        padding: '16px 24px',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '16px',
        color: 'white',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: 'var(--shadow-xl)',
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '8px', marginBottom: '4px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 10px var(--success)' }} />
          <span style={{ fontWeight: 700, letterSpacing: '1px' }}>MERCURY_CORE_ACTIVE</span>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>MODE:</span> {mode.toUpperCase()}</div>
          <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>CLASS:</span> {currentClass}</div>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>X:</span> {Math.round(toImageCoords(mousePosRef.current.x, mousePosRef.current.y).x)}</div>
          <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>Y:</span> {Math.round(toImageCoords(mousePosRef.current.x, mousePosRef.current.y).y)}</div>
        </div>
        <div><span style={{ color: 'rgba(255,255,255,0.4)' }}>VIEWPORT_SCALE:</span> {(transform.scale * 100).toFixed(0)}%</div>
      </div>
    </div>
  );
});

export default AnnotatorCanvas;
