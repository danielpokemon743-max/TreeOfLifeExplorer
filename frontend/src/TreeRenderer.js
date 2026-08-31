



/**
 * TreeRenderer.js — Engine WebGL (PixiJS)
 */
 
import { fetchChildren } from './DataService.js';
 
const LEVEL_W   = 320;
const ROW_H     = 80;
const LERP      = 0.2;
const FADE_SPD  = 0.1;
 
const RANK_SIZE = {
  life: 14, domain: 10, kingdom: 8, phylum: 6,
  class: 5, order: 4, family: 3.5, genus: 3, species: 2.5,
};
const DEFAULT_R = 3;

const RANK_ORDER = ['life','domain','superkingdom','kingdom','subkingdom','phylum','subphylum','superclass','class','subclass','superorder','order','suborder','infraorder','parvorder','superfamily','family','subfamily','tribe','subtribe','genus','subgenus','section','subsection','species','subspecies','variety','form','forma'];
function getRankIndex(rank){ return RANK_ORDER.indexOf((rank||'').toLowerCase()); }
 
// Conversor de cor puro (funciona em qualquer versão do PixiJS)
function parseColorHex(colorStr) {
  if (!colorStr) return 0x34495e;
  if (typeof colorStr === 'number') return colorStr;
  return parseInt(String(colorStr).replace('#', ''), 16) || 0x34495e;
}

// Chave estável para deduplicar filhos (nome + ott_id/id)
function _childKey(c) {
  return (c.name || '').toLowerCase() + '|' + (c.ott_id ?? c.id ?? '');
}
function canonicalize(name){
  const s = String(name||'').trim();
  const m = s.match(/^([A-Z][a-z]+ [a-z]+(?: [a-z]+)?)/);
  return m ? m[1].toLowerCase() : s.toLowerCase();
}
if (typeof window !== 'undefined' && !window._globalCanonical) window._globalCanonical = new Map();

// Adiciona filhos novos sem remover os já existentes (preserva a cadeia de
// classificação da busca e evita duplicatas ao reexpandir).
function _mergeChildren(node, incoming) {
  const existing = new Map(node.children.map(c => [_childKey(c), c]));
  const names = new Set(node.children.map(c => (c.name || '').toLowerCase()));
  const existingCan = new Set(node.children.map(c => canonicalize(c.name)));
  const allNodes = (typeof window !== 'undefined' && Array.isArray(window.allTreeNodes)) ? window.allTreeNodes : null;
  const nodeById = (typeof window !== 'undefined' && window._nodeById && typeof window._nodeById.get === 'function') ? window._nodeById : null;
  const globalCan = (typeof window !== 'undefined' && window._globalCanonical) ? window._globalCanonical : null;
  for (const c of incoming) {
    const k = _childKey(c);
    const nm = (c.name || '').toLowerCase();
    const can = canonicalize(c.name);
    if (existing.has(k) || names.has(nm) || existingCan.has(can)) continue;
    // Bloqueio direto: Homo sapiens só pode ser filho do gênero Homo
    if (can === 'homo sapiens' && canonicalize(node.name) !== 'homo') continue;
    // global dedup: Homo sapiens já existe sob Homo (gênero) não duplica sob espécie
    if (globalCan && globalCan.has(can)) {
      const owner = globalCan.get(can);
      // se já existe sob o gênero Homo, não duplica sob espécie do mesmo gênero
      if (owner && owner.parent && owner.parent.name === 'Homo' && node.name !== 'Homo' && node.name.startsWith('Homo ')) continue;
      // também bloqueia duplicata global de mesma espécie em outro ramo
      if (can === 'homo sapiens' && globalCan.has('homo sapiens')) continue;
    }
    existing.set(k, c);
    names.add(nm);
    existingCan.add(can);
    node.children.push(c);
    if (globalCan && !globalCan.has(can)) globalCan.set(can, c);
    // Registra no índice global para que a busca exata (findNodeInLocalData)
    // e o autocomplete encontrem o mesmo nó (antes só a árvore o tinha).
    if (allNodes && !allNodes.includes(c)) allNodes.push(c);
    if (nodeById && c.id) nodeById.set(String(c.id), c);
  }
  node.children.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}
 
