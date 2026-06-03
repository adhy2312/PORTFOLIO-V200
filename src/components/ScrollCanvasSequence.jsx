import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import './ScrollCanvasSequence.css';

gsap.registerPlugin(ScrollTrigger);

const TOTAL_FRAMES = 192;
const PRELOAD_BATCH = 20;

// Singleton cache to survive remounts/StrictMode
const imageCache = new Map();

// Helper to format frame numbers like 001, 010, 192
const getFramePath = (index) => `/flow/ezgif-frame-${String(index).padStart(3, '0')}.jpg`;

const ACTS = [
  {
    id: '01',
    title: 'THE SENSOR ARCHITECTURE — CANON EOS 6D',
    desc: 'A legendary full-frame baseline capturing rich, uncropped ambient data at 20.2 megapixels. High-latitude dynamic range meets pure analog-grade depth.',
    enterStart: 1, enterEnd: 10,
    exitStart: 55, exitEnd: 60
  },
  {
    id: '02',
    title: 'FOCAL COMPOSITION — 50MM F/1.8 STM',
    desc: 'The iconic standard perspective matching the natural human field of view. Stepper motor precision engineered for rapid tracking and quiet, fluid focus acquisition.',
    enterStart: 65, enterEnd: 75,
    exitStart: 120, exitEnd: 125
  },
  {
    id: '03',
    title: 'ISOLATION GEOMETRY — THE EF WIDE-OPEN',
    desc: 'Expansive shallow depth-of-field execution at f/1.8. Gathering massive low-light environments while rendering sharp subjects against razor-thin, cream bokeh.',
    enterStart: 130, enterEnd: 140,
    exitStart: 185, exitEnd: 192
  }
];

