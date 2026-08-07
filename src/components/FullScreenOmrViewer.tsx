import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, X } from 'lucide-react';

interface FullScreenOmrViewerProps {
  imageUrl: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  scoreInfo?: {
    score: number;
    correctCount?: number;
    wrongCount?: number;
    unansweredCount?: number;
  };
}

export const FullScreenOmrViewer: React.FC<FullScreenOmrViewerProps> = ({
  imageUrl,
  title,
  subtitle,
  onClose,
  scoreInfo
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset zoom & pan when image changes
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, [imageUrl]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 4));
  };

  const handleZoomOut = () => {
    setScale(prev => {
      const next = Math.max(prev - 0.25, 1);
      if (next === 1) {
        setPosition({ x: 0, y: 0 });
      }
      return next;
    });
  };

  const handleReset = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  // Drag and Pan handlers
  const startDrag = (clientX: number, clientY: number) => {
    if (scale <= 1) return; // Only drag when zoomed in
    setIsDragging(true);
    dragStart.current = { x: clientX - position.x, y: clientY - position.y };
  };

  const onDrag = (clientX: number, clientY: number) => {
    if (!isDragging || scale <= 1) return;
    const newX = clientX - dragStart.current.x;
    const newY = clientY - dragStart.current.y;

    // Apply basic bounding constraints to keep image on screen
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const maxX = (rect.width * (scale - 1)) / 2;
      const maxY = (rect.height * (scale - 1)) / 2;
      setPosition({
        x: Math.max(-maxX - 50, Math.min(maxX + 50, newX)),
        y: Math.max(-maxY - 50, Math.min(maxY + 50, newY))
      });
    } else {
      setPosition({ x: newX, y: newY });
    }
  };

  const stopDrag = () => {
    setIsDragging(false);
  };

  // Touch event helpers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      onDrag(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleReset();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="no-print"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        backgroundColor: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        animation: 'omrFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      <style>{`
        @keyframes omrFadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* HEADER BAR */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 24px',
          background: 'linear-gradient(to bottom, rgba(15,23,42,0.95), rgba(15,23,42,0.8))',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          color: '#ffffff',
          zIndex: 10
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 750, color: '#f8fafc', letterSpacing: '0.3px' }}>
            📄 {title}
          </h3>
          {subtitle && (
            <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
              {subtitle}
            </p>
          )}
        </div>

        {scoreInfo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', margin: '0 24px' }}>
            <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '24px', padding: '6px 14px', fontSize: '0.85rem', fontWeight: 800, color: '#34d399' }}>
              Marks: {scoreInfo.score.toFixed(1)}
            </div>
            <div style={{ display: 'flex', gap: '12px', fontSize: '0.8rem', color: '#cbd5e1' }} className="hidden-xs">
              {scoreInfo.correctCount !== undefined && <span>🟢 {scoreInfo.correctCount}</span>}
              {scoreInfo.wrongCount !== undefined && <span>🔴 {scoreInfo.wrongCount}</span>}
              {scoreInfo.unansweredCount !== undefined && <span>⚫ {scoreInfo.unansweredCount}</span>}
            </div>
          </div>
        )}

        <button 
          onClick={onClose}
          style={{
            background: 'rgba(255,255,255,0.1)',
            color: '#f8fafc',
            border: 'none',
            borderRadius: '50%',
            width: '38px',
            height: '38px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.2s'
          }}
          title="Close (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* VIEWPORT CONTROLLER FLOATING CONTAINER */}
      <div 
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: '#090d16',
          cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
        }}
        onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
        onMouseMove={(e) => onDrag(e.clientX, e.clientY)}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={stopDrag}
      >
        <img 
          src={imageUrl} 
          alt="Scanned OMR Sheet" 
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          style={{
            maxHeight: '90vh',
            maxWidth: '95%',
            objectFit: 'contain',
            borderRadius: '4px',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 0.15s cubic-bezier(0.16, 1, 0.3, 1)',
            transformOrigin: 'center center',
            pointerEvents: 'auto'
          }} 
        />

        {/* FLOATING ZOOM CONTROLS */}
        <div 
          style={{
            position: 'absolute',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '8px',
            background: 'rgba(15,23,42,0.85)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '30px',
            padding: '6px 12px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            zIndex: 10
          }}
        >
          <button 
            type="button" 
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center' }} 
            onClick={handleZoomOut} 
            disabled={scale <= 1}
            title="Zoom Out"
          >
            <ZoomOut size={16} style={{ opacity: scale <= 1 ? 0.4 : 1 }} />
          </button>

          <span style={{ color: '#cbd5e1', fontSize: '0.8rem', fontWeight: 'bold', minWidth: '45px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {Math.round(scale * 100)}%
          </span>

          <button 
            type="button" 
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center' }} 
            onClick={handleZoomIn}
            disabled={scale >= 4}
            title="Zoom In"
          >
            <ZoomIn size={16} style={{ opacity: scale >= 4 ? 0.4 : 1 }} />
          </button>

          <div style={{ width: '1px', background: 'rgba(255,255,255,0.15)', margin: '4px 2px' }} />

          <button 
            type="button" 
            style={{ background: 'transparent', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: '6px', borderRadius: '50%', display: 'flex', alignItems: 'center' }} 
            onClick={handleReset}
            disabled={scale === 1 && position.x === 0 && position.y === 0}
            title="Reset View"
          >
            <RotateCcw size={16} style={{ opacity: (scale === 1 && position.x === 0 && position.y === 0) ? 0.4 : 1 }} />
          </button>
        </div>
      </div>
    </div>
  );
};