export class TreeNode {
  constructor(raw, parent = null) {
    this.id         = raw.ott_id ?? raw.id;
    this.colId      = raw.colId || raw.col_id || null;
    this.name       = raw.name || String(this.id);
    this.canonicalName  = raw.canonicalName || raw.canonical_name || raw.name || '';
    this.scientificName = raw.scientificName || raw.scientific_name || raw.name || '';
    this.rank       = (raw.rank || '').toLowerCase();
    this.status     = raw.status || raw.taxonomicStatus || 'accepted';
    this.vernacularName = raw.vernacularName || raw.commonName || raw.popularName || raw.vernacular_name || '';
    this.kingdom    = (raw.kingdom || raw.kingdom_name || raw.reino || '').trim().toLowerCase();
    this.parent     = parent || raw.parent || null;
    this.parentId   = raw.parentId || raw.parent_id || raw.parentNameUsageID || null;
    this.depth      = this.parent ? this.parent.depth + 1 : 0;
    this._source    = raw._source || 'local';
    this.lineage    = raw.lineage || [];

    const lineageName = this.lineage.length > 0
      ? this.lineage[this.lineage.length - 1]?.name
      : this.name;
    const nameLower = (lineageName || this.name).toLowerCase();
    let baseColor = null;

    if (!this.kingdom) {
      // Inferência do reino pelo nome da própria linhagem/nome (dados externos)
      const words = [
        this.name,
        ...(raw.lineage || []).map(l => String(l.name || ''))
      ].join(' ').toLowerCase();
      if (words.includes('animalia')) this.kingdom = 'animalia';
      else if (words.includes('viridiplantae')) this.kingdom = 'plantae';
      else if (words.includes('plantae')) this.kingdom = 'plantae';
      else if (words.includes('fungi')) this.kingdom = 'fungi';
      else if (words.includes('archaea')) this.kingdom = 'archaea';
      else if (words.includes('bacteria')) this.kingdom = 'bacteria';
      else if (words.includes('protozoa') || words.includes('protista')) this.kingdom = 'protozoa';
      else if (words.includes('chromista')) this.kingdom = 'chromista';
    }

    if (nameLower.includes('animalia') || nameLower.includes('metazoa')) baseColor = '#3498DB';
    else if (nameLower.includes('plantae') || nameLower.includes('viridiplantae')) baseColor = '#27AE60';
    else if (nameLower.includes('fungi')) baseColor = '#8E44AD';
    else if (nameLower.includes('bacteria') || nameLower.includes('monera')) baseColor = '#E74C3C';
    else if (nameLower.includes('archaea')) baseColor = '#F39C12';
    else if (nameLower.includes('eukaryota')) baseColor = '#16A085';
    else if (nameLower.includes('protista') || nameLower.includes('chromista')) baseColor = '#D35400';

    this.color = baseColor || this.parent?.color || '#34495E';

    this.x       = this.parent?.x ?? 0;
    this.y       = this.parent?.y ?? 0;
    this.targetX = 0;
    this.targetY = 0;

    this.expanded = false;
    this.loaded   = false;
    this.loading  = false;
    this.selected = false;
    this._alpha   = this.parent ? 0 : 1;

    this.children = [];

    if (raw.children && raw.children.length > 0) {
      this.expanded = true;
      this.loaded   = true;
      this.children = raw.children.map(c => {
        const child = new TreeNode(c, this);
        if (c.lineage && c.lineage.length > 0) {
          child.lineage = c.lineage;
        } else {
          child.lineage = [...(this.lineage || []), { id: child.colId || child.id, name: child.name, rank: child.rank }];
        }
        return child;
      });
    }
  }

  get primaryId() { return this.colId || this.id; }
  get isLeaf() { return !this.expanded || this.children.length === 0; }
  get nodeR()  { return RANK_SIZE[this.rank] ?? DEFAULT_R; }
}
 