const ScrollCanvasSequence = () => {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const actsRef = useRef([]);
  const [loadedFrames, setLoadedFrames] = useState(0);
  const lastDrawnFrame = useRef(-1);

  // Progressive image preloading
  useEffect(() => {
    let isCancelled = false;

    const loadImages = async () => {
      // 1. Preload first batch aggressively
      for (let i = 1; i <= Math.min(PRELOAD_BATCH, TOTAL_FRAMES); i++) {
        if (isCancelled) return;
        await preloadImage(i);
        setLoadedFrames(prev => prev + 1);
      }
      
      // Force initial draw if ScrollTrigger hasn't kicked in
      if (lastDrawnFrame.current === -1) {
        drawFrame(1);
      }

      // 2. Preload remainder lazily
      for (let i = PRELOAD_BATCH + 1; i <= TOTAL_FRAMES; i++) {
        if (isCancelled) return;
        await preloadImage(i);
      }
    };

    loadImages();
    return () => { isCancelled = true; };
  }, []);

  const preloadImage = (index) => {
    return new Promise((resolve) => {
      if (imageCache.has(index)) {
        resolve(imageCache.get(index));
        return;
      }
      const img = new Image();
      img.onload = () => {
        imageCache.set(index, img);
        resolve(img);
      };
      img.onerror = () => {
        // Resolve anyway to prevent pipeline stall on a missing frame
        resolve(null);
      };
      img.src = getFramePath(index);
    });
  };

  const drawFrame = (frameIndex) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clamp
    let safeIndex = Math.max(1, Math.min(frameIndex, TOTAL_FRAMES));
    
    // Find closest loaded frame if desired frame isn't loaded yet
    while (!imageCache.has(safeIndex) && safeIndex > 1) {
      safeIndex--;
    }

    const img = imageCache.get(safeIndex);
    if (!img) return;

    if (lastDrawnFrame.current === safeIndex) return; // Prevent duplicate draws
    lastDrawnFrame.current = safeIndex;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Object-fit: cover equivalent logic
    const imgRatio = img.width / img.height;
    // We use physical pixels for the logical drawing size
    const logicalW = canvas.width / dpr;
    const logicalH = canvas.height / dpr;
    const canvasRatio = logicalW / logicalH;

    let drawW, drawH, drawX, drawY;

    if (canvasRatio > imgRatio) {
      drawW = logicalW;
      drawH = logicalW / imgRatio;
      drawX = 0;
      drawY = (logicalH - drawH) / 2;
    } else {
      drawW = logicalH * imgRatio;
      drawH = logicalH;
      drawX = (logicalW - drawW) / 2;
      drawY = 0;
    }

    ctx.drawImage(img, drawX, drawY, drawW, drawH);
  };

  const updateNarrative = (frameIndex) => {
    actsRef.current.forEach((el, idx) => {
      if (!el) return;
      const act = ACTS[idx];
      
      let opacity = 0;
      let yOffset = 40; // Enter starts below

      if (frameIndex >= act.enterStart && frameIndex <= act.exitEnd) {
        // Entering
        if (frameIndex < act.enterEnd) {
          const progress = (frameIndex - act.enterStart) / (act.enterEnd - act.enterStart);
          opacity = progress;
          yOffset = 40 * (1 - progress);
        } 
        // Fully Visible
        else if (frameIndex >= act.enterEnd && frameIndex <= act.exitStart) {
          opacity = 1;
          yOffset = 0;
        } 
        // Exiting
        else if (frameIndex > act.exitStart) {
          const progress = (frameIndex - act.exitStart) / (act.exitEnd - act.exitStart);
          opacity = 1 - progress;
          yOffset = -20 * progress;
        }
      }

      el.style.opacity = opacity;
      el.style.transform = `translateY(${yOffset}px)`;
      // Prevent pointer events on invisible text to prevent blocking clicks
      el.style.pointerEvents = opacity > 0.1 ? 'auto' : 'none';
    });
  };

  // Setup GSAP & Canvas Sizing
  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      drawFrame(1);
      updateNarrative(50); // Show Act 1 statically
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { alpha: false }); // alpha false optimizes rendering if no transparency needed
    ctx.imageSmoothingEnabled = true;

    const resizeCanvas = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      const rect = containerRef.current.getBoundingClientRect();
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
      lastDrawnFrame.current = -1; // Force redraw on resize
      
      // Calculate current frame based on scroll if active
      if (stRef.current) {
         const currentFrame = Math.max(1, Math.floor(stRef.current.progress * (TOTAL_FRAMES - 1)) + 1);
         drawFrame(currentFrame);
      } else {
         drawFrame(1);
      }
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const stRef = {};
    
    stRef.current = ScrollTrigger.create({
      trigger: containerRef.current,
      start: "top top",
      end: "+=300%", // Scroll depth for 192 frames (adjust to taste)
      pin: true,
      scrub: 0.5, // 0.5 adds slight smoothness over exact 1:1 scrub
      onUpdate: (self) => {
        const frame = Math.floor(self.progress * (TOTAL_FRAMES - 1)) + 1;
        drawFrame(frame);
        updateNarrative(frame);
      }
    });

    // Force initial state
    updateNarrative(1);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (stRef.current) stRef.current.kill();
    };
  }, []);

  return (
    <section className="scroll-canvas-section" ref={containerRef} data-xray="[CANVAS SEQUENCE]">
      
      {/* 
        We use an inner wrapper to slightly scale the canvas. 
        This efficiently crops out the Gemini logo watermark at the bottom right.
      */}
      <div className="canvas-crop-wrapper">
        <canvas ref={canvasRef} className="scroll-canvas" />
      </div>

      <div className="sequence-overlays-container">
        {ACTS.map((act, index) => (
          <div 
            key={act.id} 
            className="sequence-overlay" 
            ref={el => actsRef.current[index] = el}
          >
            <span className="sequence-label">{act.id}</span>
            <h2 className="sequence-title">{act.title}</h2>
            <p className="sequence-description">{act.desc}</p>
          </div>
        ))}
      </div>

      {loadedFrames < PRELOAD_BATCH && (
        <div className="sequence-loader">
          Initializing Engine...
        </div>
      )}
    </section>
  );
};

export default ScrollCanvasSequence;
