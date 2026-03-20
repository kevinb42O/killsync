import React, { useEffect, useRef } from 'react';

export type MenuEffectType = 'tentacle' | 'electric_arc';

export const triggerMenuEffect = (x: number, y: number, type: MenuEffectType) => {
  window.dispatchEvent(new CustomEvent('menuEffect', { detail: { x, y, type } }));
};

interface Particle {
  id: number;
  type: MenuEffectType;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  progress: number;
  life: number;
  maxLife: number;
  seed: number;
}

export const MenuEffects: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    const handleEffect = (e: CustomEvent) => {
      const { x, y, type } = e.detail;
      
      const newParticles: Particle[] = [];
      
      if (type === 'tentacle') {
        // Spawn 4 tentacles from the corners of the screen
        const corners = [
          { x: 0, y: 0 },
          { x: window.innerWidth, y: 0 },
          { x: 0, y: window.innerHeight },
          { x: window.innerWidth, y: window.innerHeight },
          { x: window.innerWidth / 2, y: window.innerHeight } // Bottom center
        ];
        
        corners.forEach((corner, i) => {
          newParticles.push({
            id: Math.random(),
            type: 'tentacle',
            startX: corner.x,
            startY: corner.y,
            targetX: x,
            targetY: y,
            progress: 0,
            life: 0,
            maxLife: 40 + Math.random() * 20,
            seed: Math.random() * 100
          });
        });
      } else if (type === 'electric_arc') {
        // Spawn electric bolts from the top center (where the title is)
        for (let i = 0; i < 3; i++) {
          newParticles.push({
            id: Math.random(),
            type: 'electric_arc',
            startX: window.innerWidth / 2,
            startY: window.innerHeight * 0.2, // Approx title position
            targetX: x + (Math.random() - 0.5) * 40,
            targetY: y + (Math.random() - 0.5) * 20,
            progress: 0,
            life: 0,
            maxLife: 20 + Math.random() * 15,
            seed: Math.random() * 100
          });
        }
      }
      
      particlesRef.current.push(...newParticles);
    };

    window.addEventListener('menuEffect', handleEffect as EventListener);

    let lastTime = performance.now();
    
    const render = (time: number) => {
      const dt = time - lastTime;
      lastTime = time;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      particlesRef.current = particlesRef.current.filter(p => {
        p.life += dt / 16;
        p.progress = Math.min(1, p.life / p.maxLife);
        
        if (p.type === 'tentacle') {
          // Draw a thick, wiggling dark purple tentacle reaching the target
          const currentLength = p.progress; // 0 to 1
          
          ctx.beginPath();
          ctx.moveTo(p.startX, p.startY);
          
          const dx = p.targetX - p.startX;
          const dy = p.targetY - p.startY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          // Bezier control points with wiggling
          const wiggle = Math.sin(time / 100 + p.seed) * 100;
          const wiggle2 = Math.cos(time / 150 + p.seed * 2) * 100;
          
          const cp1x = p.startX + dx * 0.3 + wiggle;
          const cp1y = p.startY + dy * 0.3 - wiggle2;
          
          const cp2x = p.startX + dx * 0.7 - wiggle2;
          const cp2y = p.startY + dy * 0.7 + wiggle;
          
          // We want the tentacle to "grow" towards the target
          // A simple hack without full bezier parameterization is to scale the distance
          const endX = p.startX + dx * currentLength;
          const endY = p.startY + dy * currentLength;
          
          const eCp1x = p.startX + (cp1x - p.startX) * currentLength;
          const eCp1y = p.startY + (cp1y - p.startY) * currentLength;
          const eCp2x = p.startX + (cp2x - p.startX) * currentLength;
          const eCp2y = p.startY + (cp2y - p.startY) * currentLength;
          
          ctx.bezierCurveTo(eCp1x, eCp1y, eCp2x, eCp2y, endX, endY);
          
          // Tentacle styling
          ctx.lineWidth = 15 * (1 - p.progress * 0.5); // Tapers off
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          
          // Glow
          ctx.shadowColor = '#bf00ff';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = '#2a0040'; // Deep void color
          ctx.stroke();
          
          // Inner vein
          ctx.shadowBlur = 0;
          ctx.lineWidth = 4 * (1 - p.progress * 0.5);
          ctx.strokeStyle = '#bf00ff';
          ctx.stroke();
          
          // Draw a spike/eye at the tip
          if (p.progress > 0.1) {
            ctx.fillStyle = '#ff00ff';
            ctx.beginPath();
            ctx.arc(endX, endY, 6 * (1 - p.progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(endX, endY, 2 * (1 - p.progress * 0.5), 0, Math.PI * 2);
            ctx.fill();
          }

        } else if (p.type === 'electric_arc') {
          // Lightning bolt jagged lines
          const segments = 12;
          const alpha = 1 - Math.pow(p.progress, 3); // Fades out fast at the end
          
          ctx.beginPath();
          ctx.moveTo(p.startX, p.startY);
          
          const dx = p.targetX - p.startX;
          const dy = p.targetY - p.startY;
          
          let prevX = p.startX;
          let prevY = p.startY;
          
          for (let s = 1; s <= segments; s++) {
            const fraction = s / segments;
            const baseX = p.startX + dx * fraction;
            const baseY = p.startY + dy * fraction;
            
            // Add jagged randomness
            const rndX = (Math.random() - 0.5) * 60 * (1 - fraction * 0.5);
            const rndY = (Math.random() - 0.5) * 60 * (1 - fraction * 0.5);
            
            const nextX = s === segments ? p.targetX : baseX + rndX;
            const nextY = s === segments ? p.targetY : baseY + rndY;
            
            ctx.lineTo(nextX, nextY);
            prevX = nextX;
            prevY = nextY;
          }
          
          // Draw cyan electric glow
          ctx.lineCap = 'round';
          ctx.lineJoin = 'miter';
          ctx.shadowColor = '#00ffff';
          ctx.shadowBlur = 15 + Math.random() * 10;
          ctx.lineWidth = 4 + Math.random() * 3;
          ctx.strokeStyle = `rgba(0, 255, 255, ${alpha})`;
          ctx.stroke();
          
          // Core hot white
          ctx.shadowBlur = 0;
          ctx.lineWidth = 2;
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.stroke();
          
          // Flash at impact if it reached it
          if (p.progress > 0.8) {
            ctx.fillStyle = `rgba(0, 255, 255, ${alpha * 0.5})`;
            ctx.beginPath();
            ctx.arc(p.targetX, p.targetY, 30 * Math.random(), 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.targetX, p.targetY, 15 * Math.random(), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        
        return p.life < p.maxLife;
      });
      
      animationRef.current = requestAnimationFrame(render);
    };
    
    animationRef.current = requestAnimationFrame(render);
    
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('menuEffect', handleEffect as EventListener);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // Ambient random lightning to the title
  useEffect(() => {
    let timeoutId: number;
    
    const scheduleRandomStrike = () => {
      // Random wait between 2s and 5s
      const delay = 2000 + Math.random() * 3000;
      
      timeoutId = window.setTimeout(() => {
        // Spawn from either left or right edge randomly
        const x = window.innerWidth / 2;
        const y = window.innerHeight * 0.15; // approximate title center
        
        const side = Math.random() < 0.5 ? 0 : window.innerWidth;
        const startY = window.innerHeight * Math.random() * 0.5; // Upper half
        
        const particle: Particle = {
          id: Math.random(),
          type: 'electric_arc',
          startX: side,
          startY: startY,
          targetX: x + (Math.random() - 0.5) * 80,
          targetY: y + (Math.random() - 0.5) * 40,
          progress: 0,
          life: 0,
          maxLife: 20 + Math.random() * 10,
          seed: Math.random() * 100
        };
        
        particlesRef.current.push(particle);
        scheduleRandomStrike();
      }, delay);
    };
    
    scheduleRandomStrike();
    
    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[100] pointer-events-none"
    />
  );
};
