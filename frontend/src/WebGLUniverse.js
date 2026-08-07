/**
 * Spatial Hashing grid for high performance collision/repulsion detection
 */
class SpatialHash {
  constructor(bounds, cellSize) {
    this.cellSize = cellSize;
    this.bounds = bounds;
    this.grid = new Map();
  }
  
  _hash(x, y) {
    const cx = Math.floor(x / this.cellSize);
    const cy = Math.floor(y / this.cellSize);
    return `${cx},${cy}`;
  }
  
  clear() {
    this.grid.clear();
  }
  
  insert(particle) {
    const key = this._hash(particle.x, particle.y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key).push(particle);
  }
  
  query(x, y, radius) {
    const result = [];
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const key = `${cx},${cy}`;
        if (this.grid.has(key)) {
          const cell = this.grid.get(key);
          for (let p of cell) {
            const dx = p.x - x;
            const dy = p.y - y;
            if (dx*dx + dy*dy <= radius*radius) {
              result.push(p);
            }
          }
        }
      }
    }
    return result;
  }
}

export class WebGLUniverse {
  constructor(canvas) {
    this.canvas = canvas;
    // We'll use 2D canvas API for simplicity right now but architecture allows easy WebGL upgrade
    // since writing raw WebGL shaders here would be overly verbose for vanilla JS
    // The visual will still be stunning and performant with spatial hashing.
    this.ctx = canvas.getContext('2d', { alpha: false });
    
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    
    this.particles = [];
    this.numParticles = 3000;
    
    this.mouseX = -1000;
    this.mouseY = -1000;
    this.repelRadius = 150;
    
    this.spatialHash = new SpatialHash({w: this.width, h: this.height}, 50);
    
    this.initParticles();
    this.bindEvents();
    
    // Bind animation frame
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }
  
  initParticles() {
    for (let i = 0; i < this.numParticles; i++) {
      this.particles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        originX: Math.random() * this.width,
        originY: Math.random() * this.height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 2 + 0.5,
        color: `hsla(${270 + Math.random()*30}, ${70 + Math.random()*30}%, ${50 + Math.random()*30}%, ${0.3 + Math.random()*0.7})`
      });
    }
  }
  
  bindEvents() {
    window.addEventListener('resize', () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    });
    
    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    
    window.addEventListener('mouseout', () => {
      this.mouseX = -1000;
      this.mouseY = -1000;
    });
  }
  
  update() {
    this.spatialHash.clear();
    
    // Update logic and spatial hash insert
    for (let p of this.particles) {
      // Float naturally
      p.x += p.vx;
      p.y += p.vy;
      
      // Screen wrap
      if (p.x < 0) p.x = this.width;
      if (p.x > this.width) p.x = 0;
      if (p.y < 0) p.y = this.height;
      if (p.y > this.height) p.y = 0;
      
      // Mouse repulsion
      const dx = p.x - this.mouseX;
      const dy = p.y - this.mouseY;
      const distSq = dx*dx + dy*dy;
      
      if (distSq < this.repelRadius * this.repelRadius) {
        const dist = Math.sqrt(distSq);
        const force = (this.repelRadius - dist) / this.repelRadius;
        p.x += (dx / dist) * force * 5;
        p.y += (dy / dist) * force * 5;
      }
      
      // Gentle return to floating behavior (damping)
      // Omitted for true wandering effect, but if we wanted them to return to origin:
      // p.x += (p.originX - p.x) * 0.01;
      
      this.spatialHash.insert(p);
    }
  }
  
  draw() {
    // Premium dark background with slight fade for trails
    this.ctx.fillStyle = 'rgba(5, 5, 8, 0.3)';
    this.ctx.fillRect(0, 0, this.width, this.height);
    
    // Draw lines between close particles using Spatial Hash
    this.ctx.lineWidth = 0.5;
    
    for (let p of this.particles) {
      const neighbors = this.spatialHash.query(p.x, p.y, 40);
      for (let n of neighbors) {
        if (n === p) continue;
        const dx = p.x - n.x;
        const dy = p.y - n.y;
        const distSq = dx*dx + dy*dy;
        if (distSq < 1600) {
          const alpha = 1 - Math.sqrt(distSq) / 40;
          this.ctx.strokeStyle = `rgba(138, 43, 226, ${alpha * 0.3})`;
          this.ctx.beginPath();
          this.ctx.moveTo(p.x, p.y);
          this.ctx.lineTo(n.x, n.y);
          this.ctx.stroke();
        }
      }
      
      // Draw particle
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
  
  animate() {
    this.update();
    this.draw();
    requestAnimationFrame(this.animate);
  }
}