export class TreeRenderer {
  constructor(container, { onSelect, onExpand } = {}) {
    this.container = typeof container === 'string' 
      ? document.querySelector(container) 
      : (container || document.body);
 
    this.onSelect = onSelect || (() => {});
    // 🔴 FIX: antes esse parâmetro nem era capturado, então o carregador
    // externo passado pelo main.js (fetchExternalChildren) nunca era chamado
    // ao clicar para expandir um nó — só quando o nó era selecionado.
    this.onExpand = typeof onExpand === 'function' ? onExpand : null;
 
    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x000000,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true
    });
 
    this.container.appendChild(this.app.view);
    this.canvas = this.app.view;
 
    this.tooltipEl = document.getElementById('taxon-tooltip');
   
    
    
    if (!this.tooltipEl) {
      this.tooltipEl = document.createElement('div');
      this.tooltipEl.id = 'tree-tooltip';
      document.body.appendChild(this.tooltipEl);
    }
 
    this.world = new PIXI.Container();
    this.app.stage.addChild(this.world);
 
    this.gfxEdges = new PIXI.Graphics();
    this.gfxNodes = new PIXI.Graphics();
    this.gfxLabels = new PIXI.Container();
 
    this.world.addChild(this.gfxEdges);
    this.world.addChild(this.gfxNodes);
    this.world.addChild(this.gfxLabels);

    // Partículas fluindo nas arestas
    this.gfxParticles = new PIXI.Graphics();
    this.world.addChild(this.gfxParticles);
    this._particles = [];
    this._pulseTime = 0;

    // Parallax de fundo (3 camadas de estrelas)
    this._bgContainer = new PIXI.Container();
    this.app.stage.addChildAt(this._bgContainer, 0);
    this._bgLayers = [];
    const bgConfigs = [
      { count: 110, size: 1.25, alpha: 0.5,  factor: 0.12 },
      { count: 65,  size: 1.7,  alpha: 0.68, factor: 0.28 },
      { count: 38,  size: 2.3,  alpha: 0.88, factor: 0.5  },
    ];
    for (let li = 0; li < bgConfigs.length; li++) {
      const cfg = bgConfigs[li];
      const g = new PIXI.Graphics();
      g._parallaxFactor = cfg.factor;
      // estrelas espalhadas numa área grande para cobrir pan
      const spreadW = 6000, spreadH = 4000;
      for (let s = 0; s < cfg.count; s++) {
        const x = (Math.random() - 0.5) * spreadW;
        const y = (Math.random() - 0.5) * spreadH;
        const a = cfg.alpha * (0.6 + Math.random() * 0.4);
        g.beginFill(0xffffff, a);
        g.drawCircle(x, y, cfg.size * (0.7 + Math.random() * 0.6));
        g.endFill();
        // brilho sutil ao redor de algumas estrelas da camada mais próxima
        if (li === 2 && Math.random() < 0.35) {
          g.beginFill(0xaaccff, a * 0.18);
          g.drawCircle(x, y, cfg.size * 3.2);
          g.endFill();
        }
      }
      this._bgContainer.addChild(g);
      this._bgLayers.push(g);
    }
 
    this.scale   = 1.0;
    this.root     = null;
    this.allNodes = [];
    this.hovered  = null;
 
    this._bindEvents();
    this._loop();
  }
 
  setRoot(node) {
    this.root = node;
    this._recomputeLayout();
 
    if (this.world) {
      this.world.x = 120;
      this.world.y = window.innerHeight / 2;
      this.world.scale.set(1.0);
    }
 
    this._requestRender();
  }
 
  resetView() {
    this.scale = 1.0;
    if (this.world) {
      this.world.x = 120;
      this.world.y = window.innerHeight / 2;
      this.world.scale.set(1.0);
    }
    this._requestRender();
  }
 
  zoomBy(factor) {
    if (!this.world) return;
    const newScale = Math.max(0.05, Math.min(20, this.world.scale.x * factor));
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    this.world.x = cx - (cx - this.world.x) * (newScale / this.world.scale.x);
    this.world.y = cy - (cy - this.world.y) * (newScale / this.world.scale.x);
    this.scale = newScale;
    this.world.scale.set(newScale);
    this._requestRender();
  }

  // Zoom centrado num ponto da tela (usado por wheel, dblclick e double-tap)
  _zoomAtPoint(clientX, clientY, factor) {
    if (!this.world) return;
    const newScale = Math.max(0.05, Math.min(20, this.world.scale.x * factor));
    this.world.x = clientX - (clientX - this.world.x) * (newScale / this.world.scale.x);
    this.world.y = clientY - (clientY - this.world.y) * (newScale / this.world.scale.x);
    this.scale = newScale;
    this.world.scale.set(newScale);
    this._requestRender();
  }

  // ⚡ FOCO DA CÂMERA GARANTIDO NO TÁXON PESQUISADO
  focusOnNode(node, targetScale = 1.4) {
    if (!node) return;
    this._focusedNode = node;

    // 1. Garante que o nó e TODOS os seus pais estejam marcados como expandidos
    let curr = node;
    while (curr) {
      curr.expanded = true;
      curr.loaded = true;
      curr._alpha = 1;
      curr = curr.parent;
    }
 
    // 2. Agora sim recarrega a árvore (como todos os pais estão expanded, o _collectNodes vai alcançar o nó)
    this._recomputeLayout();
 
    // 3. Aplica instantaneamente os novos targetX/Y calculados
    for (const n of this.allNodes) {
      if (Number.isFinite(n.targetX)) n.x = n.targetX;
      if (Number.isFinite(n.targetY)) n.y = n.targetY;
      n.selected = false;
    }
 
    node.selected = true;
 
    // 4. Pega as coordenadas exatas recém-calculadas
    const focusX = Number.isFinite(node.targetX) ? node.targetX : (node.x || 0);
    const focusY = Number.isFinite(node.targetY) ? node.targetY : (node.y || 0);
 
    const screenW = window.innerWidth || 800;
    const screenH = window.innerHeight || 600;
 
    // 5. Centraliza a câmera diretamente no nó correto
    this.scale = targetScale;
    this.world.scale.set(targetScale);
 
    this.world.x = (screenW / 2) - (focusX * targetScale);
    this.world.y = (screenH / 2) - (focusY * targetScale);
 
    this._requestRender();
  }
 
  _update() {
    let activeAnimation = false;
 
    // 🎥 ANIMAÇÃO SUAVE DA CÂMERA (Glide/Slide para o nó)
    if (this._camTargetX !== undefined && this._camTargetY !== undefined) {
      const dx = this._camTargetX - this.world.x;
      const dy = this._camTargetY - this.world.y;
      const ds = (this._camTargetScale || 1) - this.world.scale.x;
 
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(ds) > 0.001) {
        this.world.x += dx * 0.15;
        this.world.y += dy * 0.15;
        const newScale = this.world.scale.x + ds * 0.15;
        this.world.scale.set(newScale);
        this.scale = newScale;
        activeAnimation = true;
      } else {
        this.world.x = this._camTargetX;
        this.world.y = this._camTargetY;
        this.world.scale.set(this._camTargetScale);
        this.scale = this._camTargetScale;
        this._camTargetX = undefined;
        this._camTargetY = undefined;
      }
    }
 
    // ANIMAÇÃO DOS NÓS E LINHAS DA ÁRVORE
    const len = this.allNodes.length;
    for (let i = 0; i < len; i++) {
      const n = this.allNodes[i];
      const dx = n.targetX - n.x;
      const dy = n.targetY - n.y;
 
      if (Math.abs(dx) > 0.5) { n.x += dx * LERP; activeAnimation = true; }
      else { n.x = n.targetX; }
 
      if (Math.abs(dy) > 0.5) { n.y += dy * LERP; activeAnimation = true; }
      else { n.y = n.targetY; }
 
      if (n._alpha < 1) {
        n._alpha = Math.min(1, n._alpha + FADE_SPD);
        activeAnimation = true;
      }
    }

    // ✨ PULSE só quando há nó focado (evita loop infinito quando ocioso)
    if (this._focusedNode) {
      this._pulseTime = (this._pulseTime || 0) + 0.12;
      activeAnimation = true;
    }

    // 🌌 PARALLAX — só atualiza se a câmera realmente se moveu
    if (this._bgLayers && this._bgLayers.length) {
      const wx = this.world.x, wy = this.world.y;
      if (wx !== this._lastBgX || wy !== this._lastBgY) {
        for (const g of this._bgLayers) {
          const f = g._parallaxFactor || 0.2;
          g.x = wx * f * 0.35;
          g.y = wy * f * 0.35;
        }
        this._lastBgX = wx; this._lastBgY = wy;
      }
    }

    // 🔵 PARTÍCULAS: visíveis mas com cap (equilíbrio perf/efeito)
    if (this.allNodes.length > 0) {
      if (this._particles.length < 42 && Math.random() < 0.07) {
        // amostragem sem alocar array: tenta achar um parent expandido aleatório
        let p = null, tries = 0;
        while (!p && tries < 6) {
          const cand = this.allNodes[Math.floor(Math.random() * this.allNodes.length)];
          if (cand.expanded && cand.children && cand.children.length) p = cand;
          tries++;
        }
        if (p) {
          const c = p.children[Math.floor(Math.random() * p.children.length)];
          if (c && (this._inViewport(p) || this._inViewport(c))) {
            this._particles.push({ parent: p, child: c, t: 0, speed: 0.018 + Math.random() * 0.02 });
            activeAnimation = true;
          }
        }
      }
      for (let i = this._particles.length - 1; i >= 0; i--) {
        const pt = this._particles[i];
        if (!pt.parent.expanded || !pt.parent.children.includes(pt.child)) {
          this._particles.splice(i, 1); continue;
        }
        pt.t += pt.speed;
        if (pt.t >= 1) { this._particles.splice(i, 1); continue; }
        activeAnimation = true;
      }
    }
    return activeAnimation;
  }
  _countLeaves(node) {
    if (node.isLeaf) return 1;
    return node.children.reduce((s, c) => s + this._countLeaves(c), 0);
  }
 
  _recomputeLayout() {
    this.allNodes = [];
    if (!this.root) return;
 
    this._collectNodes(this.root);
 
    const total = this._countLeaves(this.root);
    this._assignPos(this.root, 0, -(total * ROW_H) / 2);
    this._layoutPending = false;
  }
 
  _collectNodes(node) {
    if (!node) return;
    this.allNodes.push(node);
    if (node.expanded && node.children) {
      for (let i = 0; i < node.children.length; i++) {
        this._collectNodes(node.children[i]);
      }
    }
  }
 
  _assignPos(node, depth, yStart) {
    const leaves = this._countLeaves(node);
    node.targetX = depth * LEVEL_W;
    node.targetY = yStart + (leaves * ROW_H) / 2;
 
    if (!node.isLeaf) {
      let cy = yStart;
      for (const child of node.children) {
        this._assignPos(child, depth + 1, cy);
        cy += this._countLeaves(child) * ROW_H;
      }
    }
  }
  
  // Verifica se `target` está na subárvore de `node` (target é nó ou descendente).
  _contains(node, target) {
    let cur = target;
    while (cur) {
      if (cur === node) return true;
      cur = cur.parent;
    }
    return false;
  }
  
  async expandNode(node) {
    if (node.loading) return;

    // Nó marcado como expandido mas cujos filhos são só a cadeia COL parcial
    // (criados pela busca, sem ott_id). Em vez de colapsar, carrega do OpenTree.
    const hasRealChildren = node.children.some(c => c.ott_id);
    // Gêneros, famílias etc. sempre buscam a largura completa (OpenTree/COL),
    // mesmo quando já têm filhos locais — assim clicar em "Homo" mostra todas
    // as espécies de Homo, não só a que foi pesquisada.
    const wantBreadth = node.rank !== 'species' && node.rank !== 'subspecies';

    if (node.expanded) {
      // Não colapsa um ancestral do nó em foco (ex.: clicar em "Homo" não
      // deve fechar a "Homo sapiens" que foi pesquisada). Garante ainda assim
      // que os filhos (irmãos) estejam carregados em largura.
      if (this._focusedNode && this._focusedNode !== node && this._contains(node, this._focusedNode)) {
        if (wantBreadth) {
          try { await this._loadChildren(node, true); } catch (e) { /* ignora */ }
        }
        node.expanded = true;
        this._recomputeLayout();
        this._requestRender();
        return;
      }
      if (node._source === 'api' && !hasRealChildren) {
        await this._loadChildren(node, true);
        if (node.children.length > 0) {
          node.expanded = true;
          this._recomputeLayout();
          this._requestRender();
        }
        return;
      }
      node.expanded = false;
      this._recomputeLayout();
      this._requestRender();
      return;
    }
  
    // Ao expandir, força a busca dos filhos completos (não só a cadeia da
    // busca) para nós externos ou nós que podem ter mais filhos em largura.
    await this._loadChildren(node, node._source === 'api' || wantBreadth);
    if (node.children.length > 0) node.expanded = true;
    this._recomputeLayout();
    this._requestRender();
  }
 
  async _loadChildren(node, force = false) {
    // Nós criados pela cadeia COL da busca ficam com loaded=true mas children=[]
    // (fetchAndInsertExternalTaxon/focusOnNode marcam loaded=true). Sem esta
    // checagem eles nunca buscariam os filhos reais no OpenTree.
    if (node.loaded && !force && node.children.length > 0) return;
    // Evita re-consultar APIs repetidamente para nós sem filhos
    if (!force && node._noChildrenUntil && Date.now() < node._noChildrenUntil) return;
    node.loading = true;
 
    let raw = null;
    try {
      raw = await fetchChildren(node.id, node.name);
    } catch (err) {
      // 🔴 FIX: se fetchChildren der erro (rede, etc), sem o try/catch a
      // exceção interrompia a função ANTES de node.loading = false, e como
      // expandNode() bloqueia com `if (node.loading) return;`, esse nó
      // ficava travado para sempre — nunca mais expandia, mesmo tentando
      // clicar de novo depois.
      console.warn(`Falha ao carregar filhos de "${node.name}":`, err);
      raw = null;
    }
 
    // Se a fonte primária (DataService) não trouxe nada, tenta o carregador
    // externo passado pelo main.js (Catalogue of Life), que já popula
    // node.children diretamente com instâncias reais de TreeNode.
    if ((!raw || raw.length === 0) && this.onExpand) {
      try {
        await this.onExpand(node);
      } catch (err) {
        console.warn(`Falha no onExpand externo de "${node.name}":`, err);
      }
      node.loading = false;
      node.loaded  = true;
      if (node.rank !== 'species' && node.rank !== 'subspecies' && node.children.length === 0) {
        // sem feedback das fontes → avisa e evita re-consultar a API a cada clique
        if (typeof window.notifyNoChildren === 'function') {
          window.notifyNoChildren(node, 'sem filhos em OpenTree e Catalogue of Life');
        }
        node._noChildrenUntil = Date.now() + 120000;
      }
      return;
    }
 
    node.loading = false;
    node.loaded  = true;
  
    if (!raw || raw.length === 0) return;
  
    const isBio = (typeof window.isBiologicalName === 'function') ? window.isBiologicalName : null;
    const pIdx = getRankIndex(node.rank);
    const incoming = raw
      .filter(c => {
        const cIdx = getRankIndex(c.rank);
        if (pIdx !== -1 && cIdx !== -1 && cIdx <= pIdx) return false;
        return !isBio || isBio(c.name || '');
      })
      .map(c => {
      const child = new TreeNode(
        { ott_id: c.ott_id, name: c.name, rank: c.rank },
        node
      );
      child.x = node.x;
      child.y = node.y;
      return child;
    });
    _mergeChildren(node, incoming);
    // Garante que duplicatas como Homo sapiens sob Homo erectus sejam removidas imediatamente
    try { this.pruneInvalidRanks(); } catch {}
  }

  pruneInvalidRanks() {
    if (!this.root) return;
    let removed = 0;
    const isSpecies = (n) => {
      const r = (n.rank || '').toLowerCase();
      if (r === 'species' || r === 'subspecies') return true;
      const name = (n.name || '').trim();
      return r === 'no rank' && name.includes(' ') && /^[A-Z][a-z]+ [a-z]+/.test(name);
    };
    const stack = [this.root];
    while (stack.length) {
      const node = stack.pop();
      if (!node.children || node.children.length === 0) continue;
      // Caso específico: Homo sapiens só pode ser filho do gênero Homo
      if (canonicalize(node.name) !== 'homo' && canonicalize(node.name).startsWith('homo ')) {
        const beforeHomo = node.children.length;
        node.children = node.children.filter(c => {
          if (canonicalize(c.name) === 'homo sapiens') {
            const idx = window.allTreeNodes ? window.allTreeNodes.indexOf(c) : -1;
            if (idx !== -1) window.allTreeNodes.splice(idx, 1);
            if (window._nodeById) {
              if (c.id) window._nodeById.delete(String(c.id));
              if (c.primaryId) window._nodeById.delete(String(c.primaryId));
              if (c.colId) window._nodeById.delete(String(c.colId));
            }
            removed++;
            return false;
          }
          return true;
        });
        if (node.children.length !== beforeHomo) {
          for (const c of node.children) stack.push(c);
          continue;
        }
      }
      // Espécies/subespécies (ou binomiais) nunca devem ter filhos — remove qualquer filho
      if (isSpecies(node)) {
        for (const c of node.children) {
          const idx = window.allTreeNodes ? window.allTreeNodes.indexOf(c) : -1;
          if (idx !== -1) window.allTreeNodes.splice(idx, 1);
          if (window._nodeById) {
            if (c.id) window._nodeById.delete(String(c.id));
            if (c.primaryId) window._nodeById.delete(String(c.primaryId));
            if (c.colId) window._nodeById.delete(String(c.colId));
          }
          removed++;
        }
        node.children = [];
        continue;
      }
      const pIdx = getRankIndex(node.rank);
      const before = node.children.length;
      node.children = node.children.filter(c => {
        const cIdx = getRankIndex(c.rank);
        if (pIdx !== -1 && cIdx !== -1 && cIdx <= pIdx) {
          const idx = window.allTreeNodes ? window.allTreeNodes.indexOf(c) : -1;
          if (idx !== -1) window.allTreeNodes.splice(idx, 1);
          if (window._nodeById) {
            if (c.id) window._nodeById.delete(String(c.id));
            if (c.primaryId) window._nodeById.delete(String(c.primaryId));
            if (c.colId) window._nodeById.delete(String(c.colId));
          }
          removed++;
          return false;
        }
        return true;
      });
      for (const c of node.children) stack.push(c);
    }
    if (removed > 0) {
      console.log(`🧹 pruneInvalidRanks: ${removed} ligação(ões) inválida(s) removida(s) (ex.: espécie sob espécie)`);
      this._recomputeLayout();
      this._requestRender();
    }
  }

  _loop() {
    const tick = () => {
      let needsNextFrame = false;
 
      if (this._layoutPending) {
        this._recomputeLayout();
        needsNextFrame = true;
      }
 
      const isAnimating = this._update();
      this._draw();
 
      if (isAnimating || this._drag || needsNextFrame) {
        requestAnimationFrame(tick);
      } else {
        this._animating = false;
      }
    };
 
    if (!this._animating) {
      this._animating = true;
      requestAnimationFrame(tick);
    }
  }
 
  _requestRender() {
    if (!this._animating) {
      this._loop();
    }
  }
 
  
 
  _draw() {
    if (!this.gfxEdges || !this.gfxNodes || !this.gfxLabels) return;
    this.gfxEdges.clear();
    this.gfxNodes.clear();
    if (this.gfxParticles) this.gfxParticles.clear();
    this.gfxLabels.removeChildren();
 
    if (!this.root || !this.allNodes || this.allNodes.length === 0) return;
 
    const scale = this.world.scale.x || 1;
    const len = this.allNodes.length;
 
    for (let i = 0; i < len; i++) {
      const parent = this.allNodes[i];
      if (!parent.expanded || !parent.children) continue;
 
      for (const child of parent.children) {
        if (child._alpha <= 0.01) continue;
 
        if (this._inViewport(parent) || this._inViewport(child)) {
          const colorHex = parseColorHex(child.color);
          
          this.gfxEdges.lineStyle(
            Math.max(0.5, 1.5 / scale), 
            colorHex, 
            child._alpha * 0.7
          );
          
          this.gfxEdges.moveTo(parent.x, parent.y);
          this.gfxEdges.lineTo(parent.x, child.y);
          this.gfxEdges.lineTo(child.x, child.y);
        }
      }
    }

    // 🔵 PARTÍCULAS: bolinha + brilho leve
    if (this._particles && this._particles.length && this.gfxParticles) {
      for (const pt of this._particles) {
        const p = pt.parent, c = pt.child;
        if (!p || !c) continue;
        const t = pt.t;
        let x, y;
        if (t < 0.5) {
          const tt = t * 2;
          x = p.x;
          y = p.y + (c.y - p.y) * tt;
        } else {
          const tt = (t - 0.5) * 2;
          x = p.x + (c.x - p.x) * tt;
          y = c.y;
        }
        const col = parseColorHex(c.color);
        const pr = 2.1 / Math.max(0.6, scale);
        this.gfxParticles.beginFill(col, 0.92);
        this.gfxParticles.drawCircle(x, y, pr);
        this.gfxParticles.endFill();
        this.gfxParticles.beginFill(col, 0.24);
        this.gfxParticles.drawCircle(x, y, pr * 2.0);
        this.gfxParticles.endFill();
      }
    }

    for (let i = 0; i < len; i++) {
      const n = this.allNodes[i];
      if (!this._inViewport(n)) continue;
 
      const colorHex = parseColorHex(n.color);
      const r = n.nodeR || 3;
      const a = n._alpha || 1;

      // 🌟 BLOOM visível mas leve: selecionado + reinos + ranks maiores
      const wantBloom = n.selected || ['life','domain','kingdom','phylum','class','order','family'].includes(n.rank);
      if (wantBloom) {
        const bloomR = r * 2.8;
        const bloomA = (n.selected ? 0.22 : 0.14) * a;
        this.gfxNodes.beginFill(colorHex, bloomA);
        this.gfxNodes.drawCircle(n.x, n.y, bloomR);
        this.gfxNodes.endFill();
      }
 
      this.gfxNodes.beginFill(colorHex, a);
      this.gfxNodes.drawCircle(n.x, n.y, r);
      this.gfxNodes.endFill();
 
      if (n.selected) {
        // 💓 PULSE: halo que respira (só no selecionado)
        const pulse = Math.sin(this._pulseTime || 0) * 1.6;
        const pulseA = 0.5 + Math.sin(this._pulseTime || 0) * 0.18;
        this.gfxNodes.lineStyle(2.2 / scale, 0x00FFCC, Math.max(0, pulseA));
        this.gfxNodes.drawCircle(n.x, n.y, r + 6 + pulse);
        this.gfxNodes.lineStyle(0);
      }
 
      const isKingdomOrDomain = ['life', 'domain', 'kingdom'].includes(n.rank);
      const isMajorRank = ['phylum', 'class', 'order'].includes(n.rank);
      // Ao dar zoom, revela o nome de QUALQUER táxon visível (não só os
      // expandidos/selecionados/rank superior) — antes, gêneros e espécies
      // recolhidos não mostravam o rótulo nem com zoom.
      const zoomedIn = scale >= 0.6;
      const shouldShowLabel = isKingdomOrDomain || zoomedIn ||
        (scale > 0.25 && (n.expanded || n.selected || isMajorRank));
 
      if (shouldShowLabel) {
        const textObj = new PIXI.Text(n.name, {
          fontFamily: 'Arial, sans-serif',
          fontSize: Math.max(9, Math.min(13, 11 / scale)),
          fill: n.selected ? 0x00FFCC : 0xFFFFFF,
          fontWeight: n.selected ? 'bold' : 'normal'
        });
 
        textObj.x = n.x + r + 6;
        textObj.y = n.y - 6;
        textObj.alpha = n._alpha || 1;
 
        this.gfxLabels.addChild(textObj);
      }
    }
  }
 
  _inViewport(n) {
    if (!n) return false;
 
    const sx = n.x * this.world.scale.x + this.world.x;
    const sy = n.y * this.world.scale.y + this.world.y;
    
    const margin = 250;
    const width  = window.innerWidth || 800;
    const height = window.innerHeight || 600;
 
    return (
      sx > -margin && 
      sx < width + margin && 
      sy > -margin && 
      sy < height + margin
    );
  }
 
  _hitTest(cx, cy) {
    const wx = (cx - this.world.x) / this.world.scale.x;
    const wy = (cy - this.world.y) / this.world.scale.y;
    let best = null;
    let bestD2 = Infinity;
 
    for (const n of this.allNodes) {
      if (!this._inViewport(n)) continue;
 
      const r  = (n.nodeR + 14) / this.world.scale.x;
      const dx = n.x - wx;
      const dy = n.y - wy;
      const d2 = dx * dx + dy * dy;
 
      if (d2 <= r * r && d2 < bestD2) {
        best   = n;
        bestD2 = d2;
      }
    }
    return best;
  }
 
  _bindEvents() {
    window.addEventListener('resize', () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
      this._recomputeLayout();
      this._requestRender();
    });
 
