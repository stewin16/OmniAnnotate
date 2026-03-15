import React, { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef } from 'react';

const AnnotatorCanvas = forwardRef((props, ref) => {
  const { 
    image, 
    annotations, 
    onAddAnnotation, 
    mode, 
    activeClass, 
    classes = [],
    hiddenClasses = new Set(),
    filters,
    onUpdateAnnotations,
    selectedIds = new Set(),
    onSelectIds
  } = props;
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    getSnapshot: () => {
      return canvasRef.current?.toDataURL('image/png');
    },
    nudgeSelected: (direction, step) => {
      if (selectedIds.size === 0) return;
      const updatedAnns = annotations.map(ann => {
        if (!selectedIds.has(String(ann.id)) || ann.type !== 'box') return ann;
        const nc = { ...ann.coords };
        if (direction === 'arrowup') nc.y -= step;
        if (direction === 'arrowdown') nc.y += step;
        if (direction === 'arrowleft') nc.x -= step;
        if (direction === 'arrowright') nc.x += step;
        return { ...ann, coords: nc };
      });
      onUpdateAnnotations(updatedAnns);
    },
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

  
  // Transform State
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  
  // Drawing State
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState(null);
  const [polyPoints, setPolyPoints] = useState([]);
  const [flash, setFlash] = useState(0); 
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [rubberBand, setRubberBand] = useState(null); // { startX, startY, endX, endY }

  // Helper functions - Correct Scope
  const getBoxHandles = (c) => [
    { x: c.x, y: c.y }, { x: c.x + c.w, y: c.y },
    { x: c.x + c.w, y: c.y + c.h }, { x: c.x, y: c.y + c.h }
  ];

  const dist = (p1, p2) => Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2);

  const isPointInAnn = (p, ann) => {
    if (ann.type === 'box') {
      const { x, y, w, h } = ann.coords;
      const minX = Math.min(x, x + w);
      const maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h);
      const maxY = Math.max(y, y + h);
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
    // If not part of the current modification session, return as is
    if (mod.type === 'move') {
      if (!mod.ids.has(String(ann.id))) return ann;
      const dx = (mod.currentImgX ?? mod.startImgX) - mod.startImgX;
      const dy = (mod.currentImgY ?? mod.startImgY) - mod.startImgY;
      
      if (ann.type === 'box') {
        const start = mod.startStates[ann.id];
        if (!start) return ann;
        return { ...ann, coords: { ...start, x: start.x + dx, y: start.y + dy } };
      }
      if (ann.type === 'poly') {
        const start = mod.startStates[ann.id];
        if (!start) return ann;
        return { ...ann, points: start.map(p => ({ x: p.x + dx, y: p.y + dy })) };
      }
    }

    if (mod.type === 'resize') {
      if (String(ann.id) !== String(mod.id)) return ann;
      const x = mod.currentImgX ?? mod.startImgX;
      const y = mod.currentImgY ?? mod.startImgY;
      const nc = { ...mod.startCoords };
      const start = mod.startCoords;
      if (mod.handleIdx === 0) { // TL
        nc.x = x; nc.y = y; nc.w = start.x + start.w - x; nc.h = start.y + start.h - y;
      } else if (mod.handleIdx === 1) { // TR
        nc.y = y; nc.w = x - start.x; nc.h = start.y + start.h - y;
      } else if (mod.handleIdx === 2) { // BR
        nc.w = x - start.x; nc.h = y - start.y;
      } else if (mod.handleIdx === 3) { // BL
        nc.x = x; nc.w = start.x + start.w - x; nc.h = y - start.y;
      }
      return { ...ann, coords: nc };
    }
    
    return ann;
  };
  
  // High-Frequency Refs
  const modificationRef = useRef(null);
  const dragStateRef = useRef({ isDragging: false });
  const mousePosRef = useRef({ x: 0, y: 0 });

  // Load Image
  const [imgObj, setImgObj] = useState(null);
  useEffect(() => {
    if (!image) {
      setImgObj(null);
      return;
    }
    setImgObj(null); // Clear previous image immediately
    const img = new Image();

    img.src = image.url;
    img.onload = () => {
      setImgObj(img);
      const container = containerRef.current;
      const fitScale = Math.min(container.clientWidth / img.width, container.clientHeight / img.height) * 0.9;
      setTransform({
        x: (container.clientWidth - img.width * fitScale) / 2,
        y: (container.clientHeight - img.height * fitScale) / 2,
        scale: fitScale
      });
    };
  }, [image]);

  const toImageCoords = useCallback((canvasX, canvasY) => ({
    x: (canvasX - transform.x) / transform.scale,
    y: (canvasY - transform.y) / transform.scale
  }), [transform]);

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;
    const ctx = canvas.getContext('2d');
    canvas.width = containerRef.current.clientWidth;
    canvas.height = containerRef.current.clientHeight;

    let animationId;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const mousePos = mousePosRef.current;
            ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);
      
      ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%)`;
      ctx.drawImage(imgObj, 0, 0);
      ctx.filter = 'none';
      
      annotations.forEach((ann, idx) => {
        if (hiddenClasses.has(ann.class)) return;

        const isHighlighted = idx === hoveredIdx;
        let displayAnn = ann;
        if (modificationRef.current) {
          const mod = modificationRef.current;
          const isTarget = mod.type === 'move' ? mod.ids.has(String(ann.id)) : String(mod.id) === String(ann.id);
          if (isTarget) displayAnn = applyModification(ann, mod);
        }

        // Use deeper, archival ink colors instead of bright neon
        const baseHue = (ann.class ?? 0) * 137.5 % 360;
        let color = isHighlighted ? '#f4ecd8' : `hsl(${baseHue}, 50%, 30%)`; // Darker saturation and lightness
        const fillColor = `hsla(${baseHue}, 50%, 30%, 0.15)`;
        
        const isSelected = selectedIds.has(String(ann.id));
        if (isSelected) color = '#991b1b'; // Red stamp color for selection

        ctx.strokeStyle = color;
        ctx.lineWidth = (isSelected ? 4 : 2) / transform.scale;
        
        if (displayAnn.type === 'box') {
          const { x, y, w, h } = displayAnn.coords;
          if (isSelected) {
            ctx.shadowBlur = 10 / transform.scale;
            ctx.shadowColor = color;
          }
          ctx.strokeRect(x, y, w, h);
          ctx.shadowBlur = 0;
          ctx.fillStyle = fillColor;
          ctx.fillRect(x, y, w, h);

          if (isSelected) {
            ctx.fillStyle = '#f4ecd8'; // Manila interior for handles
            ctx.strokeStyle = '#991b1b';
            ctx.lineWidth = 1 / transform.scale;
            const handles = getBoxHandles(displayAnn.coords);
            handles.forEach(h => {
              ctx.beginPath();
              ctx.rect(h.x - 4/transform.scale, h.y - 4/transform.scale, 8/transform.scale, 8/transform.scale); // Square handles
              ctx.fill();
              ctx.stroke();
            });
          }
        } else if (displayAnn.type === 'poly') {
          if (isSelected) {
            ctx.shadowBlur = 10 / transform.scale;
            ctx.shadowColor = color;
          }
          ctx.beginPath();
          displayAnn.points.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
        
        ctx.fillStyle = color;
        ctx.font = `600 ${12 / transform.scale}px Inter, sans-serif`;
        const isBox = displayAnn.type === 'box';
        const labelX = (isBox ? (displayAnn.coords?.x ?? 0) : (displayAnn.points?.[0]?.x ?? 0));
        const labelY = (isBox ? (displayAnn.coords?.y ?? 0) : (displayAnn.points?.[0]?.y ?? 0));
        const className = classes[displayAnn.class] || `CLASS ${displayAnn.class || 0}`;
        ctx.fillText(className, labelX, labelY - 5/transform.scale);
      });

      if (isDrawing && mode === 'box' && drawStart) {
        ctx.strokeStyle = '#991b1b';
        ctx.setLineDash([5/transform.scale, 5/transform.scale]);
        const imgStart = toImageCoords(drawStart.x, drawStart.y);
        const imgCurrent = toImageCoords(mousePos.x, mousePos.y);
        ctx.strokeRect(imgStart.x, imgStart.y, imgCurrent.x - imgStart.x, imgCurrent.y - imgStart.y);
        ctx.setLineDash([]);
      }

      if (mode === 'poly' && polyPoints.length > 0) {
        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2 / transform.scale;
        ctx.beginPath();
        polyPoints.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        const imgMouse = toImageCoords(mousePos.x, mousePos.y);
        ctx.lineTo(imgMouse.x, imgMouse.y);
        ctx.stroke();

        const firstPoint = polyPoints[0];
        const d = dist(toImageCoords(mousePos.x, mousePos.y), firstPoint);
        if (d < 15 / transform.scale) {
          ctx.fillStyle = '#f4ecd8';
          ctx.strokeStyle = '#f59e0b';
          ctx.beginPath();
          ctx.rect(firstPoint.x - 5/transform.scale, firstPoint.y - 5/transform.scale, 10/transform.scale, 10/transform.scale);
          ctx.fill();
          ctx.stroke();
        }
      }

      if (rubberBand) {
        ctx.strokeStyle = 'rgba(44, 36, 27, 0.5)';
        ctx.lineWidth = 1 / transform.scale;
        ctx.setLineDash([5 / transform.scale, 5 / transform.scale]);
        const r = rubberBand;
        const s = toImageCoords(r.startX, r.startY);
        const e = toImageCoords(r.endX, r.endY);
        ctx.strokeRect(s.x, s.y, e.x - s.x, e.y - s.y);
        ctx.fillStyle = 'rgba(44, 36, 27, 0.05)';
        ctx.fillRect(s.x, s.y, e.x - s.x, e.y - s.y);
        ctx.setLineDash([]);
      }

      ctx.restore();

      ctx.strokeStyle = 'rgba(44, 36, 27, 0.1)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, canvas.height);
      ctx.moveTo(0, mousePos.y); ctx.lineTo(canvas.width, mousePos.y);
      ctx.stroke();

      if (flash > 0) {
        ctx.fillStyle = `rgba(153, 27, 27, ${flash * 0.2})`; // Red flash
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [imgObj, transform, annotations, filters, isDrawing, drawStart, mode, flash, polyPoints, selectedIds, hoveredIdx, hiddenClasses, classes, isDragging]);

  useEffect(() => {
    if (flash > 0) {
      const timeout = setTimeout(() => setFlash(Math.max(0, flash - 0.1)), 30);
      return () => clearTimeout(timeout);
    }
  }, [flash]);

  const handleWheel = (e) => {
    if (!imgObj) return;
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const zoomSpeed = 0.002;
    const delta = -e.deltaY * zoomSpeed;
    const scaleFactor = Math.pow(2, delta);
    
    const canvas = canvasRef.current;
    
    setTransform(prev => {
      const newScale = Math.max(0.05, Math.min(20, prev.scale * scaleFactor));
      const actualFactor = newScale / prev.scale;

      const newX = mouseX - (mouseX - prev.x) * actualFactor;
      const newY = mouseY - (mouseY - prev.y) * actualFactor;

      const imgW = imgObj.width * newScale;
      const imgH = imgObj.height * newScale;
      const boundedX = Math.max(-imgW + 50, Math.min(canvas.width - 50, newX));
      const boundedY = Math.max(-imgH + 50, Math.min(canvas.height - 50, newY));

      return { x: boundedX, y: boundedY, scale: newScale };
    });
  };
  const handleMouseDown = (e) => {
    if (!imgObj) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const imgX = (x - transform.x) / transform.scale;
    const imgY = (y - transform.y) / transform.scale;

    if (e.button === 1 || (e.button === 0 && (e.altKey || isSpaceDown))) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    } else if (e.button === 0) {
      // INTERACTION PRIORITY (Hybrid Mode)
      // 1. Check for Handle Resizing (Requires single selection logic for the handle)
      let foundHandle = false;
      for (const ann of annotations) {
        if (ann.type === 'box' && selectedIds.has(String(ann.id))) {
          const handles = getBoxHandles(ann.coords);
          const handleIdx = handles.findIndex(h => dist(h, {x: imgX, y: imgY}) < 20 / transform.scale);
          if (handleIdx !== -1) {
            modificationRef.current = { 
              type: 'resize', id: ann.id, handleIdx, 
              startCoords: { ...ann.coords },
              startImgX: imgX, startImgY: imgY,
              currentImgX: imgX, currentImgY: imgY
            };
            setIsDragging(true);
            dragStateRef.current.isDragging = true;
            foundHandle = true;
            break;
          }
        }
      }

      if (foundHandle) return;

      // 2. Check for Moving/Selection
      const clickedAnn = annotations.find(ann => isPointInAnn({x: imgX, y: imgY}, ann));
      if (clickedAnn) {
        const annId = String(clickedAnn.id);
        let newSelection = new Set(selectedIds);

        if (e.shiftKey) {
          if (newSelection.has(annId)) newSelection.delete(annId);
          else newSelection.add(annId);
        } else {
          if (!newSelection.has(annId)) newSelection = new Set([annId]);
        }
        onSelectIds(newSelection);

        if (mode === 'select' || mode === 'box' || newSelection.has(annId)) {
          // Initialize mass movement states
          const startStates = {};
          newSelection.forEach(id => {
            const ann = annotations.find(a => String(a.id) === String(id));
            if (ann) {
              startStates[id] = ann.type === 'box' ? { ...ann.coords } : [...ann.points];
            }
          });
          
          modificationRef.current = { 
            type: 'move', 
            ids: newSelection,
            startStates,
            startImgX: imgX, startImgY: imgY,
            currentImgX: imgX, currentImgY: imgY
          };
          setIsDragging(true);
          dragStateRef.current.isDragging = true;
          return;
        }
      }

      // 3. Fallback to Tool Mode
      if (mode === 'box') {
        setIsDrawing(true);
        setDrawStart({ x, y });
      } else if (mode === 'poly') {
        if (polyPoints.length > 2) {
          const firstPoint = polyPoints[0];
          const d = dist({x: imgX, y: imgY}, firstPoint);
          if (d < 15 / transform.scale) {
            onAddAnnotation({ id: Math.random(), type: 'poly', class: activeClass, points: polyPoints });
            setPolyPoints([]);
            return;
          }
        }
        setPolyPoints(prev => [...prev, { x: imgX, y: imgY }]); 
      } else if (mode === 'select') {
        if (!e.shiftKey) {
          onSelectIds(new Set());
          setRubberBand({ startX: x, startY: y, endX: x, endY: y });
        }
      }
    } else if (e.button === 2) {
      // Search from top-down (index-wise) to delete the top-most box
      const foundIdx = [...annotations].reverse().findIndex(ann => isPointInAnn({x: imgX, y: imgY}, ann));
      if (foundIdx !== -1) {
        const realIdx = annotations.length - 1 - foundIdx;
        const newAnns = [...annotations];
        newAnns.splice(realIdx, 1);
        onUpdateAnnotations(newAnns);
      }
    }
  };

  const handleMouseMove = (e) => {
    if (!imgObj) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mousePosRef.current = { x, y };
    const imgCoords = toImageCoords(x, y);
    const imgX = imgCoords.x;
    const imgY = imgCoords.y;

    if (isPanning) {
      const newX = e.clientX - startPan.x;
      const newY = e.clientY - startPan.y;
      
      // Confinement: Keep at least 50px of image in view
      const canvas = canvasRef.current;
      const imgW = imgObj.width * transform.scale;
      const imgH = imgObj.height * transform.scale;
      
      const boundedX = Math.max(-imgW + 50, Math.min(canvas.width - 50, newX));
      const boundedY = Math.max(-imgH + 50, Math.min(canvas.height - 50, newY));

      setTransform(prev => ({ ...prev, x: boundedX, y: boundedY }));
    } else if (rubberBand) {
      setRubberBand(prev => ({ ...prev, endX: x, endY: y }));
    } else if (dragStateRef.current.isDragging && modificationRef.current) {
      const mod = modificationRef.current;
      mod.currentImgX = imgX;
      mod.currentImgY = imgY;
    }
    const hIdx = annotations.findIndex(ann => isPointInAnn({x: imgX, y: imgY}, ann));
    setHoveredIdx(hIdx === -1 ? null : hIdx);
  };

  const handleMouseUp = (e) => {
    if (!imgObj) return;
    if (isPanning) setIsPanning(false);
    
    if (rubberBand) {
      const rect = canvasRef.current.getBoundingClientRect();
      const s = toImageCoords(rubberBand.startX, rubberBand.startY);
      const e = toImageCoords(rubberBand.endX, rubberBand.endY);
      const minX = Math.min(s.x, e.x), maxX = Math.max(s.x, e.x);
      const minY = Math.min(s.y, e.y), maxY = Math.max(s.y, e.y);
      
      const newSelection = new Set();
      annotations.forEach(ann => {
        if (ann.type === 'box') {
          const { x, y, w, h } = ann.coords;
          const cx = x + w/2, cy = y + h/2;
          if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) newSelection.add(String(ann.id));
        }
      });
      if (newSelection.size > 0) onSelectIds(newSelection);
      setRubberBand(null);
    }

    if (dragStateRef.current.isDragging && modificationRef.current) {
      const mod = modificationRef.current;
      const finalAnns = annotations.map(ann => {
        const isModified = mod.type === 'move' ? mod.ids.has(String(ann.id)) : String(ann.id) === String(mod.id);
        if (isModified) {
          const updated = applyModification(ann, mod);
          if (updated.type === 'box') {
            // Normalize box: ensure positive W/H
            const { x, y, w, h } = updated.coords;
            return {
              ...updated,
              coords: {
                x: w < 0 ? x + w : x,
                y: h < 0 ? y + h : y,
                w: Math.abs(w),
                h: Math.abs(h)
              }
            };
          }
          return updated;
        }
        return ann;
      });
      onUpdateAnnotations(finalAnns);
      modificationRef.current = null;
      dragStateRef.current.isDragging = false;
      setIsDragging(false);
    }
    if (isDrawing && mode === 'box' && drawStart) {
      const rect = canvasRef.current.getBoundingClientRect();
      const endImg = toImageCoords(e.clientX - rect.left, e.clientY - rect.top);
      const startImg = toImageCoords(drawStart.x, drawStart.y);
      const newAnn = {
        id: Math.random(), type: 'box', class: activeClass,
        coords: {
          x: Math.min(startImg.x, endImg.x),
          y: Math.min(startImg.y, endImg.y),
          w: Math.abs(endImg.x - startImg.x),
          h: Math.abs(endImg.y - startImg.y)
        }
      };
      if (newAnn.coords.w > 2) {
        onAddAnnotation(newAnn);
        setFlash(1.0);
      }
      setIsDrawing(false);
      setDrawStart(null);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space') {
        setIsSpaceDown(true);
        if (e.target === document.body) e.preventDefault();
      }
      if (e.key === 'Enter' && polyPoints.length > 2) {
        onAddAnnotation({ id: Math.random(), type: 'poly', class: activeClass, points: polyPoints });
        setPolyPoints([]);
      }
      if (e.key === 'Escape') setPolyPoints([]);
    };
    const handleKeyUp = (e) => { if (e.code === 'Space') setIsSpaceDown(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [polyPoints, activeClass, onAddAnnotation]);

  const getCursor = () => {
    if (isPanning) return 'grabbing';
    if (isDragging) {
      if (modificationRef.current?.type === 'resize') return 'nwse-resize';
      return 'move';
    }
    if (hoveredIdx !== null) {
      const ann = annotations[hoveredIdx];
      if (ann?.type === 'box' && selectedIds.has(String(ann.id))) {
        return 'move';
      }
      return 'pointer';
    }
    return mode === 'select' ? 'default' : 'crosshair';
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <canvas 
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
        style={{ cursor: getCursor() }}
      />
    </div>
  );
});

export default AnnotatorCanvas;