this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY < 0 ? 1.15 : 0.85;
      this._zoomAtPoint(e.clientX, e.clientY, f);
    }, { passive: false });

    // Double-click / double-tap = zoom no ponto
    this.canvas.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this._zoomAtPoint(e.clientX, e.clientY, 1.6);
    });
 
let dX = 0, dY = 0;

    // ── Suporte a touch (celular/tablet): arrastar com 1 dedo, zoom com 2 ──
    let touchStart = null;
    let pinchStart = 0;
    let pinchDist = 0;
    let pinchScale = 0;

    let canvasTouchActive = false;
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      canvasTouchActive = true;
      if (e.touches.length === 1) {
        this._drag = true;
        this._moved = false;
        dX = e.touches[0].clientX - this.world.x;
        dY = e.touches[0].clientY - this.world.y;
        touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      } else if (e.touches.length === 2) {
        this._drag = false;
        pinchStart = this.world.scale.x;
        pinchDist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      // Só tratamos toques que começaram dentro do canvas da árvore.
      // Se o dedo está sobre um painel/modal, deixamos o scroll nativo rolar.
      if (e.target !== this.canvas && !(this.canvas && this.canvas.contains(e.target))) {
        return;
      }
      if (e.touches.length === 1 && this._drag) {
        this._moved = true;
        this.world.x = e.touches[0].clientX - dX;
        this.world.y = e.touches[0].clientY - dY;
        this._requestRender();
        if (this.tooltipEl) {
          this.tooltipEl.style.setProperty('display', 'none', 'important');
        }
      } else if (e.touches.length === 2 && pinchDist > 0) {
        const dist = Math.hypot(
          e.touches[1].clientX - e.touches[0].clientX,
          e.touches[1].clientY - e.touches[0].clientY
        );
        this._moved = true;
        // 🔴 FIX: zoom centralizado NO ponto médio entre os dedos.
        // Antes só mudava o scale e a árvore sumia da tela ao dar zoom out
        // (o mundo girava em torno da origem, não do ponto de pinça).
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this._zoomAtPoint(midX, midY, dist / pinchDist);
        pinchDist = dist;
      }
      if (e.touches.length > 0) e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      if (e.touches.length === 0) {
        const wasDrag = this._moved;
        this._drag = false;
        touchStart = null;
        pinchDist = 0;
        // Tap curto (sem arrastar) = selecionar táxon sob o dedo.
        // O preventDefault no touchstart impede o "click" sintético, então tratamos aqui.
        const changed = e.changedTouches && e.changedTouches[0];
        if (!wasDrag && canvasTouchActive && changed && changed.clientX !== undefined) {
          this._handleTap(changed.clientX, changed.clientY);
        }
        canvasTouchActive = false;
      }
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this._drag  = true;
      this._moved = false;
      dX = e.clientX - this.world.x;
      dY = e.clientY - this.world.y;
    });
 
    window.addEventListener('mousemove', (e) => {
      if (this._drag) {
        this._moved = true;
        this.world.x = e.clientX - dX;
        this.world.y = e.clientY - dY;
        this._requestRender();
        if (this.tooltipEl) {
          this.tooltipEl.style.setProperty('display', 'none', 'important');
        }
      } else {
        this.hovered = this._hitTest(e.clientX, e.clientY);
        this.canvas.style.cursor = this.hovered ? 'pointer' : 'grab';
 
        if (this.tooltipEl) {
          if (this.hovered) {
            const rankFormatted = this.hovered.rank ? ` (${this.hovered.rank.toUpperCase()})` : '';
            this.tooltipEl.textContent = `${this.hovered.name}${rankFormatted}`;
            
            this.tooltipEl.style.setProperty('position', 'fixed', 'important');
            this.tooltipEl.style.setProperty('left', `${e.clientX + 15}px`, 'important');
            this.tooltipEl.style.setProperty('top', `${e.clientY + 15}px`, 'important');
            this.tooltipEl.style.setProperty('background', 'rgba(15, 23, 42, 0.95)', 'important');
            this.tooltipEl.style.setProperty('color', '#ffffff', 'important');
            this.tooltipEl.style.setProperty('padding', '6px 12px', 'important');
            this.tooltipEl.style.setProperty('border-radius', '6px', 'important');
            this.tooltipEl.style.setProperty('font-size', '12px', 'important');
            this.tooltipEl.style.setProperty('font-family', 'Arial, sans-serif', 'important');
            this.tooltipEl.style.setProperty('pointer-events', 'none', 'important');
            this.tooltipEl.style.setProperty('z-index', '2147483647', 'important');
            this.tooltipEl.style.setProperty('border', '1px solid rgba(255, 255, 255, 0.3)', 'important');
            this.tooltipEl.style.setProperty('box-shadow', '0 4px 12px rgba(0, 0, 0, 0.6)', 'important');
            this.tooltipEl.style.setProperty('display', 'block', 'important');
          } else {
            this.tooltipEl.style.setProperty('display', 'none', 'important');
          }
        }
      }
    });
 
    window.addEventListener('mouseup', () => { 
      this._drag = false; 
    });
 
    this.canvas.addEventListener('mouseleave', () => {
      if (this.tooltipEl) {
        this.tooltipEl.style.setProperty('display', 'none', 'important');
      }
    });
 
    this.canvas.addEventListener('click', async (e) => {
      if (this._moved) return;
      const node = this._hitTest(e.clientX, e.clientY);
      if (!node) return;
      for (const n of this.allNodes) n.selected = false;
      node.selected = true;
      this.onSelect(node);
      await this.expandNode(node);
    });
  }

  async _handleTap(x, y) {
    const node = this._hitTest(x, y);
    if (!node) return;
    for (const n of this.allNodes) n.selected = false;
    node.selected = true;
    this.onSelect(node);
    await this.expandNode(node);
  }
}

