// Ứng dụng Gia Phả Online — Phái Ất Chi Ất Họ Nguyễn Phúc Thôn Bình An
(function () {
  'use strict';

  const STORAGE_KEY = 'GIAPHA_NGUYEN_PHUC_PHAI_AT_V6';
  const AUTH_SESSION_KEY = 'GIAPHA_AUTH_SESSION_V1';
  const CONTRIB_PREFILL_KEY = 'GIAPHA_CONTRIB_PREFILL_V1';
  const APP_CFG = window.GIAPHA_CONFIG || {};
  const APPS_SCRIPT_URL = (APP_CFG.APPS_SCRIPT_URL || '').trim();

  const DEFAULT_METADATA = {
    title: 'KẾ PHẢ ĐỒ PHÁI ẤT CHI ẤT HỌ NGUYỄN PHÚC THÔN BÌNH AN',
    branch: 'Phái Ất - Chi Ất',
    clan: 'Họ Nguyễn Phúc',
    village: 'Thôn Bình An',
    updatedAt: '25/01/2026',
    generations: 14
  };

  const DEFAULT_GEN_Y = [
    { gen: 1, y: 2123 },
    { gen: 2, y: 3538 },
    { gen: 3, y: 4896 },
    { gen: 4, y: 6290 },
    { gen: 5, y: 7706 },
    { gen: 6, y: 9068 },
    { gen: 7, y: 10419 },
    { gen: 8, y: 11795 },
    { gen: 9, y: 13172 },
    { gen: 10, y: 14548 },
    { gen: 11, y: 15924 },
    { gen: 12, y: 17300 },
    { gen: 13, y: 18675 },
    { gen: 14, y: 20049 }
  ];

  try {
    localStorage.removeItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V1');
    localStorage.removeItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V2');
    localStorage.removeItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V3');
    localStorage.removeItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V4');
  } catch (e) {}

  // State
  let authSession = { unlocked: false, password: '', role: 'member', isLocalDemo: false };
  let pendingEditAction = null;
  let cachedProposals = [];
  let familyData = createEmptyFamilyData();
  let selectedNodeId = null;
  let highlightedIds = new Set();
  let currentViewMode = 'ke-pha'; // 'ke-pha' | 'cay-dai-thu'

  // SVG ViewBox Pan/Zoom State
  let WORLD_W = 38200;
  let WORLD_H = 22200;
  const BANYAN_CX = 15000;
  const BANYAN_CY = 13250;
  let viewBox = { x: 0, y: 400, w: 38200, h: 21500 };
  let isDragging = false;
  let dragStart = { x: 0, y: 0, vx: 0, vy: 0 };
  let animFrameId = null;

  // DOM Elements
  const svgEl = document.getElementById('phaDoSvg');
  const viewportGroup = document.getElementById('viewportGroup');
  const canvasContainer = document.getElementById('canvasContainer');
  const zoomPercentLabel = document.getElementById('zoomPercentLabel');
  const statsSummaryText = document.getElementById('statsSummaryText');
  const genFilterSelect = document.getElementById('genFilterSelect');

  // Search DOM
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const searchResultsDropdown = document.getElementById('searchResultsDropdown');

  // Drawer DOM
  const memberDetailDrawer = document.getElementById('memberDetailDrawer');
  const detailBadgeRole = document.getElementById('detailBadgeRole');
  const detailBadgeGen = document.getElementById('detailBadgeGen');
  const detailMemberName = document.getElementById('detailMemberName');
  const detailFullNameSub = document.getElementById('detailFullNameSub');
  const detailLineagePath = document.getElementById('detailLineagePath');
  const detailCodeValue = document.getElementById('detailCodeValue');
  const detailGioValue = document.getElementById('detailGioValue');
  const detailSinhValue = document.getElementById('detailSinhValue');
  const detailChildrenCount = document.getElementById('detailChildrenCount');
  const detailParentsBox = document.getElementById('detailParentsBox');
  const detailSpousesTitle = document.getElementById('detailSpousesTitle');
  const detailSpousesList = document.getElementById('detailSpousesList');
  const detailChildrenList = document.getElementById('detailChildrenList');
  const detailSiblingsList = document.getElementById('detailSiblingsList');
  const detailNoteText = document.getElementById('detailNoteText');

  function createEmptyFamilyData() {
    return {
      metadata: JSON.parse(JSON.stringify(DEFAULT_METADATA)),
      genY: JSON.parse(JSON.stringify(DEFAULT_GEN_Y)),
      nodes: []
    };
  }

  // Load or initialize data (local fallback only when APPS_SCRIPT_URL is not configured)
  function loadInitialData() {
    let data = null;
    if (!APPS_SCRIPT_URL) {
      try {
        const saved =
          localStorage.getItem(STORAGE_KEY) ||
          localStorage.getItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V5');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
            data = parsed;
          }
        }
        localStorage.removeItem('GIAPHA_NGUYEN_PHUC_PHAI_AT_V5');
      } catch (e) {
        console.warn('Could not read localStorage:', e);
      }
      if (!data && window.INITIAL_FAMILY_DATA) {
        data = JSON.parse(JSON.stringify(window.INITIAL_FAMILY_DATA));
      }
    }
    if (!data) {
      return createEmptyFamilyData();
    }
    if (!data.metadata) data.metadata = JSON.parse(JSON.stringify(DEFAULT_METADATA));
    if (!Array.isArray(data.genY) || data.genY.length === 0) {
      data.genY = JSON.parse(JSON.stringify(DEFAULT_GEN_Y));
    }
    // Ensure canonical members & spelling fixes (especially Cụ CÔNG NHÀ - N7 at Đời 5, Thủy Tổ G. 4/12)
    if (data && Array.isArray(data.nodes) && data.nodes.length > 0) {
      const defaultNodes =
        (window.INITIAL_FAMILY_DATA && window.INITIAL_FAMILY_DATA.nodes) || [];
      const defaultN7 = defaultNodes.find(n => n.id === 'N7') || {
        id: 'N7',
        generation: 5,
        type: 'male',
        name: 'CÔNG NHÀ',
        fullName: 'NGUYỄN CÔNG NHÀ',
        code: 'V.1',
        gio: 'G. 1/5',
        sinh: '',
        parentId: 'N5',
        motherIndex: 0,
        x: 17919,
        y: 7706,
        topX: 17919,
        barY: 7370,
        spouses: [
          {
            name: 'Từ Vàng',
            fullName: 'Từ Vàng',
            gio: 'G. 21/7',
            sinh: '',
            x: 17286
          },
          {
            name: 'Bùi Từ Quyên',
            fullName: 'Bùi Từ Quyên',
            gio: 'G. 20/11',
            sinh: '',
            x: 18086
          }
        ],
        note: 'Hiển Tổ khảo Nguyễn nhất lang tự Công Nhà, thụy Chân Lương (Giỗ 1/5) — Con trưởng cụ Hữu Điều (Phái Giáp, ngang hàng với cụ Như Hạ). Chính thất: Nguyễn Quý Thị hiệu Từ Vàng (Giỗ 21/7); Trắc thất: Bùi Thị hiệu Từ Quyên (Giỗ 20/11).',
        topY: 7505
      };

      const n1 = data.nodes.find(n => n.id === 'N1');
      if (n1 && !n1.gio) n1.gio = 'G. 4/12';

      let n7 = data.nodes.find(n => n.id === 'N7');
      if (!n7) {
        // Re-insert cụ CÔNG NHÀ (N7) right before N8 (or after N6) if previously removed
        const copyN7 = JSON.parse(JSON.stringify(defaultN7));
        const idxN8 = data.nodes.findIndex(n => n.id === 'N8');
        const idxN6 = data.nodes.findIndex(n => n.id === 'N6');
        if (idxN8 !== -1) {
          data.nodes.splice(idxN8, 0, copyN7);
        } else if (idxN6 !== -1) {
          data.nodes.splice(idxN6 + 1, 0, copyN7);
        } else {
          data.nodes.push(copyN7);
        }
      } else {
        n7.name = 'CÔNG NHÀ';
        n7.fullName = 'NGUYỄN CÔNG NHÀ';
        n7.code = n7.code || 'V.1';
        n7.gio = n7.gio || 'G. 1/5';
        n7.parentId = n7.parentId || 'N5';
        if (!Array.isArray(n7.spouses) || n7.spouses.length === 0) {
          n7.spouses = JSON.parse(JSON.stringify(defaultN7.spouses));
        }
        if (!n7.note) {
          n7.note = defaultN7.note;
        }
      }

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e) {}
    }
    return data;
  }

  function saveDataToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(familyData));
    } catch (e) {
      console.warn('Could not save to localStorage:', e);
    }
  }

  // Vietnamese string normalization for accent-insensitive search
  function normalizeVN(str) {
    if (!str) return '';
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s./]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Ensure generation Y baseline exists for any generation 1..maxGen
  function getGenBaselineY(gen) {
    const found = familyData.genY && familyData.genY.find(g => g.gen === Number(gen));
    if (found) return found.y;
    // Standard step is 1375 units per generation after Đời 14 (20049)
    return 20049 + (Number(gen) - 14) * 1375;
  }

  // Ensure every node has valid topX and barY coordinates (auto-layout for newly added nodes)
  function ensureLayoutCoordinates() {
    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));
    familyData.metadata.generations = maxGen;

    for (let g = 1; g <= maxGen; g++) {
      const genY = getGenBaselineY(g);
      const genNodes = familyData.nodes.filter(n => Number(n.generation) === g);

      for (const node of genNodes) {
        node.y = genY;
        if (!node.topX || isNaN(node.topX)) {
          // Compute position based on parent & siblings
          const siblings = genNodes.filter(
            s => s.id !== node.id && s.parentId === node.parentId && s.topX
          );
          if (siblings.length > 0) {
            const maxSibX = Math.max(...siblings.map(s => Number(s.topX)));
            const spacing = node.type === 'male' ? 940 : 640;
            node.topX = maxSibX + spacing;
          } else if (node.parentId) {
            const parent = familyData.nodes.find(p => p.id === node.parentId);
            if (parent) {
              const mIdx = Number(node.motherIndex) || 0;
              const motherX =
                parent.spouses && parent.spouses[mIdx] && parent.spouses[mIdx].x
                  ? parent.spouses[mIdx].x
                  : parent.topX || parent.x || 19242;
              node.topX = motherX;
            } else {
              node.topX = 19242;
            }
          } else {
            node.topX = 19242;
          }
          node.x = node.topX;
        }
        if (!node.barY || isNaN(node.barY)) {
          node.barY = genY - 296;
        }
        // Ensure spouses have valid x coordinates
        if (node.type === 'male' && Array.isArray(node.spouses)) {
          node.spouses.forEach((sp, idx) => {
            if (!sp.x || isNaN(sp.x)) {
              sp.x = node.topX + idx * 920;
            }
          });
        }
      }
    }
  }

  // Trace lineage (ancestors + descendants) of a selected node
  function computeLineageSet(nodeId) {
    const set = new Set();
    if (!nodeId) return set;
    set.add(nodeId);

    // Climb up to Thủy Tổ Đời 1
    let curr = familyData.nodes.find(n => n.id === nodeId);
    while (curr && curr.parentId) {
      set.add(curr.parentId);
      curr = familyData.nodes.find(n => n.id === curr.parentId);
    }

    // Walk down to all descendants
    const queue = [nodeId];
    while (queue.length > 0) {
      const pid = queue.shift();
      const children = familyData.nodes.filter(n => n.parentId === pid);
      for (const c of children) {
        if (!set.has(c.id)) {
          set.add(c.id);
          queue.push(c.id);
        }
      }
    }
    return set;
  }

  // Create SVG Element helper
  function createSvgEl(tag, attrs = {}, textContent = null) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) {
        el.setAttribute(k, String(v));
      }
    }
    if (textContent !== null) {
      el.textContent = textContent;
    }
    return el;
  }

  // Render the active Genealogy Chart Mode (Mẫu 1: Kế Phả Đồ OR Mẫu 2: Cây Đại Thụ)
  function renderPhaDo() {
    ensureLayoutCoordinates();
    computeBanyanLayout();
    viewportGroup.innerHTML = '';

    if (currentViewMode === 'cay-dai-thu') {
      WORLD_W = 30000;
      WORLD_H = 21600;
      renderCayDaiThu();
      return;
    }

    WORLD_W = 38200;
    WORLD_H = 22200;

    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));
    const maxBottomY = getGenBaselineY(maxGen) + 1250;

    // 1. Outer Traditional Double Frame
    const frameGroup = createSvgEl('g', { id: 'chartFrame' });
    frameGroup.appendChild(
      createSvgEl('rect', {
        x: 340,
        y: 620,
        width: 36920,
        height: maxBottomY - 620,
        fill: 'none',
        stroke: '#0f172a',
        'stroke-width': 26
      })
    );
    frameGroup.appendChild(
      createSvgEl('rect', {
        x: 400,
        y: 680,
        width: 36800,
        height: maxBottomY - 740,
        fill: 'none',
        stroke: '#0f172a',
        'stroke-width': 8
      })
    );

    // Main Chart Title
    frameGroup.appendChild(
      createSvgEl(
        'text',
        {
          x: 18800,
          y: 1220,
          'text-anchor': 'middle',
          fill: '#0f172a',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': 310,
          'font-weight': '800',
          'letter-spacing': '6'
        },
        familyData.metadata.title || 'KẾ PHẢ ĐỒ PHÁI ẤT CHI ẤT HỌ NGUYỄN PHÚC THÔN BÌNH AN'
      )
    );

    // 2. Generation Bands (ĐỜI.1 .. ĐỜI.maxGen) & Dashed Row Lines
    for (let g = 1; g <= maxGen; g++) {
      const gy = getGenBaselineY(g);

      // Dashed horizontal guide separating generations (above each generation row)
      if (g > 1) {
        const dashY = gy - 470;
        frameGroup.appendChild(
          createSvgEl('line', {
            x1: 420,
            y1: dashY,
            x2: 37180,
            y2: dashY,
            stroke: '#94a3b8',
            'stroke-width': 7,
            'stroke-dasharray': '180, 140'
          })
        );
      }

      // Left Generation Badge Box (ĐỜI.1 .. ĐỜI.14)
      const badgeX = 640;
      const badgeY = gy - 162;
      const badgeW = 520;
      const badgeH = 220;

      const genBadgeGroup = createSvgEl('g', {
        class: 'gen-row-badge',
        style: 'cursor: pointer'
      });
      genBadgeGroup.addEventListener('click', () => focusGeneration(g));

      genBadgeGroup.appendChild(
        createSvgEl('rect', {
          x: badgeX,
          y: badgeY,
          width: badgeW,
          height: badgeH,
          fill: '#fff5f5',
          stroke: '#0f172a',
          'stroke-width': 8
        })
      );
      genBadgeGroup.appendChild(
        createSvgEl(
          'text',
          {
            x: badgeX + badgeW / 2,
            y: badgeY + 152,
            'text-anchor': 'middle',
            fill: '#dc2626',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': 132,
            'font-weight': '800'
          },
          `ĐỜI.${g}`
        )
      );
      frameGroup.appendChild(genBadgeGroup);
    }

    viewportGroup.appendChild(frameGroup);

    // 3. Parent-Child Orthogonal Connector Lines
    const connectorsGroup = createSvgEl('g', { id: 'chartConnectors' });
    drawAllConnectors(connectorsGroup);
    viewportGroup.appendChild(connectorsGroup);

    // 4. All Person & Spouse Boxes
    const nodesGroup = createSvgEl('g', { id: 'chartNodes' });
    for (const node of familyData.nodes) {
      const nodeEl = drawPersonNode(node);
      nodesGroup.appendChild(nodeEl);
    }
    viewportGroup.appendChild(nodesGroup);

    // 5. Auto-fit all text elements to their containing boxes using real DOM font metrics
    autoFitAllBoxTexts();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        autoFitAllBoxTexts();
      });
    }

    updateStatsAndFilters();
  }

  // Estimate initial font size based on string visual character widths
  function computeInitialFontSize(str, maxSpan, baseSize, minSize = 68) {
    if (!str) return baseSize;
    let totalFactor = 0;
    for (const ch of str) {
      if (/[\s.,I1l'*/-]/.test(ch)) {
        totalFactor += 0.34;
      } else if (ch === ch.toUpperCase() && ch !== ch.toLowerCase()) {
        totalFactor += 0.69;
      } else {
        totalFactor += 0.56;
      }
    }
    const estWidth = totalFactor * baseSize;
    if (estWidth > maxSpan) {
      return Math.max(minSize, Math.floor((maxSpan / totalFactor) * 0.96));
    }
    return baseSize;
  }

  // Measure actual rendered SVG text length and dynamically scale font-size so every label fits cleanly inside its box
  function autoFitAllBoxTexts() {
    const textEls = viewportGroup.querySelectorAll('text[data-max-span]');
    for (const el of textEls) {
      const maxSpan = parseFloat(el.getAttribute('data-max-span'));
      if (!maxSpan || isNaN(maxSpan)) continue;

      el.removeAttribute('textLength');
      el.removeAttribute('lengthAdjust');

      let actualLen = 0;
      try {
        actualLen = el.getComputedTextLength();
      } catch (e) {
        continue;
      }

      if (actualLen > maxSpan) {
        const currentSize = parseFloat(el.getAttribute('font-size')) || 100;
        const newSize = Math.max(66, Math.floor(currentSize * (maxSpan / actualLen) * 0.96));
        el.setAttribute('font-size', String(newSize));

        // Keep text dead-center vertically/horizontally inside its compartment after font-size adjustment
        const orient = el.getAttribute('data-orient');
        if (orient === 'h') {
          const cy = parseFloat(el.getAttribute('data-cy'));
          if (!isNaN(cy)) {
            el.setAttribute('y', String(Math.round(cy + newSize * 0.35)));
          }
        } else if (orient === 'v') {
          const cx = parseFloat(el.getAttribute('data-cx'));
          const cy = parseFloat(el.getAttribute('data-cy'));
          if (!isNaN(cx) && !isNaN(cy)) {
            const newX = Math.round(cx + newSize * 0.34);
            el.setAttribute('x', String(newX));
            el.setAttribute('transform', `rotate(-90 ${newX} ${cy})`);
          }
        }

        // If still wider than maxSpan at minimum font size, condense slightly
        try {
          if (el.getComputedTextLength() > maxSpan) {
            el.setAttribute('textLength', String(maxSpan));
            el.setAttribute('lengthAdjust', 'spacingAndGlyphs');
          }
        } catch (e) {}
      }
    }
  }

  // Draw orthogonal parent-child connector lines & downward arrowheads
  function drawAllConnectors(container) {
    // Group children by (parentId, motherIndex)
    const familyGroups = new Map();

    for (const child of familyData.nodes) {
      if (!child.parentId) continue;
      const mIdx = Number(child.motherIndex) || 0;
      const key = `${child.parentId}__${mIdx}`;
      if (!familyGroups.has(key)) {
        familyGroups.set(key, []);
      }
      familyGroups.get(key).push(child);
    }

    for (const [key, children] of familyGroups.entries()) {
      const [parentId, mIdxStr] = key.split('__');
      const mIdx = Number(mIdxStr) || 0;
      const parent = familyData.nodes.find(n => n.id === parentId);
      if (!parent) continue;

      const parentGenY = getGenBaselineY(parent.generation);
      const childGenY = getGenBaselineY(children[0].generation);
      const childTopY = childGenY - 162;

      // Determine drop origin (x, y) from parent / mother box
      let dropX = parent.topX;
      let dropY = parentGenY + 162; // bottom of male box if no wife box

      const hasWifeBoxes =
        (parent.spouses && parent.spouses.length > 0) ||
        (parent.generation >= 10 && parent.generation <= 13 && !parent.gio);

      if (parent.spouses && parent.spouses[mIdx]) {
        dropX = parent.spouses[mIdx].x || parent.topX;
        dropY = parentGenY + 702; // bottom of wife box
      } else if (hasWifeBoxes) {
        dropY = parentGenY + 702;
      }

      // Determine horizontal sibling bar Y
      const barY = children[0].barY && children[0].barY > dropY + 20
        ? children[0].barY
        : childTopY - 135;

      const isLineageActive =
        highlightedIds.has(parent.id) && children.some(c => highlightedIds.has(c.id));
      const strokeColor = isLineageActive ? '#d97706' : '#0f172a';
      const strokeW = isLineageActive ? 14 : 7;

      // Collect all X positions connected on this sibling bar
      const allX = [dropX, ...children.map(c => c.topX)];
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);

      // Vertical line from parent/wife bottom down to barY
      container.appendChild(
        createSvgEl('line', {
          x1: dropX,
          y1: dropY,
          x2: dropX,
          y2: barY,
          stroke: strokeColor,
          'stroke-width': strokeW,
          class: isLineageActive ? 'svg-connector lineage-active' : 'svg-connector'
        })
      );

      // Horizontal sibling bar at barY (if more than 1 point or offset X)
      if (maxX - minX > 4) {
        container.appendChild(
          createSvgEl('line', {
            x1: minX,
            y1: barY,
            x2: maxX,
            y2: barY,
            stroke: strokeColor,
            'stroke-width': strokeW,
            class: isLineageActive ? 'svg-connector lineage-active' : 'svg-connector'
          })
        );
      }

      // Vertical drop from barY into each child's top center + downward arrowhead
      for (const child of children) {
        const isChildHighlighted =
          highlightedIds.has(parent.id) && highlightedIds.has(child.id);
        const cColor = isChildHighlighted ? '#d97706' : '#0f172a';
        const cWidth = isChildHighlighted ? 14 : 7;

        container.appendChild(
          createSvgEl('line', {
            x1: child.topX,
            y1: barY,
            x2: child.topX,
            y2: childTopY,
            stroke: cColor,
            'stroke-width': cWidth,
            class: isChildHighlighted ? 'svg-connector lineage-active' : 'svg-connector'
          })
        );

        // Crisp downward arrowhead at (child.topX, childTopY)
        const arrowPts = `${child.topX - 16},${childTopY - 42} ${child.topX + 16},${childTopY - 42} ${child.topX},${childTopY}`;
        container.appendChild(
          createSvgEl('polygon', {
            points: arrowPts,
            fill: cColor
          })
        );
      }
    }
  }

  // Draw an individual Person Node (Male + Wives OR Female + Husband)
  function drawPersonNode(node) {
    const gy = getGenBaselineY(node.generation);
    const isSelected = node.id === selectedNodeId;
    const isLineage = highlightedIds.has(node.id);

    const g = createSvgEl('g', {
      class: `svg-node-group ${isSelected ? 'selected' : ''} ${isLineage ? 'lineage-active' : ''}`,
      'data-id': node.id
    });

    g.addEventListener('click', e => {
      e.stopPropagation();
      selectMember(node.id, false);
    });

    if (node.type === 'male') {
      drawMaleNodeAndWives(g, node, gy);
    } else {
      drawFemaleNodeAndHusband(g, node, gy);
    }

    return g;
  }

  // Render Male horizontal box + Wife boxes stacked underneath
  function drawMaleNodeAndWives(g, node, gy) {
    const cx = node.topX;
    const isGen1 = Number(node.generation) === 1;
    const boxW = isGen1 ? 2250 : 810;
    const boxH = 324;
    const boxX = cx - boxW / 2;
    const boxY = gy - 162;
    const divY = gy + 54;
    const maxHorzSpan = boxW - 90; // 720 for standard 810-wide boxes (45px padding each side)

    // 1. Branch Code above top-left of box, cleanly left of center drop line (e.g. V.1, VI.4, X.10, XI.20)
    if (node.code) {
      g.appendChild(
        createSvgEl(
          'text',
          {
            x: cx - 55,
            y: boxY - 28,
            'text-anchor': 'end',
            fill: '#0f172a',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': 80,
            'font-weight': '600'
          },
          node.code
        )
      );
    }

    // 2. Male Box Outer Rectangle
    g.appendChild(
      createSvgEl('rect', {
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        fill: '#ffffff',
        stroke: '#0f172a',
        'stroke-width': 7,
        class: 'node-box-rect'
      })
    );

    // Horizontal divider between Name and G./S:
    g.appendChild(
      createSvgEl('line', {
        x1: boxX,
        y1: divY,
        x2: boxX + boxW,
        y2: divY,
        stroke: '#0f172a',
        'stroke-width': 6
      })
    );

    // Male Name (Red Uppercase, auto-sized to fit inside upper compartment)
    const nameStr = node.name || '';
    const nameCenterY = boxY + 108; // vertical center of 216-high upper compartment
    const maleFontSize = isGen1
      ? computeInitialFontSize(nameStr, maxHorzSpan, 152, 90)
      : computeInitialFontSize(nameStr, maxHorzSpan, 114, 70);

    g.appendChild(
      createSvgEl(
        'text',
        {
          x: cx,
          y: Math.round(nameCenterY + maleFontSize * 0.35),
          'text-anchor': 'middle',
          fill: '#dc2626',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': maleFontSize,
          'font-weight': '700',
          'data-max-span': maxHorzSpan,
          'data-orient': 'h',
          'data-cy': nameCenterY
        },
        nameStr
      )
    );

    // Male Date (G. in black centered, or S: in blue near center)
    const dateStr = node.gio || node.sinh || '';
    if (dateStr) {
      const isSinh = dateStr.startsWith('S:');
      const isBareSinh = isSinh && dateStr.trim() === 'S:';
      const dateCenterY = divY + 54; // vertical center of 108-high lower compartment
      const dateFontSize = computeInitialFontSize(dateStr, maxHorzSpan, isSinh ? 86 : 92, 66);
      g.appendChild(
        createSvgEl(
          'text',
          {
            x: isBareSinh ? cx - 35 : cx,
            y: Math.round(dateCenterY + dateFontSize * 0.35),
            'text-anchor': isBareSinh ? 'start' : 'middle',
            fill: isSinh ? '#1d4ed8' : '#0f172a',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': dateFontSize,
            'font-weight': '600',
            'data-max-span': maxHorzSpan,
            'data-orient': 'h',
            'data-cy': dateCenterY
          },
          dateStr
        )
      );
    }

    // 3. Wife Boxes below Male Box
    const wives =
      node.spouses && node.spouses.length > 0
        ? node.spouses
        : node.generation >= 10 && node.generation <= 13 && !node.gio
        ? [{ name: '', gio: '', sinh: 'S:', x: cx }]
        : [];

    if (wives.length > 0) {
      const maleBottomY = boxY + boxH; // gy + 162
      const wifeTopY = gy + 378;
      const midMarriageY = gy + 270;

      if (wives.length === 1) {
        const wx = wives[0].x || cx;
        if (Math.abs(wx - cx) <= 10) {
          g.appendChild(
            createSvgEl('line', {
              x1: cx,
              y1: maleBottomY,
              x2: cx,
              y2: wifeTopY,
              stroke: '#0f172a',
              'stroke-width': 7
            })
          );
        } else {
          g.appendChild(
            createSvgEl('polyline', {
              points: `${cx},${maleBottomY} ${cx},${midMarriageY} ${wx},${midMarriageY} ${wx},${wifeTopY}`,
              fill: 'none',
              stroke: '#0f172a',
              'stroke-width': 7
            })
          );
        }
      } else {
        // Multiple wives connected via horizontal bar at midMarriageY
        const allWX = [cx, ...wives.map(w => w.x || cx)];
        const minWX = Math.min(...allWX);
        const maxWX = Math.max(...allWX);

        g.appendChild(
          createSvgEl('line', {
            x1: cx,
            y1: maleBottomY,
            x2: cx,
            y2: midMarriageY,
            stroke: '#0f172a',
            'stroke-width': 7
          })
        );
        g.appendChild(
          createSvgEl('line', {
            x1: minWX,
            y1: midMarriageY,
            x2: maxWX,
            y2: midMarriageY,
            stroke: '#0f172a',
            'stroke-width': 7
          })
        );
        for (const w of wives) {
          const wx = w.x || cx;
          g.appendChild(
            createSvgEl('line', {
              x1: wx,
              y1: midMarriageY,
              x2: wx,
              y2: wifeTopY,
              stroke: '#0f172a',
              'stroke-width': 7
            })
          );
        }
      }

      // Draw each wife's box
      for (const w of wives) {
        const wx = w.x || cx;
        const wBoxW = isGen1 ? 2250 : 810;
        const wBoxX = wx - wBoxW / 2;
        const wDivY = gy + 594;
        const wMaxSpan = wBoxW - 90;

        g.appendChild(
          createSvgEl('rect', {
            x: wBoxX,
            y: wifeTopY,
            width: wBoxW,
            height: boxH,
            fill: '#ffffff',
            stroke: '#0f172a',
            'stroke-width': 7,
            class: 'node-box-rect'
          })
        );

        g.appendChild(
          createSvgEl('line', {
            x1: wBoxX,
            y1: wDivY,
            x2: wBoxX + wBoxW,
            y2: wDivY,
            stroke: '#0f172a',
            'stroke-width': 6
          })
        );

        if (w.name) {
          const wNameCenterY = wifeTopY + 108;
          const wFontSize = isGen1
            ? computeInitialFontSize(w.name, wMaxSpan, 144, 86)
            : computeInitialFontSize(w.name, wMaxSpan, 110, 68);
          g.appendChild(
            createSvgEl(
              'text',
              {
                x: wx,
                y: Math.round(wNameCenterY + wFontSize * 0.35),
                'text-anchor': 'middle',
                fill: '#dc2626',
                'font-family': "'Be Vietnam Pro', Arial, sans-serif",
                'font-size': wFontSize,
                'font-weight': '600',
                'data-max-span': wMaxSpan,
                'data-orient': 'h',
                'data-cy': wNameCenterY
              },
              w.name
            )
          );
        }

        const wDate = w.gio || w.sinh || '';
        if (wDate) {
          const isWSinh = wDate.startsWith('S:');
          const isBareWSinh = isWSinh && wDate.trim() === 'S:';
          const wDateCenterY = wDivY + 54;
          const wDateFontSize = computeInitialFontSize(wDate, wMaxSpan, isWSinh ? 86 : 92, 66);
          g.appendChild(
            createSvgEl(
              'text',
              {
                x: isBareWSinh ? wx - 35 : wx,
                y: Math.round(wDateCenterY + wDateFontSize * 0.35),
                'text-anchor': isBareWSinh ? 'start' : 'middle',
                fill: isWSinh ? '#1d4ed8' : '#0f172a',
                'font-family': "'Be Vietnam Pro', Arial, sans-serif",
                'font-size': wDateFontSize,
                'font-weight': '600',
                'data-max-span': wMaxSpan,
                'data-orient': 'h',
                'data-cy': wDateCenterY
              },
              wDate
            )
          );
        }
      }
    }
  }

  // Render Female vertical box (rotated -90 deg) + Husband (Son-in-law) vertical box
  function drawFemaleNodeAndHusband(g, node, gy) {
    const cx = node.topX;
    const colW = 216;
    const boxH = 864;
    const topY = gy - 162;
    const bottomY = topY + boxH; // gy + 702
    const dBoxX = cx - colW / 2;
    const maxVertSpan = boxH - 96; // 768 units max text length (48px padding top & bottom)

    // 1. Daughter Vertical Box (clean single compartment matching original CAD)
    g.appendChild(
      createSvgEl('rect', {
        x: dBoxX,
        y: topY,
        width: colW,
        height: boxH,
        fill: '#ffffff',
        stroke: '#0f172a',
        'stroke-width': 7,
        class: 'node-box-rect'
      })
    );

    // Daughter Vertical Name (Rotated -90 deg around center of box)
    const textCenterY = (topY + bottomY) / 2;
    const dName = node.name || '';
    const dFontSize = computeInitialFontSize(dName, maxVertSpan, 108, 68);
    const dCenterOffsetX = node.gio ? cx - 42 : cx;
    const textX = Math.round(dCenterOffsetX + dFontSize * 0.34);

    const dTextAttrs = {
      x: textX,
      y: textCenterY,
      'text-anchor': 'middle',
      fill: '#1d4ed8',
      'font-family': "'Be Vietnam Pro', Arial, sans-serif",
      'font-size': dFontSize,
      'font-weight': '600',
      transform: `rotate(-90 ${textX} ${textCenterY})`,
      'data-max-span': maxVertSpan,
      'data-orient': 'v',
      'data-cx': dCenterOffsetX,
      'data-cy': textCenterY
    };
    g.appendChild(createSvgEl('text', dTextAttrs, dName));

    // If daughter has a G. death anniversary (e.g. Ng. T. Trình G. 21/12 or Ng. Thị Chạy* G. 6/12)
    if (node.gio) {
      const gioCenterX = cx + 52;
      const gioFontSize = computeInitialFontSize(node.gio, maxVertSpan, 88, 66);
      const gioX = Math.round(gioCenterX + gioFontSize * 0.34);
      g.appendChild(
        createSvgEl(
          'text',
          {
            x: gioX,
            y: textCenterY,
            'text-anchor': 'middle',
            fill: '#0f172a',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': gioFontSize,
            'font-weight': '600',
            transform: `rotate(-90 ${gioX} ${textCenterY})`,
            'data-max-span': maxVertSpan,
            'data-orient': 'v',
            'data-cx': gioCenterX,
            'data-cy': textCenterY
          },
          node.gio
        )
      );
    }

    // 2. Husband / Son-in-Law Vertical Box (if married OR has empty husband box in original CAD)
    const husband = node.spouses && node.spouses[0] && node.spouses[0].name ? node.spouses[0] : null;
    if (husband || node.hasHusbandBox) {
      const gap = 68;
      const hBoxX = dBoxX + colW + gap;
      const hCenterX = hBoxX + colW / 2;
      const midY = gy + 270;

      // Short horizontal marriage link between Daughter box and Husband box
      g.appendChild(
        createSvgEl('line', {
          x1: dBoxX + colW,
          y1: midY,
          x2: hBoxX,
          y2: midY,
          stroke: '#0f172a',
          'stroke-width': 7
        })
      );

      // Husband Vertical Box
      g.appendChild(
        createSvgEl('rect', {
          x: hBoxX,
          y: topY,
          width: colW,
          height: boxH,
          fill: '#ffffff',
          stroke: '#0f172a',
          'stroke-width': 7,
          class: 'node-box-rect'
        })
      );

      if (husband && husband.name) {
        const hName = husband.name.toUpperCase();
        const hFontSize = computeInitialFontSize(hName, maxVertSpan, 104, 68);
        const hTextX = Math.round(hCenterX + hFontSize * 0.34);
        const hTextAttrs = {
          x: hTextX,
          y: textCenterY,
          'text-anchor': 'middle',
          fill: '#1d4ed8',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': hFontSize,
          'font-weight': '700',
          transform: `rotate(-90 ${hTextX} ${textCenterY})`,
          'data-max-span': maxVertSpan,
          'data-orient': 'v',
          'data-cx': hCenterX,
          'data-cy': textCenterY
        };
        g.appendChild(createSvgEl('text', hTextAttrs, hName));
      }
    }
  }

  // =========================================================================
  // MẪU 2: CÂY ĐẠI THỤ — HÌNH THÁI PHÂN CẤP TỰ NHIÊN TỪ GỐC ĐẾN LÁ
  // • Đời 1: Gốc cây (Rễ đại thụ bám đồi cỏ)
  // • Đời 2, 3: Thân cây
  // • Đời 4: Cành lớn (03 nhánh lớn: Cụ Hữu Bằng, Cụ Hữu Điều, Cụ Công Lê)
  // • Đời 5, 6: Cành nhỏ (Đời 5 có nhánh lớn tương đương của cụ CÔNG NHÀ - Phái Giáp
  //   ngang hàng với cụ NHƯ HẠ + nhánh Con gái; Đời 6 là cụ NHƯ PHIẾN)
  // • Đời 7: Nhánh lớn (Cụ Như Thịnh, Cụ Văn Tống, Bà Ng. T. Trình)
  // • Đời 8, 9: Nhánh vừa
  // • Đời 10, 11: Nhánh nhỏ
  // • Từ Đời 12 trở đi (Đời 12, 13, 14+): Lá tiếp nối lá bằng các đường nối mềm mại
  // =========================================================================

  const BANYAN_RING_RADII = {
    7: { rx: 2000, ry: 2000, r: 2000, sweep: 85, minSep: 580 },
    8: { rx: 3600, ry: 3600, r: 3600, sweep: 90, minSep: 520 },
    9: { rx: 5200, ry: 5200, r: 5200, sweep: 95, minSep: 380 },
    10: { rx: 6800, ry: 6800, r: 6800, sweep: 98, minSep: 340 },
    11: { rx: 8400, ry: 8400, r: 8400, sweep: 100, minSep: 320 },
    12: { rx: 10000, ry: 10000, r: 10000, sweep: 102, minSep: 320 },
    13: { rx: 11600, ry: 11600, r: 11600, sweep: 102, minSep: 340 },
    14: { rx: 13200, ry: 13200, r: 13200, sweep: 102, minSep: 340 }
  };

  function getBanyanRingInfo(gen) {
    if (BANYAN_RING_RADII[gen]) return BANYAN_RING_RADII[gen];
    const extra = Number(gen) - 14;
    const r = 13200 + extra * 1600;
    return {
      rx: r,
      ry: r,
      r,
      sweep: 102,
      minSep: 340
    };
  }

  function getGenAnatomyLabel(gen) {
    const g = Number(gen);
    if (g === 1) return 'GỐC ĐẠI THỤ';
    if (g === 2 || g === 3) return 'THÂN ĐẠI THỤ';
    if (g === 4) return 'CÀNH LỚN';
    if (g === 5 || g === 6) return 'CÀNH NHỎ';
    if (g === 7) return 'NHÁNH LỚN';
    if (g === 8 || g === 9) return 'NHÁNH VỪA';
    if (g === 10 || g === 11) return 'NHÁNH NHỎ';
    return 'LÁ ĐẠI THỤ';
  }

  // Helper: Convert concentric polar (radius R, angleDeg where 0° is straight UP) to SVG (x, y)
  function polarToBanyanXY(radius, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return {
      x: Math.round(BANYAN_CX + radius * Math.sin(rad)),
      y: Math.round(BANYAN_CY - radius * Math.cos(rad))
    };
  }

  // Compute Concentric & Fixed Coordinates (banyanX, banyanY, banyanRadius, banyanAngle, banyanLeafAngle, banyanRole)
  function computeBanyanLayout() {
    const nodes = familyData.nodes;
    if (!nodes || nodes.length === 0) return;

    // Assign sibling birth order (1, 2, 3...) within each parent
    const byParent = new Map();
    for (const n of nodes) {
      const key = n.parentId || '__ROOT__';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(n);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => (a.topX || 0) - (b.topX || 0));
      list.forEach((child, idx) => {
        child.siblingOrder = idx + 1;
        child.siblingTotal = list.length;
      });
    }

    // 1. Gốc (Đời 1), Thân (Đời 2, 3), Cành lớn (Đời 4 - 03 nhánh gọn), Cành nhỏ (Đời 5, 6 - nhánh Công Nhà & Con gái gọn)
    const baseLevels = {
      1: { y: 19520, role: 'root-base' },
      2: { y: 18320, role: 'trunk-lower' },
      3: { y: 17140, role: 'trunk-upper' },
      4: { y: 15960, role: 'bough-large' },
      5: { y: 14780, role: 'bough-small' },
      6: { y: 13600, role: 'bough-small-upper' }
    };

    for (let g = 1; g <= 6; g++) {
      const gNodes = nodes
        .filter(n => Number(n.generation) === g)
        .sort((a, b) => (a.topX || 0) - (b.topX || 0));
      if (gNodes.length === 0) continue;

      if (g <= 3 || g === 6) {
        gNodes.forEach((n, idx) => {
          n.banyanRole = idx === 0 ? baseLevels[g].role : 'bough-side';
          n.banyanX = BANYAN_CX + idx * 2100;
          n.banyanY = baseLevels[g].y;
          n.banyanRadius = 0;
          n.banyanAngle = 0;
          n.banyanLeafAngle = 0;
        });
      } else if (g === 4) {
        // Đời 4: 03 nhánh lớn (Hữu Bằng - Trái, Hữu Điều - Giữa, Công Lê - Phải) — thu gọn gần thân chính
        const mainNode =
          gNodes.find(n => n.id === 'N5') ||
          gNodes.find(n => nodes.some(c => c.parentId === n.id)) ||
          gNodes[Math.floor(gNodes.length / 2)];
        let leftIdx = 0;
        let rightIdx = 0;
        for (const n of gNodes) {
          if (n.id === mainNode.id) {
            n.banyanRole = 'bough-large-center';
            n.banyanX = BANYAN_CX;
            n.banyanY = 15960;
            n.banyanRadius = 0;
            n.banyanAngle = 0;
            n.banyanLeafAngle = 0;
          } else if ((n.topX || 0) < (mainNode.topX || 0)) {
            leftIdx++;
            n.banyanRole = 'bough-large-left';
            n.banyanX = BANYAN_CX - 2380 - (leftIdx - 1) * 2000;
            n.banyanY = 15800 - (leftIdx - 1) * 250;
            n.banyanRadius = 0;
            n.banyanAngle = -55;
            n.banyanLeafAngle = -55;
          } else {
            rightIdx++;
            n.banyanRole = 'bough-large-right';
            n.banyanX = BANYAN_CX + 2380 + (rightIdx - 1) * 2000;
            n.banyanY = 15800 - (rightIdx - 1) * 250;
            n.banyanRadius = 0;
            n.banyanAngle = 55;
            n.banyanLeafAngle = 55;
          }
        }
      } else if (g === 5) {
        // Đời 5: Cụ CÔNG NHÀ (trái), Cụ NHƯ HẠ (giữa), Con gái (phải) — thu gọn gần thân chính
        const mainNode =
          gNodes.find(n => n.id === 'N8') ||
          gNodes.find(n => nodes.some(c => c.parentId === n.id)) ||
          gNodes[Math.floor(gNodes.length / 2)];
        let leftIdx = 0;
        let rightIdx = 0;
        for (const n of gNodes) {
          if (n.id === mainNode.id) {
            n.banyanRole = 'bough-small-center';
            n.banyanX = BANYAN_CX;
            n.banyanY = 14780;
            n.banyanRadius = 0;
            n.banyanAngle = 0;
            n.banyanLeafAngle = 0;
          } else if ((n.topX || 0) < (mainNode.topX || 0)) {
            leftIdx++;
            n.banyanRole = 'bough-small-left-major';
            n.banyanX = BANYAN_CX - 2320 - (leftIdx - 1) * 2000;
            n.banyanY = 14600 - (leftIdx - 1) * 250;
            n.banyanRadius = 0;
            n.banyanAngle = -52;
            n.banyanLeafAngle = -52;
          } else {
            rightIdx++;
            n.banyanRole = 'bough-small-right-female';
            n.banyanX = BANYAN_CX + 2080 + (rightIdx - 1) * 1800;
            n.banyanY = 14650 - (rightIdx - 1) * 250;
            n.banyanRadius = 0;
            n.banyanAngle = 52;
            n.banyanLeafAngle = 52;
          }
        }
      }
    }

    // 2. Concentric Ring Layout for Đời 7 .. maxGen (Vòng đồng tâm cố định & liền mạch):
    //    • Đời 7: Nhánh lớn (R = 2000)
    //    • Đời 8, 9: Nhánh vừa (R = 3600, 5200)
    //    • Đời 10, 11: Nhánh nhỏ (R = 6800, 8400)
    //    • Từ Đời 12 trở đi: Lá đại thụ (R = 10000, 11600, 13200...)
    const maxGen = Math.max(14, ...nodes.map(n => Number(n.generation) || 1));

    // Exact bottom-up angular span calculation so EVERY parent sits at the exact center of its children
    // and NO branch ever crosses or slants sideways across another family!
    function computeSpanUnits(n) {
      const g = Number(n.generation) || 7;
      const ch = nodes
        .filter(c => c.parentId === n.id)
        .sort((a, b) => (a.topX || 0) - (b.topX || 0));
      if (g >= 12) {
        ch.forEach(c => computeSpanUnits(c));
        n._spanU = ch.length > 0 ? 1.55 : 1.35;
        return n._spanU;
      }
      const selfU = g <= 8 ? 2.6 : g === 9 ? 2.2 : g === 10 ? 1.75 : 1.5;
      if (ch.length === 0) {
        n._spanU = selfU;
        return n._spanU;
      }
      let sum = 0;
      for (const c of ch) sum += computeSpanUnits(c);
      n._spanU = Math.max(selfU, sum + (ch.length > 1 ? 0.32 : 0.14));
      return n._spanU;
    }

    const g7Nodes = nodes
      .filter(n => Number(n.generation) === 7)
      .sort((a, b) => (a.topX || 0) - (b.topX || 0));
    for (const n of g7Nodes) computeSpanUnits(n);

    let dfsOrderCounter = 0;
    function assignExactConcentricAngles(list, startAng, endAng) {
      const sumU = list.reduce((s, n) => s + (n._spanU || 1), 0) || 1;
      let cur = startAng;
      for (const n of list) {
        n._dfsOrder = ++dfsOrderCounter;
        const gNum = Number(n.generation) || 7;
        n.banyanRole =
          gNum === 7
            ? 'branch-large'
            : gNum <= 9
            ? 'branch-medium'
            : gNum <= 11
            ? 'branch-small'
            : 'canopy-leaf';

        const span = (endAng - startAng) * ((n._spanU || 1) / sumU);
        const ch = nodes
          .filter(c => c.parentId === n.id)
          .sort((a, b) => (a.topX || 0) - (b.topX || 0));
        if (ch.length > 0) {
          const pad = Math.min(span * 0.025, 0.28);
          assignExactConcentricAngles(ch, cur + pad, cur + span - pad);
          // Parent angle is the exact midpoint between its first and last child
          n.banyanAngle = (ch[0].banyanAngle + ch[ch.length - 1].banyanAngle) / 2;
        } else {
          n.banyanAngle = cur + span / 2;
        }
        cur += span;
      }
    }

    assignExactConcentricAngles(g7Nodes, -104, 104);

    // Keep inner-ring branches (Gen 7 Nhánh lớn & Gen 8 Nhánh vừa) in a balanced, upright Y-fork posture
    // matching the natural main tree crotch (Circle 1 & Circle 2 in the natural tree reference)
    const n11 = nodes.find(x => x.id === 'N11'); // NHƯ THỊNH (Gen 7 Trái)
    const n12 = nodes.find(x => x.id === 'N12'); // VĂN TỐNG (Gen 7 Phải)
    const n13 = nodes.find(x => x.id === 'N13'); // Ng. T. Trình (Gen 7 Nữ)
    const n14 = nodes.find(x => x.id === 'N14'); // HỮU THANH (Gen 8)
    const n15 = nodes.find(x => x.id === 'N15'); // VĂN QUYNH (Gen 8)
    const n16 = nodes.find(x => x.id === 'N16'); // VĂN LƯƠNG (Gen 8)
    const n17 = nodes.find(x => x.id === 'N17'); // VĂN GIẢNG (Gen 8)

    if (n14 && n15 && n11) {
      n15.banyanAngle = -38;
      n14.banyanAngle = -66;
      n11.banyanAngle = -32;
    }
    if (n16 && n17 && n12 && n13) {
      n16.banyanAngle = 54;
      n17.banyanAngle = 74;
      n12.banyanAngle = 38;
      n13.banyanAngle = 62;
    }

    // Gentle minimum-distance relaxation on rings 9..12 so taller branch boxes & wider Bodhi leaves never overlap
    const relaxRingSeparation = (genNum, minArcPx) => {
      const { r } = getBanyanRingInfo(genNum);
      const reqDeg = (minArcPx / r) * (180 / Math.PI);
      const gNodes = nodes
        .filter(n => Number(n.generation) === genNum)
        .sort((a, b) => (a._dfsOrder || 0) - (b._dfsOrder || 0));
      if (gNodes.length <= 1) return;
      for (let iter = 0; iter < 50; iter++) {
        for (let i = 0; i < gNodes.length - 1; i++) {
          const diff = gNodes[i + 1].banyanAngle - gNodes[i].banyanAngle;
          if (diff < reqDeg) {
            const mid = (gNodes[i].banyanAngle + gNodes[i + 1].banyanAngle) / 2;
            gNodes[i].banyanAngle = mid - reqDeg / 2;
            gNodes[i + 1].banyanAngle = mid + reqDeg / 2;
          }
        }
        if (gNodes[0].banyanAngle < -105) gNodes[0].banyanAngle = -105;
        if (gNodes[gNodes.length - 1].banyanAngle > 105) {
          gNodes[gNodes.length - 1].banyanAngle = 105;
        }
      }
    };

    relaxRingSeparation(9, 340);
    relaxRingSeparation(10, 330);
    relaxRingSeparation(11, 325);
    relaxRingSeparation(12, 395);

    // Center Gen 13+ leaves symmetrically right in front of their parent leaf tip, then ensure wide Bodhi clearance
    for (let g = 13; g <= maxGen; g++) {
      const gNodes = nodes.filter(n => Number(n.generation) === g);
      const byP = new Map();
      for (const n of gNodes) {
        if (!byP.has(n.parentId)) byP.set(n.parentId, []);
        byP.get(n.parentId).push(n);
      }
      for (const [pid, list] of byP.entries()) {
        const p = nodes.find(x => x.id === pid);
        if (!p) continue;
        list.sort((a, b) => (a.topX || 0) - (b.topX || 0));
        list.forEach((c, idx) => {
          c.banyanAngle = (p.banyanAngle || 0) + (idx - (list.length - 1) / 2) * 2.35;
        });
      }
      relaxRingSeparation(g, 395);
    }

    // Compute exact concentric circular coordinates (banyanX, banyanY) for all Canopy Generations (Đời 7 .. maxGen)
    for (let g = 7; g <= maxGen; g++) {
      const gNodes = nodes.filter(n => Number(n.generation) === g);
      const { r } = getBanyanRingInfo(g);
      for (const n of gNodes) {
        if (n.banyanAngle === undefined || isNaN(n.banyanAngle)) n.banyanAngle = 0;
        const pt = polarToBanyanXY(r, n.banyanAngle);
        n.banyanRadius = r;
        n.banyanX = pt.x;
        n.banyanY = pt.y;
        // Strict radial alignment on concentric circle guarantees 100% seamless branch entry/exit
        n.banyanLeafAngle = n.banyanAngle;
      }
    }
  }

  // Helper: Generate a filled, smoothly tapering organic Cubic Bézier branch polygon
  function createTaperedBranchPath(x0, y0, x1, y1, x2, y2, x3, y3, wStart, wEnd, samples = 14) {
    const leftPts = [];
    const rightPts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const mt = 1 - t;
      const bx =
        mt * mt * mt * x0 +
        3 * mt * mt * t * x1 +
        3 * mt * t * t * x2 +
        t * t * t * x3;
      const by =
        mt * mt * mt * y0 +
        3 * mt * mt * t * y1 +
        3 * mt * t * t * y2 +
        t * t * t * y3;
      const dx =
        3 * mt * mt * (x1 - x0) +
        6 * mt * t * (x2 - x1) +
        3 * t * t * (x3 - x2);
      const dy =
        3 * mt * mt * (y1 - y0) +
        6 * mt * t * (y2 - y1) +
        3 * t * t * (y3 - y2);
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const halfW = (wStart + (wEnd - wStart) * Math.pow(t, 0.82)) / 2;
      leftPts.push(`${Math.round(bx + nx * halfW)},${Math.round(by + ny * halfW)}`);
      rightPts.unshift(`${Math.round(bx - nx * halfW)},${Math.round(by - ny * halfW)}`);
    }
    return `M ${leftPts.join(' L ')} L ${rightPts.join(' L ')} Z`;
  }

  // Helper: Draw a 3D Wooden Branch Segment (Outer bark polygon + Inner cambium highlight + Bark ridges)
  function drawOrganicWoodBranch(
    container,
    x0,
    y0,
    x1,
    y1,
    x2,
    y2,
    x3,
    y3,
    wStart,
    wEnd,
    isHighlighted = false,
    samples = 14
  ) {
    const polyD = createTaperedBranchPath(x0, y0, x1, y1, x2, y2, x3, y3, wStart, wEnd, samples);
    const outerFill = isHighlighted ? '#f59e0b' : 'url(#banyanWoodBranchGrad)';
    const outerStroke = isHighlighted ? '#b45309' : '#2b180c';

    container.appendChild(
      createSvgEl('path', {
        d: polyD,
        fill: outerFill,
        stroke: outerStroke,
        'stroke-width': Math.max(4, Math.min(9, wStart * 0.14)),
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })
    );

    // Inner 3D heartwood/bark highlight spine along the branch centerline
    if (wStart >= 14) {
      const spineW = Math.max(3, (wStart + wEnd) * 0.22);
      container.appendChild(
        createSvgEl('path', {
          d: `M ${Math.round(x0)} ${Math.round(y0)} C ${Math.round(x1)} ${Math.round(y1)}, ${Math.round(x2)} ${Math.round(y2)}, ${Math.round(x3)} ${Math.round(y3)}`,
          fill: 'none',
          stroke: isHighlighted ? '#fef08a' : '#d6b892',
          'stroke-width': spineW,
          'stroke-linecap': 'round',
          opacity: isHighlighted ? '0.88' : '0.48'
        })
      );
    }
  }

  // Helper: Draw a Decorative Symbolic Bodhi Leaf (Lá Bồ Đề) on Unexpanded Collateral Branches (Đời 4 & Đời 5)
  function drawSymbolicFoliageLeaf(container, x, y, rotDeg, scale = 1.0, isGold = false) {
    const g = createSvgEl('g', {
      transform: `translate(${Math.round(x)} ${Math.round(y)}) rotate(${Math.round(rotDeg)}) scale(${scale})`
    });
    // Wide heart-shaped Bodhi leaf silhouette (Ficus religiosa) with petiole & elongated tip
    g.appendChild(
      createSvgEl('path', {
        d: 'M -180 0 Q -150 0 -122 0 M -122 0 C -138 -64, -95 -128, -22 -122 C 42 -118, 96 -72, 145 -24 C 165 -6, 178 -2, 192 0 C 178 2, 165 6, 145 24 C 96 72, 42 118, -22 122 C -95 128, -138 64, -122 0 Z',
        fill: isGold ? 'url(#bodhiGoldLeafGrad)' : 'url(#bodhiMaleLeafGrad)',
        stroke: isGold ? '#b45309' : '#1e4620',
        'stroke-width': 8,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })
    );
    g.appendChild(
      createSvgEl('path', {
        d: 'M -112 0 L 165 0 M -72 0 Q -48 -52 -6 -76 M -72 0 Q -48 52 -6 76 M -10 0 Q 25 -46 66 -62 M -10 0 Q 25 46 66 62 M 50 0 Q 82 -26 112 -34 M 50 0 Q 82 26 112 34',
        fill: 'none',
        stroke: isGold ? '#d97706' : '#3f6212',
        'stroke-width': 4,
        'stroke-linecap': 'round',
        opacity: '0.62'
      })
    );
    container.appendChild(g);
  }

  // Render Mẫu 2: Cây Đại Thụ (Từ Gốc -> Thân -> Cành lớn -> Cành nhỏ -> Nhánh lớn -> Nhánh vừa -> Nhánh nhỏ -> Lá nối lá)
  function renderCayDaiThu() {
    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));

    // 0. Rich Botanical Gradients & Wood/Leaf Styles
    const defsGroup = createSvgEl('defs', { id: 'banyanDefs' });
    defsGroup.innerHTML = `
      <linearGradient id="banyanSkyParchmentGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fbf8f1" />
        <stop offset="60%" stop-color="#f6f0e2" />
        <stop offset="100%" stop-color="#efe5cf" />
      </linearGradient>
      <radialGradient id="banyanSunlitCanopyGrad" cx="50%" cy="46%" r="52%">
        <stop offset="0%" stop-color="#f7fee7" stop-opacity="0.88" />
        <stop offset="55%" stop-color="#dcfce7" stop-opacity="0.58" />
        <stop offset="88%" stop-color="#bbf7d0" stop-opacity="0.34" />
        <stop offset="100%" stop-color="#86efac" stop-opacity="0.12" />
      </radialGradient>
      <radialGradient id="banyanClusterFoliageGrad" cx="50%" cy="45%" r="50%">
        <stop offset="0%" stop-color="#ecfccb" stop-opacity="0.55" />
        <stop offset="65%" stop-color="#bbf7d0" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="banyanTrunk3DGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#3b2212" />
        <stop offset="18%" stop-color="#654321" />
        <stop offset="46%" stop-color="#8b6343" />
        <stop offset="70%" stop-color="#704d32" />
        <stop offset="88%" stop-color="#52351e" />
        <stop offset="100%" stop-color="#331d0e" />
      </linearGradient>
      <linearGradient id="banyanWoodBranchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#654321" />
        <stop offset="50%" stop-color="#855e3e" />
        <stop offset="100%" stop-color="#472c18" />
      </linearGradient>
      <linearGradient id="banyanPlaqueGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fffbeb" />
        <stop offset="100%" stop-color="#fde68a" />
      </linearGradient>
      <linearGradient id="banyanBranchMajorNodeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fffbeb" />
        <stop offset="55%" stop-color="#fef3c7" />
        <stop offset="100%" stop-color="#fde68a" />
      </linearGradient>
      <linearGradient id="banyanBranchMedNodeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#fdfbf7" />
        <stop offset="55%" stop-color="#f7eedd" />
        <stop offset="100%" stop-color="#ead6b8" />
      </linearGradient>
      <linearGradient id="banyanBranchSmallNodeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#ffffff" />
        <stop offset="60%" stop-color="#f9f3e8" />
        <stop offset="100%" stop-color="#eee1cb" />
      </linearGradient>
      <linearGradient id="banyanBranchFemaleNodeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc" />
        <stop offset="60%" stop-color="#eff6ff" />
        <stop offset="100%" stop-color="#dbeafe" />
      </linearGradient>
      <linearGradient id="bodhiGoldLeafGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#fef08a" />
        <stop offset="45%" stop-color="#fffbeb" />
        <stop offset="100%" stop-color="#bef264" />
      </linearGradient>
      <linearGradient id="bodhiMaleLeafGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#d9f99d" />
        <stop offset="45%" stop-color="#f7fee7" />
        <stop offset="100%" stop-color="#bbf7d0" />
      </linearGradient>
      <linearGradient id="bodhiFemaleLeafGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#ccfbf1" />
        <stop offset="45%" stop-color="#f0fdf4" />
        <stop offset="100%" stop-color="#bae6fd" />
      </linearGradient>
    `;
    viewportGroup.appendChild(defsGroup);

    // 1. Traditional Heritage Outer Scroll Frame
    const frameGroup = createSvgEl('g', { id: 'banyanScrollFrame' });
    frameGroup.appendChild(
      createSvgEl('rect', {
        x: 360,
        y: 360,
        width: 29280,
        height: 20880,
        fill: 'url(#banyanSkyParchmentGrad)',
        stroke: '#1e1b18',
        'stroke-width': 30
      })
    );
    frameGroup.appendChild(
      createSvgEl('rect', {
        x: 440,
        y: 440,
        width: 29120,
        height: 20720,
        fill: 'none',
        stroke: '#78553a',
        'stroke-width': 9
      })
    );
    viewportGroup.appendChild(frameGroup);

    // 2. Scalloped Cloud-like Tree Crown Outline, Sky Clouds & Distant Hills (Theo đúng hình mẫu đính kèm)
    const canopyBgGroup = createSvgEl('g', { id: 'banyanCanopyCrown' });
    drawBanyanCanopyFoliageAndLandscape(canopyBgGroup, maxGen);
    viewportGroup.appendChild(canopyBgGroup);

    // 3. Gốc (Đời 1), Thân (Đời 2, 3), Cành lớn (Đời 4: 03 nhánh), Cành nhỏ (Đời 5, 6: có nhánh lớn cụ CÔNG NHÀ)
    const trunkAndBoughsGroup = createSvgEl('g', { id: 'banyanTrunkAndMajorBoughs' });
    drawBanyanRootTrunkAndBoughs(trunkAndBoughsGroup);
    viewportGroup.appendChild(trunkAndBoughsGroup);

    // 4. Hệ thống Nhánh lớn (Đời 7) -> Nhánh vừa (Đời 8, 9) -> Nhánh nhỏ (Đời 10, 11) -> Cuống lá Đời 12
    const branchesGroup = createSvgEl('g', { id: 'banyanBranches' });
    drawBanyanCanopyBranches(branchesGroup, maxGen);
    viewportGroup.appendChild(branchesGroup);

    // 5. Đường nối mềm mại từ Lá sang Lá (Từ Đời 12 -> Đời 13 -> Đời 14+)
    const softLinksGroup = createSvgEl('g', { id: 'banyanSoftLeafLinks' });
    drawSoftLeafToLeafConnectors(softLinksGroup);
    viewportGroup.appendChild(softLinksGroup);

    // 6. Các Đốt Nhánh (Đời 7..11: Nhánh lớn, Nhánh vừa, Nhánh nhỏ) & Các Lá (Từ Đời 12 trở đi)
    const nodesGroup = createSvgEl('g', { id: 'banyanCanopyNodes' });
    const canopyNodes = familyData.nodes.filter(n => Number(n.generation) >= 7);
    for (const node of canopyNodes) {
      if (Number(node.generation) <= 11) {
        nodesGroup.appendChild(drawBanyanBranchNode(node));
      } else {
        nodesGroup.appendChild(drawBanyanLeafNode(node));
      }
    }

    // 7. Generation Tier Navigation Badges (ĐỜI.7 .. ĐỜI.14) — Chỉ ghi "ĐỜI.g", bỏ phần "Nhánh ..."
    for (let g = 7; g <= maxGen; g++) {
      const { r } = getBanyanRingInfo(g);
      const badgeDeg = g === 7 ? 90 : g === 8 ? 94 : 104;
      const badgePt = polarToBanyanXY(r, badgeDeg);
      const lx = badgePt.x + 260;
      const ly = badgePt.y;

      const badgeG = createSvgEl('g', {
        style: 'cursor: pointer',
        class: 'banyan-gen-badge'
      });
      badgeG.addEventListener('click', () => focusGeneration(g));

      badgeG.appendChild(
        createSvgEl('rect', {
          x: lx - 170,
          y: ly - 56,
          width: 340,
          height: 112,
          rx: 28,
          fill: g <= 11 ? '#fef3c7' : '#dcfce7',
          stroke: g <= 11 ? '#92400e' : '#166534',
          'stroke-width': 5,
          opacity: '0.95'
        })
      );
      badgeG.appendChild(
        createSvgEl(
          'text',
          {
            x: lx,
            y: ly + 24,
            'text-anchor': 'middle',
            fill: g <= 11 ? '#9a3412' : '#14532d',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': 72,
            'font-weight': '800'
          },
          `ĐỜI.${g}`
        )
      );
      nodesGroup.appendChild(badgeG);
    }

    viewportGroup.appendChild(nodesGroup);

    // 8. Bottom Heritage Scroll Title Banner
    const titleBannerGroup = createSvgEl('g', { id: 'banyanTitleBanner' });
    titleBannerGroup.appendChild(
      createSvgEl('rect', {
        x: BANYAN_CX - 6600,
        y: 20420,
        width: 13200,
        height: 520,
        rx: 65,
        fill: '#fffbeb',
        stroke: '#78350f',
        'stroke-width': 12
      })
    );
    titleBannerGroup.appendChild(
      createSvgEl('rect', {
        x: BANYAN_CX - 6540,
        y: 20460,
        width: 13080,
        height: 440,
        rx: 48,
        fill: 'none',
        stroke: '#d97706',
        'stroke-width': 4,
        'stroke-dasharray': '40, 20'
      })
    );
    titleBannerGroup.appendChild(
      createSvgEl(
        'text',
        {
          x: BANYAN_CX,
          y: 20780,
          'text-anchor': 'middle',
          fill: '#7f1d1d',
          'font-family': "'Noto Serif', 'Be Vietnam Pro', serif",
          'font-size': 275,
          'font-weight': '800',
          'letter-spacing': '6'
        },
        'CÂY ĐẠI THỤ PHÁI ẤT CHI ẤT HỌ NGUYỄN PHÚC THÔN BÌNH AN'
      )
    );
    viewportGroup.appendChild(titleBannerGroup);

    // 9. Auto-fit all text elements inside plaques, branch nodes & leaves
    autoFitAllBoxTexts();
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        autoFitAllBoxTexts();
      });
    }

    updateStatsAndFilters();
  }

  // Draw Landscape, Concentric Generation Guide Rings & Scalloped Cloud-like Tree Crown Outline
  function drawBanyanCanopyFoliageAndLandscape(container, maxGen) {
    const cx = BANYAN_CX;
    const cy = BANYAN_CY;

    // 1. Sky Clouds & Sun
    const skyGroup = createSvgEl('g', { id: 'banyanSkyClouds' });
    skyGroup.appendChild(
      createSvgEl('path', {
        d: 'M 2100 3250 C 1750 3250, 1650 2850, 2050 2780 C 2120 2320, 2780 2250, 3020 2620 C 3350 2450, 3850 2620, 3820 2960 C 4180 2980, 4220 3250, 3850 3250 Z',
        fill: '#ffffff',
        stroke: '#334155',
        'stroke-width': 16,
        'stroke-linejoin': 'round',
        opacity: '0.88'
      })
    );
    skyGroup.appendChild(
      createSvgEl('circle', {
        cx: 26350,
        cy: 2380,
        r: 680,
        fill: '#fef08a',
        stroke: '#ca8a04',
        'stroke-width': 16,
        opacity: '0.85'
      })
    );
    skyGroup.appendChild(
      createSvgEl('path', {
        d: 'M 23900 3180 C 23550 3180, 23500 2840, 23880 2790 C 24020 2350, 24680 2300, 24980 2660 C 25320 2420, 25950 2480, 26120 2840 C 26450 2720, 26920 2850, 26950 3120 C 27320 3120, 27350 3380, 26920 3380 L 24100 3380 C 23750 3380, 23680 3180, 23900 3180 Z',
        fill: '#ffffff',
        stroke: '#334155',
        'stroke-width': 16,
        'stroke-linejoin': 'round',
        opacity: '0.92'
      })
    );
    container.appendChild(skyGroup);

    // 2. Distant Horizon Line & Background Hills
    const horizonGroup = createSvgEl('g', { id: 'banyanDistantHills' });
    horizonGroup.appendChild(
      createSvgEl('path', {
        d: `M 445 17850 Q 2100 16850 3950 17650 Q 5400 18150 6950 17600 Q 8600 17050 10600 18150 L 10600 18850 L 445 18850 Z`,
        fill: '#ede4d1',
        stroke: '#475569',
        'stroke-width': 14,
        'stroke-linejoin': 'round'
      })
    );
    horizonGroup.appendChild(
      createSvgEl('path', {
        d: `M 19400 18150 Q 21600 17150 23800 17650 Q 25400 18050 27200 17050 Q 28500 16550 29555 17350 L 29555 18850 L 19400 18850 Z`,
        fill: '#ede4d1',
        stroke: '#475569',
        'stroke-width': 14,
        'stroke-linejoin': 'round'
      })
    );
    horizonGroup.appendChild(
      createSvgEl('line', {
        x1: 445,
        y1: 18450,
        x2: 29555,
        y2: 18450,
        stroke: '#475569',
        'stroke-width': 14
      })
    );
    container.appendChild(horizonGroup);

    // 3. Scalloped Cloud-Like Outer Tree Crown Silhouette (Viền Vòm Tán Cây Đại Thụ Lượn Sóng)
    const crownCenterY = 12450;
    const crownRx = 14150;
    const crownRy = 11650;
    const numScallops = 40;
    const startDeg = -116;
    const endDeg = 116;
    const scallopPts = [];
    for (let i = 0; i <= numScallops; i++) {
      const deg = startDeg + ((endDeg - startDeg) * i) / numScallops;
      const rad = (deg * Math.PI) / 180;
      const wave = 1 + 0.018 * Math.cos(rad * 4);
      const px = Math.round(cx + crownRx * wave * Math.sin(rad));
      const py = Math.round(crownCenterY - crownRy * wave * Math.cos(rad));
      scallopPts.push({ x: px, y: py, rad });
    }

    const crownPathParts = [
      `M ${cx - 1350} 16550`,
      `Q ${cx - 3800} 16900 ${scallopPts[0].x} ${scallopPts[0].y}`
    ];
    for (let i = 0; i < scallopPts.length - 1; i++) {
      const p1 = scallopPts[i];
      const p2 = scallopPts[i + 1];
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const segLen = Math.hypot(dx, dy) || 1;
      const nx = dy / segLen;
      const ny = -dx / segLen;
      const bulge = 420;
      const ctrlX = Math.round(midX + nx * bulge);
      const ctrlY = Math.round(midY + ny * bulge);
      crownPathParts.push(`Q ${ctrlX} ${ctrlY} ${p2.x} ${p2.y}`);
    }
    crownPathParts.push(`Q ${cx + 3800} 16900 ${cx + 1350} 16550`);
    crownPathParts.push('Z');

    container.appendChild(
      createSvgEl('path', {
        d: crownPathParts.join(' '),
        fill: 'url(#banyanSunlitCanopyGrad)',
        stroke: '#1e3a1e',
        'stroke-width': 22,
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })
    );

    // 4. Concentric Generation Guide Rings (Vòng đồng tâm dẫn hướng từ Đời 7 đến Đời 14)
    const ringsGuideGroup = createSvgEl('g', { id: 'banyanConcentricGuides' });
    for (let g = 7; g <= maxGen; g++) {
      const { r } = getBanyanRingInfo(g);
      const pLeft = polarToBanyanXY(r, -104);
      const pRight = polarToBanyanXY(r, 104);
      ringsGuideGroup.appendChild(
        createSvgEl('path', {
          d: `M ${pLeft.x} ${pLeft.y} A ${r} ${r} 0 1 1 ${pRight.x} ${pRight.y}`,
          fill: 'none',
          stroke: g <= 11 ? '#b45309' : '#15803d',
          'stroke-width': 5,
          'stroke-dasharray': '32, 24',
          opacity: '0.26'
        })
      );
    }
    container.appendChild(ringsGuideGroup);
  }

  // Helper: Draw a Carved Wooden Plaque on Gốc, Thân, Cành lớn, Cành nhỏ (Đời 1 .. Đời 6)
  function drawWoodPlaqueNode(container, node, roleTitle, boxW, boxH, extraSubtitle = '') {
    if (!node) return;
    const cx = node.banyanX;
    const cy = node.banyanY;
    const isSelected = node.id === selectedNodeId;
    const isLineage = highlightedIds.has(node.id);

    const nodeG = createSvgEl('g', {
      class: `svg-node-group ${isSelected ? 'selected' : ''} ${isLineage ? 'lineage-active' : ''}`,
      'data-id': node.id,
      style: 'cursor: pointer'
    });
    nodeG.addEventListener('click', e => {
      e.stopPropagation();
      selectMember(node.id, false);
    });

    const boxX = Math.round(cx - boxW / 2);
    const boxY = Math.round(cy - boxH / 2);

    nodeG.appendChild(
      createSvgEl('rect', {
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        rx: 52,
        fill: isSelected ? '#fde68a' : isLineage ? '#fef08a' : 'url(#banyanPlaqueGrad)',
        stroke: isSelected || isLineage ? '#d97706' : '#432818',
        'stroke-width': isSelected ? 18 : 11,
        class: 'banyan-trunk-zone'
      })
    );
    nodeG.appendChild(
      createSvgEl('rect', {
        x: boxX + 22,
        y: boxY + 22,
        width: boxW - 44,
        height: boxH - 44,
        rx: 38,
        fill: 'none',
        stroke: '#b45309',
        'stroke-width': 4,
        'stroke-dasharray': '28, 14',
        opacity: '0.78'
      })
    );

    const headerY = boxY + 112;
    nodeG.appendChild(
      createSvgEl(
        'text',
        {
          x: cx,
          y: headerY,
          'text-anchor': 'middle',
          fill: '#9a3412',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': 78,
          'font-weight': '800'
        },
        roleTitle
      )
    );
    nodeG.appendChild(
      createSvgEl('line', {
        x1: cx - Math.min(340, boxW * 0.32),
        y1: headerY + 22,
        x2: cx + Math.min(340, boxW * 0.32),
        y2: headerY + 22,
        stroke: '#92400e',
        'stroke-width': 4
      })
    );

    const codePrefix = node.code ? `(${node.code}) ` : '';
    const dateSuffix = node.gio
      ? ` (${node.gio})`
      : node.sinh
      ? ` (${node.sinh})`
      : '';
    const mainLine = `${codePrefix}${node.name}${dateSuffix}`;
    const maxSpan = boxW - 96;
    const spouses = (node.spouses || []).filter(s => s.name || s.gio || s.sinh);
    const mainCy = spouses.length >= 2 ? boxY + 240 : spouses.length === 1 ? boxY + 275 : boxY + 320;
    const baseMainSize = Number(node.generation) === 1 ? 124 : 110;
    const mainFontSize = computeInitialFontSize(mainLine, maxSpan, baseMainSize, 68);

    nodeG.appendChild(
      createSvgEl(
        'text',
        {
          x: cx,
          y: Math.round(mainCy + mainFontSize * 0.35),
          'text-anchor': 'middle',
          fill: node.type === 'female' ? '#1d4ed8' : '#dc2626',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': mainFontSize,
          'font-weight': '800',
          'data-max-span': maxSpan,
          'data-orient': 'h',
          'data-cy': mainCy
        },
        mainLine
      )
    );

    spouses.forEach((sp, sIdx) => {
      const spDate = sp.gio ? ` (${sp.gio})` : sp.sinh ? ` (${sp.sinh})` : '';
      const spLine = `${sp.name || ''}${spDate}`.trim();
      if (!spLine) return;
      const spCy =
        spouses.length >= 2
          ? boxY + 395 + sIdx * 145
          : boxY + 445 + sIdx * 155;
      const spFontSize = computeInitialFontSize(spLine, maxSpan, 92, 64);
      nodeG.appendChild(
        createSvgEl(
          'text',
          {
            x: cx,
            y: Math.round(spCy + spFontSize * 0.35),
            'text-anchor': 'middle',
            fill: '#7f1d1d',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': spFontSize,
            'font-weight': '700',
            'data-max-span': maxSpan,
            'data-orient': 'h',
            'data-cy': spCy
          },
          spLine
        )
      );
    });

    if (extraSubtitle) {
      nodeG.appendChild(
        createSvgEl(
          'text',
          {
            x: cx,
            y: boxY + boxH - 36,
            'text-anchor': 'middle',
            fill: '#78350f',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': 66,
            'font-weight': '700',
            'font-style': 'italic'
          },
          extraSubtitle
        )
      );
    }

    container.appendChild(nodeG);
  }

  // Draw Gốc (Đời 1), Thân (Đời 2, 3), 03 Cành lớn gọn (Đời 4), Cành nhỏ & Nhánh lớn gọn cụ CÔNG NHÀ (Đời 5, 6)
  function drawBanyanRootTrunkAndBoughs(container) {
    const cx = BANYAN_CX;

    // 1. Grassy Hill Mound, Winding Country Path, Grass Tufts & Wildflowers
    const hillGroup = createSvgEl('g', { id: 'banyanEarthMound' });
    hillGroup.appendChild(
      createSvgEl('path', {
        d: `M 445 20480 Q ${cx} 18750 29555 20480 L 29555 21155 L 445 21155 Z`,
        fill: '#e7dec8',
        stroke: '#292524',
        'stroke-width': 18
      })
    );
    hillGroup.appendChild(
      createSvgEl('path', {
        d: `M 4350 18450 Q 5350 18720 4650 19080 Q 3550 19480 5150 20120 L 3850 20380 Q 2350 19550 3850 19020 Q 4550 18720 3750 18450 Z`,
        fill: '#f5efe0',
        stroke: '#292524',
        'stroke-width': 14,
        'stroke-linejoin': 'round'
      })
    );

    const grassTufts = [
      { x: 4600, y: 20550, s: 1.3 },
      { x: 7800, y: 20150, s: 1.0 },
      { x: 10550, y: 19920, s: 1.2 },
      { x: 13850, y: 20280, s: 1.0 },
      { x: 16900, y: 20420, s: 1.15 },
      { x: 19850, y: 19950, s: 1.0 },
      { x: 23800, y: 19880, s: 1.15 },
      { x: 25600, y: 20520, s: 1.0 }
    ];
    for (const gt of grassTufts) {
      hillGroup.appendChild(
        createSvgEl('path', {
          d: `M ${gt.x - 160 * gt.s} ${gt.y} L ${gt.x - 230 * gt.s} ${gt.y - 220 * gt.s} L ${gt.x - 70 * gt.s} ${gt.y - 75 * gt.s} L ${gt.x} ${gt.y - 270 * gt.s} L ${gt.x + 75 * gt.s} ${gt.y - 75 * gt.s} L ${gt.x + 220 * gt.s} ${gt.y - 210 * gt.s} L ${gt.x + 150 * gt.s} ${gt.y}`,
          fill: '#84cc16',
          fillOpacity: '0.28',
          stroke: '#1e293b',
          'stroke-width': 12,
          'stroke-linejoin': 'round',
          'stroke-linecap': 'round'
        })
      );
    }

    const flowers = [
      { x: 8600, y: 20620 },
      { x: 22600, y: 20480 }
    ];
    for (const fl of flowers) {
      const fg = createSvgEl('g', { transform: `translate(${fl.x} ${fl.y})` });
      fg.appendChild(
        createSvgEl('path', {
          d: 'M 0 0 Q 25 -160 0 -320 M 0 0 C -110 -20, -160 -110, -40 -140 M 0 0 C 110 -20, 160 -110, 40 -140',
          fill: 'none',
          stroke: '#1e293b',
          'stroke-width': 12,
          'stroke-linecap': 'round'
        })
      );
      for (let a = 0; a < 360; a += 72) {
        const rad = (a * Math.PI) / 180;
        const px = Math.round(Math.cos(rad) * 85);
        const py = Math.round(-350 + Math.sin(rad) * 85);
        fg.appendChild(
          createSvgEl('circle', {
            cx: px,
            cy: py,
            r: 52,
            fill: '#fef08a',
            stroke: '#1e293b',
            'stroke-width': 11
          })
        );
      }
      fg.appendChild(
        createSvgEl('circle', {
          cx: 0,
          cy: -350,
          r: 42,
          fill: '#f97316',
          stroke: '#1e293b',
          'stroke-width': 10
        })
      );
      hillGroup.appendChild(fg);
    }
    container.appendChild(hillGroup);

    // 2. Sculpted Monolithic 3D Main Trunk & Full-Bodied Lateral Boughs (Đời 1 -> Đời 6 -> Chạc Đôi Đại Thụ Đời 7)
    // Matches the user's red contour drawing: continuous wide trunk from Đời 1 through Đời 6,
    // wide-base tapering side boughs for Đời 4 (Hữu Bằng, Công Lê) & Đời 5 (Công Nhà, Con gái),
    // and two massive sweeping primary Y-crotch boughs rising from Đời 6 (Như Phiến) into Đời 7 (Như Thịnh & Văn Tống)!
    const n4 = familyData.nodes.find(n => n.id === 'N4'); // HỮU BẰNG (Đời 4 Trái)
    const n5 = familyData.nodes.find(n => n.id === 'N5'); // HỮU ĐIỀU (Đời 4 Giữa)
    const n6 = familyData.nodes.find(n => n.id === 'N6'); // CÔNG LÊ (Đời 4 Phải)
    const n7 = familyData.nodes.find(n => n.id === 'N7'); // CÔNG NHÀ (Đời 5 Trái - Phái Giáp)
    const n8 = familyData.nodes.find(n => n.id === 'N8'); // NHƯ HẠ (Đời 5 Giữa - Phái Ất)
    const n9 = familyData.nodes.find(n => n.id === 'N9'); // Con gái (Đời 5 Phải)
    const n10 = familyData.nodes.find(n => n.id === 'N10'); // NHƯ PHIẾN (Đời 6 Giữa)

    // 2a) Four Full-Bodied Natural Forking Lateral Boughs (Đời 4: Hữu Bằng, Công Lê; Đời 5: Công Nhà, Con gái)
    //     Each bough tapers organically from the trunk past the plaque, then forks naturally into rounded wooden sub-branches & leaf clusters (no sharp pointed horn tips!)
    // Đời 4 Trái — Cụ HỮU BẰNG
    const isN4Active = n4 && highlightedIds.has(n4.id);
    const boughHuuBangD = [
      `M ${cx - 880} 15580`,
      `C ${cx - 1550} 15540, ${cx - 2380} 15520, ${cx - 3280} 15430`,
      `Q ${cx - 3350} 15520, ${cx - 3250} 15610`,
      `C ${cx - 2420} 15980, ${cx - 1680} 16300, ${cx - 1040} 16580`,
      `Z`
    ].join(' ');
    container.appendChild(
      createSvgEl('path', {
        d: boughHuuBangD,
        fill: isN4Active ? '#f59e0b' : 'url(#banyanWoodBranchGrad)',
        stroke: '#231208',
        'stroke-width': 20,
        'stroke-linejoin': 'round'
      })
    );
    drawOrganicWoodBranch(
      container,
      cx - 3220,
      15515,
      cx - 3580,
      15380,
      cx - 3920,
      15180,
      cx - 4220,
      14920,
      155,
      30,
      isN4Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx - 3460,
      15425,
      cx - 3750,
      15460,
      cx - 4040,
      15420,
      cx - 4320,
      15320,
      105,
      24,
      isN4Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx - 3060,
      15500,
      cx - 3250,
      15220,
      cx - 3420,
      14980,
      cx - 3620,
      14760,
      78,
      20,
      isN4Active,
      8
    );
    drawSymbolicFoliageLeaf(container, cx - 4353, 14816, -142, 0.98, true);
    drawSymbolicFoliageLeaf(container, cx - 4473, 15298, -172, 0.9, false);
    drawSymbolicFoliageLeaf(container, cx - 3705, 14639, -125, 0.86, false);
    drawSymbolicFoliageLeaf(container, cx - 3872, 15091, -112, 0.78, false);

    // Đời 4 Phải — Cụ CÔNG LÊ
    const isN6Active = n6 && highlightedIds.has(n6.id);
    const boughCongLeD = [
      `M ${cx + 880} 15580`,
      `C ${cx + 1550} 15540, ${cx + 2380} 15520, ${cx + 3280} 15430`,
      `Q ${cx + 3350} 15520, ${cx + 3250} 15610`,
      `C ${cx + 2420} 15980, ${cx + 1680} 16300, ${cx + 1040} 16580`,
      `Z`
    ].join(' ');
    container.appendChild(
      createSvgEl('path', {
        d: boughCongLeD,
        fill: isN6Active ? '#f59e0b' : 'url(#banyanWoodBranchGrad)',
        stroke: '#231208',
        'stroke-width': 20,
        'stroke-linejoin': 'round'
      })
    );
    drawOrganicWoodBranch(
      container,
      cx + 3220,
      15515,
      cx + 3580,
      15380,
      cx + 3920,
      15180,
      cx + 4220,
      14920,
      155,
      30,
      isN6Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx + 3460,
      15425,
      cx + 3750,
      15460,
      cx + 4040,
      15420,
      cx + 4320,
      15320,
      105,
      24,
      isN6Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx + 3060,
      15500,
      cx + 3250,
      15220,
      cx + 3420,
      14980,
      cx + 3620,
      14760,
      78,
      20,
      isN6Active,
      8
    );
    drawSymbolicFoliageLeaf(container, cx + 4353, 14816, -38, 0.98, true);
    drawSymbolicFoliageLeaf(container, cx + 4473, 15298, -8, 0.9, false);
    drawSymbolicFoliageLeaf(container, cx + 3705, 14639, -55, 0.86, false);
    drawSymbolicFoliageLeaf(container, cx + 3872, 15091, -68, 0.78, false);

    // Đời 5 Trái — Cụ CÔNG NHÀ (Phái Giáp)
    const isN7Active = n7 && highlightedIds.has(n7.id);
    const boughCongNhaD = [
      `M ${cx - 800} 14320`,
      `C ${cx - 1480} 14280, ${cx - 2280} 14260, ${cx - 3200} 14180`,
      `Q ${cx - 3270} 14265, ${cx - 3170} 14355`,
      `C ${cx - 2350} 14720, ${cx - 1620} 15060, ${cx - 920} 15340`,
      `Z`
    ].join(' ');
    container.appendChild(
      createSvgEl('path', {
        d: boughCongNhaD,
        fill: isN7Active ? '#f59e0b' : 'url(#banyanWoodBranchGrad)',
        stroke: '#231208',
        'stroke-width': 20,
        'stroke-linejoin': 'round'
      })
    );
    drawOrganicWoodBranch(
      container,
      cx - 3140,
      14265,
      cx - 3500,
      14130,
      cx - 3840,
      13930,
      cx - 4140,
      13680,
      150,
      28,
      isN7Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx - 3380,
      14175,
      cx - 3670,
      14210,
      cx - 3960,
      14170,
      cx - 4240,
      14070,
      100,
      24,
      isN7Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx - 2980,
      14245,
      cx - 3170,
      13970,
      cx - 3340,
      13740,
      cx - 3540,
      13520,
      74,
      20,
      isN7Active,
      8
    );
    drawSymbolicFoliageLeaf(container, cx - 4273, 13576, -142, 0.98, true);
    drawSymbolicFoliageLeaf(container, cx - 4393, 14048, -172, 0.9, false);
    drawSymbolicFoliageLeaf(container, cx - 3625, 13399, -125, 0.86, false);
    drawSymbolicFoliageLeaf(container, cx - 3792, 13843, -112, 0.78, false);

    // Đời 5 Phải — Con gái
    const isN9Active = n9 && highlightedIds.has(n9.id);
    const boughConGaiD = [
      `M ${cx + 800} 14420`,
      `C ${cx + 1380} 14390, ${cx + 2060} 14370, ${cx + 2720} 14310`,
      `Q ${cx + 2780} 14380, ${cx + 2690} 14460`,
      `C ${cx + 2060} 14760, ${cx + 1480} 15020, ${cx + 900} 15240`,
      `Z`
    ].join(' ');
    container.appendChild(
      createSvgEl('path', {
        d: boughConGaiD,
        fill: isN9Active ? '#f59e0b' : 'url(#banyanWoodBranchGrad)',
        stroke: '#231208',
        'stroke-width': 18,
        'stroke-linejoin': 'round'
      })
    );
    drawOrganicWoodBranch(
      container,
      cx + 2660,
      14385,
      cx + 2960,
      14275,
      cx + 3240,
      14130,
      cx + 3500,
      13950,
      125,
      26,
      isN9Active,
      10
    );
    drawOrganicWoodBranch(
      container,
      cx + 2890,
      14305,
      cx + 3140,
      14345,
      cx + 3380,
      14320,
      cx + 3620,
      14250,
      82,
      22,
      isN9Active,
      10
    );
    drawSymbolicFoliageLeaf(container, cx + 3628, 13863, -34, 0.9, false);
    drawSymbolicFoliageLeaf(container, cx + 3759, 14226, -10, 0.82, false);
    drawSymbolicFoliageLeaf(container, cx + 3214, 14042, -66, 0.74, false);

    // 2b) Monolithic Central Trunk rising continuously from Buttress Roots (Đời 1) up through Đời 2, 3, 4, 5, 6
    //     and splitting at the Main Crown V-Crotch (cx, 12460) into Two Massive Sweeping Primary Boughs (Đời 7 Như Thịnh & Văn Tống)!
    const pLeftGen7 = polarToBanyanXY(2350, -32); // Outer collar of NHƯ THỊNH
    const pRightGen7 = polarToBanyanXY(2350, 38); // Outer collar of VĂN TỐNG

    const trunkAndCrownBoughsD = [
      // Start at Central V-Crotch above Đời 6 (NHƯ PHIẾN)
      `M ${cx} 12480`,
      // Inner-right contour of Left Giant Bough sweeping up-left through NHƯ THỊNH (-30°)
      `C ${cx - 320} 12050, ${cx - 680} 11620, ${pLeftGen7.x + 85} ${pLeftGen7.y - 45}`,
      `L ${pLeftGen7.x - 85} ${pLeftGen7.y + 45}`,
      // Outer-left contour of Left Giant Bough curving down into Left Flank of Đời 6 -> 5 -> 4 -> 3 -> 2 -> 1
      `C ${cx - 1020} 11850, ${cx - 880} 12650, ${cx - 820} 13350`,
      `C ${cx - 840} 14250, ${cx - 920} 15450, ${cx - 1060} 16650`,
      `C ${cx - 1140} 17450, ${cx - 1320} 18350, ${cx - 1820} 19150`,
      // Far-left buttress root
      `C ${cx - 2350} 19580, ${cx - 3150} 19880, ${cx - 4050} 20160`,
      `C ${cx - 3280} 20150, ${cx - 2650} 19940, ${cx - 2120} 19760`,
      // Second left root
      `C ${cx - 2350} 19980, ${cx - 2720} 20220, ${cx - 3080} 20360`,
      `C ${cx - 2400} 20240, ${cx - 1840} 19980, ${cx - 1380} 19780`,
      // Center-left root
      `C ${cx - 1420} 20050, ${cx - 1540} 20280, ${cx - 1680} 20440`,
      `C ${cx - 1160} 20250, ${cx - 720} 19980, ${cx - 380} 19820`,
      // Central taproot
      `C ${cx - 210} 20100, ${cx - 90} 20320, ${cx + 50} 20450`,
      `C ${cx + 220} 20280, ${cx + 380} 20020, ${cx + 540} 19820`,
      // Center-right root
      `C ${cx + 880} 20000, ${cx + 1280} 20260, ${cx + 1740} 20430`,
      `C ${cx + 1580} 20220, ${cx + 1440} 20000, ${cx + 1380} 19780`,
      // Second right root
      `C ${cx + 1840} 19980, ${cx + 2420} 20240, ${cx + 3080} 20350`,
      `C ${cx + 2720} 20180, ${cx + 2350} 19960, ${cx + 2120} 19760`,
      // Far-right buttress root
      `C ${cx + 2650} 19940, ${cx + 3280} 20150, ${cx + 4050} 20150`,
      `C ${cx + 3150} 19870, ${cx + 2350} 19580, ${cx + 1820} 19150`,
      // Right Flank of Trunk rising from Đời 1 -> 2 -> 3 -> 4 -> 5 -> 6
      `C ${cx + 1320} 18350, ${cx + 1140} 17450, ${cx + 1060} 16650`,
      `C ${cx + 920} 15450, ${cx + 840} 14250, ${cx + 820} 13350`,
      // Outer-right contour of Right Giant Bough sweeping up-right through VĂN TỐNG (+38°)
      `C ${cx + 880} 12650, ${cx + 1120} 11950, ${pRightGen7.x + 80} ${pRightGen7.y + 50}`,
      `L ${pRightGen7.x - 80} ${pRightGen7.y - 50}`,
      // Inner-left contour of Right Giant Bough returning to Central V-Crotch (cx, 12480)
      `C ${cx + 750} 11680, ${cx + 350} 12050, ${cx} 12480`,
      `Z`
    ].join(' ');

    container.appendChild(
      createSvgEl('path', {
        d: trunkAndCrownBoughsD,
        fill: 'url(#banyanTrunk3DGrad)',
        stroke: '#231208',
        'stroke-width': 22,
        'stroke-linejoin': 'round'
      })
    );

    // Branch for Bà Ng. T. Trình (N13, Gen 7 female at +62°) sprouting off the right flank of the Right Giant Bough
    const n13 = familyData.nodes.find(n => n.id === 'N13');
    if (n13) {
      const pN13In = polarToBanyanXY(1650, n13.banyanAngle || 62);
      const isN13Active = highlightedIds.has('N10') && highlightedIds.has(n13.id);
      drawOrganicWoodBranch(
        container,
        cx + 740,
        12950,
        cx + 1120,
        12720,
        cx + 1320,
        12580,
        pN13In.x,
        pN13In.y,
        130,
        52,
        isN13Active,
        12
      );
    }

    // Continuous Flowing Bark Grain Lines from Roots through Đời 1..6 and curving into Lateral & Crown Boughs
    const barkGroup = createSvgEl('g', {
      fill: 'none',
      stroke: '#2b180c',
      'stroke-linecap': 'round',
      opacity: '0.68'
    });
    const grainRatios = [-0.72, -0.45, -0.18, 0.18, 0.45, 0.72];
    for (const ratio of grainRatios) {
      const x6 = Math.round(cx + ratio * 680);
      const x4 = Math.round(cx + ratio * 840);
      const x2 = Math.round(cx + ratio * 1060);
      const x1 = Math.round(cx + ratio * 2100);
      barkGroup.appendChild(
        createSvgEl('path', {
          d: `M ${x6} 12850 C ${x4} 15200, ${x2} 17800, ${x1} 19950`,
          'stroke-width': 8.5
        })
      );
    }
    // Bark grain lines curving into the 4 lateral boughs & 2 upper crown boughs
    const boughGrains = [
      `M ${cx - 820} 16150 C ${cx - 1650} 15920, ${cx - 2450} 15720, ${cx - 3220} 15520`,
      `M ${cx + 820} 16150 C ${cx + 1650} 15920, ${cx + 2450} 15720, ${cx + 3220} 15520`,
      `M ${cx - 750} 14850 C ${cx - 1580} 14640, ${cx - 2380} 14460, ${cx - 3140} 14270`,
      `M ${cx + 750} 14850 C ${cx + 1380} 14680, ${cx + 2020} 14520, ${cx + 2660} 14385`,
      `M ${cx - 420} 12850 C ${cx - 580} 12250, ${cx - 780} 11750, ${pLeftGen7.x} ${pLeftGen7.y}`,
      `M ${cx + 420} 12850 C ${cx + 680} 12250, ${cx + 980} 11820, ${pRightGen7.x} ${pRightGen7.y}`
    ];
    for (const bg of boughGrains) {
      barkGroup.appendChild(
        createSvgEl('path', {
          d: bg,
          'stroke-width': 8
        })
      );
    }
    container.appendChild(barkGroup);

    // 5. Render Carved Wooden Plaques for Đời 1 .. Đời 6 (Sized so the continuous wooden trunk & bough contours wrap visibly around them!)
    const n1 = familyData.nodes.find(n => n.id === 'N1');
    const n2 = familyData.nodes.find(n => n.id === 'N2');
    const n3 = familyData.nodes.find(n => n.id === 'N3');

    drawWoodPlaqueNode(container, n1, 'ĐỜI.1 (THỦY TỔ)', 2380, 680);
    drawWoodPlaqueNode(container, n2, 'ĐỜI.2', 1960, 620);
    drawWoodPlaqueNode(container, n3, 'ĐỜI.3', 1780, 600);

    drawWoodPlaqueNode(container, n4, 'ĐỜI.4', 1680, 580);
    drawWoodPlaqueNode(container, n5, 'ĐỜI.4', 1620, 580);
    drawWoodPlaqueNode(container, n6, 'ĐỜI.4', 1680, 580);

    drawWoodPlaqueNode(container, n7, 'ĐỜI.5 (PHÁI GIÁP)', 1760, 680);
    drawWoodPlaqueNode(container, n8, 'ĐỜI.5 (PHÁI ẤT)', 1520, 580);
    drawWoodPlaqueNode(container, n9, 'ĐỜI.5', 1280, 500);

    drawWoodPlaqueNode(container, n10, 'ĐỜI.6', 1480, 580);

    const extraBaseNodes = familyData.nodes.filter(
      n =>
        Number(n.generation) <= 6 &&
        !['N1', 'N2', 'N3', 'N4', 'N5', 'N6', 'N7', 'N8', 'N9', 'N10'].includes(n.id)
    );
    for (const ex of extraBaseNodes) {
      drawWoodPlaqueNode(
        container,
        ex,
        `ĐỜI.${ex.generation}`,
        1750,
        650
      );
    }
  }

  // Helper: Draw a 3D Tapered Wooden Branch Segment evaluated in Polar (r, deg) space
  // Guarantees natural sweeping tree boughs that curve smoothly with the concentric crown and never sag or form 90° pipes!
  function drawPolarWoodBranch(
    container,
    r0,
    deg0,
    r1,
    deg1,
    r2,
    deg2,
    r3,
    deg3,
    wStart,
    wEnd,
    isHighlighted = false,
    samples = 16
  ) {
    const pts = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const mt = 1 - t;
      const r =
        mt * mt * mt * r0 +
        3 * mt * mt * t * r1 +
        3 * mt * t * t * r2 +
        t * t * t * r3;
      const deg =
        mt * mt * mt * deg0 +
        3 * mt * mt * t * deg1 +
        3 * mt * t * t * deg2 +
        t * t * t * deg3;
      const xy = polarToBanyanXY(r, deg);
      pts.push({ x: xy.x, y: xy.y, t });
    }

    const leftPts = [];
    const rightPts = [];
    const centerPts = [];
    for (let i = 0; i <= samples; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(samples, i + 1)];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const t = pts[i].t;
      const halfW = (wStart + (wEnd - wStart) * Math.pow(t, 0.8)) / 2;
      leftPts.push(`${Math.round(pts[i].x + nx * halfW)},${Math.round(pts[i].y + ny * halfW)}`);
      rightPts.unshift(`${Math.round(pts[i].x - nx * halfW)},${Math.round(pts[i].y - ny * halfW)}`);
      centerPts.push(`${pts[i].x},${pts[i].y}`);
    }

    const polyD = `M ${leftPts.join(' L ')} L ${rightPts.join(' L ')} Z`;
    const outerFill = isHighlighted ? '#f59e0b' : 'url(#banyanWoodBranchGrad)';
    const outerStroke = isHighlighted ? '#b45309' : '#2b180c';

    container.appendChild(
      createSvgEl('path', {
        d: polyD,
        fill: outerFill,
        stroke: outerStroke,
        'stroke-width': Math.max(4, Math.min(9, wStart * 0.14)),
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      })
    );

    if (wStart >= 14) {
      const spineW = Math.max(3, (wStart + wEnd) * 0.22);
      container.appendChild(
        createSvgEl('path', {
          d: `M ${centerPts.join(' L ')}`,
          fill: 'none',
          stroke: isHighlighted ? '#fef08a' : '#d6b892',
          'stroke-width': spineW,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: isHighlighted ? '0.88' : '0.48'
        })
      );
    }
  }

  // Helper: Draw a Cách A Mother Name Pill Badge on a shared mother stem (when a father has 2+ wives)
  function drawMotherBranchLabelBadge(container, x, y, degTilt, motherName, isActive = false) {
    const labelText = motherName || 'Phu nhân';
    const rot = Math.round(Math.max(-34, Math.min(34, degTilt * 0.45)));
    const pillW = Math.max(210, Math.round(labelText.length * 25 + 56));
    const pillH = 68;
    const maxTextSpan = pillW - 28;
    const fontSize = computeInitialFontSize(labelText, maxTextSpan, 44, 30);

    const g = createSvgEl('g', {
      transform: `translate(${x} ${y}) rotate(${rot})`
    });
    g.appendChild(
      createSvgEl('rect', {
        x: -pillW / 2,
        y: -pillH / 2,
        width: pillW,
        height: pillH,
        rx: 22,
        fill: isActive ? '#fef08a' : '#fffbeb',
        stroke: isActive ? '#d97706' : '#78350f',
        'stroke-width': isActive ? 6 : 4.5
      })
    );
    g.appendChild(
      createSvgEl(
        'text',
        {
          x: 0,
          y: Math.round(fontSize * 0.35),
          'text-anchor': 'middle',
          fill: '#7f1d1d',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': fontSize,
          'font-weight': '800',
          'data-max-span': maxTextSpan,
          'data-orient': 'h',
          'data-cy': 0
        },
        labelText
      )
    );
    container.appendChild(g);
  }

  // Draw Direct Individual Branches (1 wife) OR Common Mother Stem with Cách A Name Tag -> Individual Branches (2+ wives)
  function drawBanyanCanopyBranches(container, maxGen) {
    const byParent = new Map();
    for (const child of familyData.nodes) {
      const cGen = Number(child.generation);
      if (cGen < 8 || cGen > 12 || !child.parentId) continue;
      if (!byParent.has(child.parentId)) byParent.set(child.parentId, []);
      byParent.get(child.parentId).push(child);
    }

    const motherLabelBadges = [];

    for (const [parentId, allChildren] of byParent.entries()) {
      const parent = familyData.nodes.find(n => n.id === parentId);
      if (!parent) continue;

      const spouses = Array.isArray(parent.spouses) ? parent.spouses : [];
      const hasMultipleWives = spouses.length >= 2;
      const pAngleDeg = parent.banyanAngle || 0;
      const pRadius = parent.banyanRadius || getBanyanRingInfo(parent.generation).r;
      const rOut = pRadius + 350;

      if (!hasMultipleWives) {
        // 0 or 1 wife: Each child gets its own direct individual branch straight from Parent to Child
        const sorted = [...allChildren].sort((a, b) => (a.banyanAngle || 0) - (b.banyanAngle || 0));
        const childGen = Number(sorted[0].generation);
        const cRadius = getBanyanRingInfo(childGen).r;
        const rIn = childGen >= 12 ? cRadius - 375 : cRadius - 350;
        const spanR = rIn - rOut;

        const baseW =
          childGen === 8
            ? 148
            : childGen === 9
            ? 88
            : childGen === 10
            ? 58
            : childGen === 11
            ? 38
            : 24;
        const childEndW =
          childGen === 8
            ? 86
            : childGen === 9
            ? 54
            : childGen === 10
            ? 36
            : childGen === 11
            ? 22
            : 13;
        const twigStartW =
          sorted.length === 1
            ? baseW
            : Math.max(
                childEndW + 6,
                Math.round(baseW * (sorted.length >= 6 ? 0.54 : sorted.length >= 4 ? 0.65 : 0.78))
              );
        const spreadDeg = Math.min(4.0, Math.max(0, (sorted.length - 1) * 0.65));

        sorted.forEach((child, idx) => {
          const cDeg = child.banyanAngle || 0;
          const startDeg =
            sorted.length === 1
              ? pAngleDeg
              : pAngleDeg + ((idx / (sorted.length - 1)) - 0.5) * spreadDeg;
          const isChildActive =
            highlightedIds.has(parent.id) && highlightedIds.has(child.id);

          drawPolarWoodBranch(
            container,
            rOut,
            startDeg,
            rOut + spanR * 0.34,
            startDeg + (cDeg - startDeg) * 0.24,
            rOut + spanR * 0.72,
            cDeg,
            rIn,
            cDeg,
            isChildActive ? twigStartW + 4 : twigStartW,
            isChildActive ? childEndW + 3 : childEndW,
            isChildActive,
            14
          );
        });
      } else {
        // 2+ wives: Group children by motherIndex; draw 1 common stem per mother (labeled with Mother's name via Cách A),
        // then split from the end of that common stem directly into 1 individual branch per child!
        const byMother = new Map();
        for (const ch of allChildren) {
          const mIdx = Number(ch.motherIndex) || 0;
          if (!byMother.has(mIdx)) byMother.set(mIdx, []);
          byMother.get(mIdx).push(ch);
        }

        const motherEntries = Array.from(byMother.entries())
          .map(([mIdx, mChildren]) => {
            mChildren.sort((a, b) => (a.banyanAngle || 0) - (b.banyanAngle || 0));
            const avgDeg =
              mChildren.reduce((s, c) => s + (c.banyanAngle || 0), 0) / mChildren.length;
            return { mIdx, mChildren, avgDeg };
          })
          .sort((a, b) => a.avgDeg - b.avgDeg);

        motherEntries.forEach((entry, gIdx) => {
          const { mIdx, mChildren, avgDeg } = entry;
          const childGen = Number(mChildren[0].generation);
          const cRadius = getBanyanRingInfo(childGen).r;
          const rIn = childGen >= 12 ? cRadius - 375 : cRadius - 350;
          const spanR = rIn - rOut;

          const stemStartW =
            childGen === 8
              ? 160
              : childGen === 9
              ? 94
              : childGen === 10
              ? 60
              : childGen === 11
              ? 40
              : 26;
          const childEndW =
            childGen === 8
              ? 88
              : childGen === 9
              ? 54
              : childGen === 10
              ? 36
              : childGen === 11
              ? 22
              : 13;
          const commonEndW = Math.max(childEndW + 14, Math.round(stemStartW * 0.74));

          const mStartDeg =
            motherEntries.length > 1
              ? pAngleDeg + (gIdx - (motherEntries.length - 1) / 2) * 2.4
              : pAngleDeg;
          const rCommonEnd = Math.round(rOut + spanR * 0.44);
          const degCommonEnd = mStartDeg * 0.48 + avgDeg * 0.52;
          const isCommonActive =
            highlightedIds.has(parent.id) && mChildren.some(c => highlightedIds.has(c.id));

          // 1) Common Mother Stem (Đoạn nối chung của từng bà vợ)
          drawPolarWoodBranch(
            container,
            rOut,
            mStartDeg,
            rOut + (rCommonEnd - rOut) * 0.4,
            mStartDeg + (degCommonEnd - mStartDeg) * 0.4,
            rOut + (rCommonEnd - rOut) * 0.78,
            degCommonEnd,
            rCommonEnd,
            degCommonEnd,
            isCommonActive ? stemStartW + 4 : stemStartW,
            isCommonActive ? commonEndW + 3 : commonEndW,
            isCommonActive,
            12
          );

          // Subtle wooden hub knot at the split point of the common stem
          const splitPt = polarToBanyanXY(rCommonEnd, degCommonEnd);
          container.appendChild(
            createSvgEl('circle', {
              cx: splitPt.x,
              cy: splitPt.y,
              r: Math.max(12, Math.round(commonEndW * 0.56)),
              fill: isCommonActive ? '#f59e0b' : 'url(#banyanWoodBranchGrad)',
              stroke: isCommonActive ? '#b45309' : '#2b180c',
              'stroke-width': 5
            })
          );

          // 2) Individual Direct Branches from the common stem split point to each child of this mother
          const remR = rIn - rCommonEnd;
          const childStartW =
            mChildren.length === 1
              ? Math.round(commonEndW * 0.9)
              : Math.max(
                  childEndW + 6,
                  Math.round(commonEndW * (mChildren.length >= 6 ? 0.52 : mChildren.length >= 4 ? 0.62 : 0.76))
                );

          for (const child of mChildren) {
            const cDeg = child.banyanAngle || 0;
            const isChildActive =
              highlightedIds.has(parent.id) && highlightedIds.has(child.id);
            drawPolarWoodBranch(
              container,
              rCommonEnd,
              degCommonEnd,
              rCommonEnd + remR * 0.34,
              degCommonEnd + (cDeg - degCommonEnd) * 0.45,
              rCommonEnd + remR * 0.7,
              cDeg,
              rIn,
              cDeg,
              isChildActive ? childStartW + 4 : childStartW,
              isChildActive ? childEndW + 3 : childEndW,
              isChildActive,
              12
            );
          }

          // 3) Queue Cách A Mother Name Tag to render cleanly on top of the common stem
          const mother = spouses[mIdx];
          const labelPt = polarToBanyanXY(
            Math.round((rOut + rCommonEnd) / 2),
            (mStartDeg + degCommonEnd) / 2
          );
          motherLabelBadges.push({
            x: labelPt.x,
            y: labelPt.y,
            degTilt: (mStartDeg + degCommonEnd) / 2,
            motherName: (mother && mother.name) || `Bà ${mIdx + 1}`,
            isActive: isCommonActive
          });
        });
      }
    }

    // Render all Cách A Mother Name Pill Badges on top so no branch line ever overlaps text
    for (const badge of motherLabelBadges) {
      drawMotherBranchLabelBadge(
        container,
        badge.x,
        badge.y,
        badge.degTilt,
        badge.motherName,
        badge.isActive
      );
    }
  }

  // Draw Soft Flowing S-Curve Connectors from Leaf to Leaf (Từ Đời 12 trở đi: Lá tiếp nối lá bằng các đường nối mềm mại)
  function drawSoftLeafToLeafConnectors(container) {
    const byParent = new Map();
    for (const child of familyData.nodes) {
      if (Number(child.generation) < 13 || !child.parentId) continue;
      if (!byParent.has(child.parentId)) byParent.set(child.parentId, []);
      byParent.get(child.parentId).push(child);
    }

    const drawSingleSoftLink = (p0, p3, ang0, ang3, isHighlighted, withStartBud = true) => {
      const r0 = Math.hypot(p0.x - BANYAN_CX, p0.y - BANYAN_CY);
      const r3 = Math.hypot(p3.x - BANYAN_CX, p3.y - BANYAN_CY);
      const r1 = Math.round(r0 + (r3 - r0) * 0.36);
      const r2 = Math.round(r0 + (r3 - r0) * 0.66);
      const sameAngleWave = Math.abs(ang3 - ang0) < 0.4 ? 0.45 : 0;
      const p1 = polarToBanyanXY(r1, ang0 + sameAngleWave);
      const p2 = polarToBanyanXY(r2, ang3 - sameAngleWave);
      const pathD = `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;

      container.appendChild(
        createSvgEl('path', {
          d: pathD,
          fill: 'none',
          stroke: isHighlighted ? '#d97706' : '#15803d',
          'stroke-width': isHighlighted ? 18 : 13,
          'stroke-linecap': 'round'
        })
      );
      container.appendChild(
        createSvgEl('path', {
          d: pathD,
          fill: 'none',
          stroke: isHighlighted ? '#fef08a' : '#86efac',
          'stroke-width': isHighlighted ? 7 : 5,
          'stroke-linecap': 'round',
          opacity: '0.92'
        })
      );
      if (withStartBud) {
        container.appendChild(
          createSvgEl('circle', {
            cx: p0.x,
            cy: p0.y,
            r: 14,
            fill: isHighlighted ? '#fef08a' : '#bbf7d0',
            stroke: isHighlighted ? '#b45309' : '#166534',
            'stroke-width': 4.5
          })
        );
      }
    };

    const motherLabelBadges = [];

    for (const [parentId, allChildren] of byParent.entries()) {
      const parent = familyData.nodes.find(n => n.id === parentId);
      if (!parent) continue;

      const spouses = Array.isArray(parent.spouses) ? parent.spouses : [];
      const hasMultipleWives = spouses.length >= 2;
      const pAngleDeg = parent.banyanAngle || 0;
      const pRadius = parent.banyanRadius || getBanyanRingInfo(parent.generation).r;
      const rOut = pRadius + 380;

      if (!hasMultipleWives) {
        for (const child of allChildren) {
          const cAngleDeg = child.banyanAngle || 0;
          const cRadius = child.banyanRadius || getBanyanRingInfo(child.generation).r;
          const rIn = cRadius - 385;
          const p0 = polarToBanyanXY(rOut, pAngleDeg);
          const p3 = polarToBanyanXY(rIn, cAngleDeg);
          const isHighlighted =
            highlightedIds.has(parent.id) && highlightedIds.has(child.id);
          drawSingleSoftLink(p0, p3, pAngleDeg, cAngleDeg, isHighlighted, true);
        }
      } else {
        const byMother = new Map();
        for (const ch of allChildren) {
          const mIdx = Number(ch.motherIndex) || 0;
          if (!byMother.has(mIdx)) byMother.set(mIdx, []);
          byMother.get(mIdx).push(ch);
        }
        const motherEntries = Array.from(byMother.entries())
          .map(([mIdx, mChildren]) => {
            mChildren.sort((a, b) => (a.banyanAngle || 0) - (b.banyanAngle || 0));
            const avgDeg =
              mChildren.reduce((s, c) => s + (c.banyanAngle || 0), 0) / mChildren.length;
            return { mIdx, mChildren, avgDeg };
          })
          .sort((a, b) => a.avgDeg - b.avgDeg);

        motherEntries.forEach((entry, gIdx) => {
          const { mIdx, mChildren, avgDeg } = entry;
          const cRadius =
            mChildren[0].banyanRadius || getBanyanRingInfo(mChildren[0].generation).r;
          const rIn = cRadius - 385;
          const mStartDeg =
            motherEntries.length > 1
              ? pAngleDeg + (gIdx - (motherEntries.length - 1) / 2) * 1.6
              : pAngleDeg;
          const rCommonEnd = Math.round(rOut + (rIn - rOut) * 0.44);
          const degCommonEnd = mStartDeg * 0.48 + avgDeg * 0.52;
          const isCommonActive =
            highlightedIds.has(parent.id) && mChildren.some(c => highlightedIds.has(c.id));

          const pStart = polarToBanyanXY(rOut, mStartDeg);
          const pSplit = polarToBanyanXY(rCommonEnd, degCommonEnd);
          drawSingleSoftLink(pStart, pSplit, mStartDeg, degCommonEnd, isCommonActive, true);

          for (const child of mChildren) {
            const cAngleDeg = child.banyanAngle || 0;
            const pChild = polarToBanyanXY(rIn, cAngleDeg);
            const isChildActive =
              highlightedIds.has(parent.id) && highlightedIds.has(child.id);
            drawSingleSoftLink(pSplit, pChild, degCommonEnd, cAngleDeg, isChildActive, true);
          }

          const mother = spouses[mIdx];
          const labelPt = polarToBanyanXY(
            Math.round((rOut + rCommonEnd) / 2),
            (mStartDeg + degCommonEnd) / 2
          );
          motherLabelBadges.push({
            x: labelPt.x,
            y: labelPt.y,
            degTilt: (mStartDeg + degCommonEnd) / 2,
            motherName: (mother && mother.name) || `Bà ${mIdx + 1}`,
            isActive: isCommonActive
          });
        });
      }
    }

    for (const badge of motherLabelBadges) {
      drawMotherBranchLabelBadge(
        container,
        badge.x,
        badge.y,
        badge.degTilt,
        badge.motherName,
        badge.isActive
      );
    }
  }

  // Draw a Wooden Branch Segment Node for Nhánh lớn (Đời 7), Nhánh vừa (Đời 8, 9), Nhánh nhỏ (Đời 10, 11)
  // Unscaled exact radial half-length (halfL = 350) guarantees 0.00px alignment with incoming & outgoing branches!
  function drawBanyanBranchNode(node) {
    const isSelected = node.id === selectedNodeId;
    const isLineage = highlightedIds.has(node.id);
    const cx = node.banyanX;
    const cy = node.banyanY;
    const angleDeg = node.banyanAngle || 0;
    const rotDeg = angleDeg - 90;
    const isMale = node.type === 'male';
    const hasChildren = familyData.nodes.some(c => c.parentId === node.id);
    const genNum = Number(node.generation) || 10;

    const g = createSvgEl('g', {
      class: `svg-node-group ${isSelected ? 'selected' : ''} ${isLineage ? 'lineage-active' : ''}`,
      'data-id': node.id,
      transform: `translate(${cx} ${cy}) rotate(${rotDeg})`,
      style: 'cursor: pointer'
    });

    g.addEventListener('click', e => {
      e.stopPropagation();
      selectMember(node.id, false);
    });

    // Exact radial half-length = 350; generous transverse height for crisp multi-line text readability
    const halfL = 350;
    const halfH = genNum === 7 ? 172 : genNum === 8 ? 160 : genNum === 9 ? 148 : 138;
    const collarW = genNum === 7 ? 94 : genNum === 8 ? 72 : genNum === 9 ? 54 : 38;

    // 1. Incoming & Outgoing Wooden Branch Collars at exact x = -350 and x = +350
    g.appendChild(
      createSvgEl('path', {
        d: `M -372 ${-collarW / 2} L -332 ${-collarW * 0.65} L -332 ${collarW * 0.65} L -372 ${collarW / 2} Z`,
        fill: 'url(#banyanWoodBranchGrad)',
        stroke: '#2b180c',
        'stroke-width': 5,
        'stroke-linejoin': 'round'
      })
    );
    if (hasChildren) {
      g.appendChild(
        createSvgEl('path', {
          d: `M 332 ${-collarW * 0.6} L 372 ${-collarW * 0.45} L 372 ${collarW * 0.45} L 332 ${collarW * 0.6} Z`,
          fill: 'url(#banyanWoodBranchGrad)',
          stroke: '#2b180c',
          'stroke-width': 5,
          'stroke-linejoin': 'round'
        })
      );
    }

    // 2. Sculpted Wooden Branch Cartouche Body
    const fillGrad =
      genNum === 7 || (hasChildren && genNum <= 9)
        ? 'url(#banyanBranchMajorNodeGrad)'
        : !isMale
        ? 'url(#banyanBranchFemaleNodeGrad)'
        : genNum <= 9
        ? 'url(#banyanBranchMedNodeGrad)'
        : 'url(#banyanBranchSmallNodeGrad)';
    const borderStroke =
      isSelected || isLineage
        ? '#d97706'
        : genNum === 7
        ? '#3b2212'
        : isMale
        ? '#5c3a21'
        : '#1e3a8a';
    const borderW = genNum === 7 ? 11.5 : genNum <= 9 ? 9 : 7.5;

    g.appendChild(
      createSvgEl('rect', {
        x: -halfL,
        y: -halfH,
        width: halfL * 2,
        height: halfH * 2,
        rx: genNum <= 9 ? 48 : 40,
        fill: fillGrad,
        stroke: borderStroke,
        'stroke-width': borderW,
        class: 'banyan-leaf-shape'
      })
    );

    const trimColor = isMale ? '#92400e' : '#3b82f6';
    g.appendChild(
      createSvgEl('path', {
        d: `M ${-halfL + 38} ${-halfH + 15} L ${halfL - 38} ${-halfH + 15} M ${-halfL + 38} ${halfH - 15} L ${halfL - 38} ${halfH - 15}`,
        fill: 'none',
        stroke: trimColor,
        'stroke-width': 3,
        'stroke-dasharray': hasChildren ? 'none' : '22, 12',
        opacity: '0.52'
      })
    );

    // 3. Readable Right-Side-Up Text inside the Branch Segment
    const flipText = angleDeg < 0;
    const textGroup = createSvgEl('g', {
      transform: flipText ? 'rotate(180)' : ''
    });

    const badgeX = flipText ? -282 : 282;
    const orderLabel = node.code || String(node.siblingOrder || '');
    if (orderLabel) {
      textGroup.appendChild(
        createSvgEl('rect', {
          x: badgeX - 42,
          y: -34,
          width: 84,
          height: 68,
          rx: 18,
          fill: hasChildren ? '#fef3c7' : '#f1f5f9',
          stroke: borderStroke,
          'stroke-width': 3
        })
      );
      textGroup.appendChild(
        createSvgEl(
          'text',
          {
            x: badgeX,
            y: 16,
            'text-anchor': 'middle',
            fill: hasChildren ? '#92400e' : '#334155',
            'font-family': "'Noto Serif', 'Be Vietnam Pro', serif",
            'font-size': node.code ? 40 : 50,
            'font-weight': '800'
          },
          orderLabel
        )
      );
    }

    const spouses = (node.spouses || []).filter(s => s.name);
    const spouseStr = spouses.map(s => s.name).join(' • ');
    const dateStr =
      node.gio ||
      (spouses[0] && spouses[0].gio) ||
      (node.sinh && node.sinh.trim() !== 'S:' ? node.sinh : '');
    const maxBranchTextSpan = orderLabel ? 520 : 610;
    const textCenterX = orderLabel ? (flipText ? 46 : -46) : 0;

    const displayMainName = node.name || '';
    const hasSecondLine = Boolean(spouseStr || dateStr);
    const mainCy = hasSecondLine ? -46 : 0;
    const mainFontSize = computeInitialFontSize(displayMainName, maxBranchTextSpan, 94, 62);

    textGroup.appendChild(
      createSvgEl(
        'text',
        {
          x: textCenterX,
          y: Math.round(mainCy + mainFontSize * 0.35),
          'text-anchor': 'middle',
          fill: isMale ? '#dc2626' : '#1d4ed8',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': mainFontSize,
          'font-weight': '800',
          'data-max-span': maxBranchTextSpan,
          'data-orient': 'h',
          'data-cy': mainCy
        },
        displayMainName
      )
    );

    if (hasSecondLine) {
      const secondParts = [];
      if (spouseStr) secondParts.push(spouseStr);
      if (dateStr) secondParts.push(dateStr);
      const secondLine = secondParts.join(' • ');
      const secCy = 48;
      const secFontSize = computeInitialFontSize(secondLine, maxBranchTextSpan, 78, 56);

      textGroup.appendChild(
        createSvgEl(
          'text',
          {
            x: textCenterX,
            y: Math.round(secCy + secFontSize * 0.35),
            'text-anchor': 'middle',
            fill: isMale ? '#7f1d1d' : '#1e3a8a',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': secFontSize,
            'font-weight': '600',
            'data-max-span': maxBranchTextSpan,
            'data-orient': 'h',
            'data-cy': secCy
          },
          secondLine
        )
      );
    }

    g.appendChild(textGroup);
    return g;
  }

  // Draw a Lush Heart-Shaped Bodhi Leaf (Lá Bồ Đề - Ficus religiosa) for Generation 12+
  // Wide transverse belly (±182px) fills the canopy richly while radial petiole (-390..-328) & apex (+385) connect seamlessly!
  function drawBanyanLeafNode(node) {
    const isSelected = node.id === selectedNodeId;
    const isLineage = highlightedIds.has(node.id);
    const cx = node.banyanX;
    const cy = node.banyanY;
    const angleDeg = node.banyanAngle || 0;

    const rotDeg = angleDeg - 90;
    const isMale = node.type === 'male';
    const hasChildren = familyData.nodes.some(c => c.parentId === node.id);

    const g = createSvgEl('g', {
      class: `svg-node-group ${isSelected ? 'selected' : ''} ${isLineage ? 'lineage-active' : ''}`,
      'data-id': node.id,
      transform: `translate(${cx} ${cy}) rotate(${rotDeg})`,
      style: 'cursor: pointer'
    });

    g.addEventListener('click', e => {
      e.stopPropagation();
      selectMember(node.id, false);
    });

    const baseX = -328;
    const tipX = 385;

    // 1. Straight-aligned Petiole Stem (Cuống lá nối liền mạch từ x = -390 vào gốc lá x = -328)
    g.appendChild(
      createSvgEl('path', {
        d: `M -390 0 L ${baseX + 8} 0`,
        fill: 'none',
        stroke: '#166534',
        'stroke-width': 13,
        'stroke-linecap': 'round'
      })
    );

    // 2. Lush Wide Cordate Bodhi Leaf Silhouette (Gốc lá xẻ tim tròn rộng ±182px & đuôi lá Bồ Đề thanh thoát)
    const leafBladePathD = [
      `M ${baseX} 0`,
      `C -355 -92, -295 -186, -155 -182`,
      `C -25 -178, 120 -132, 235 -56`,
      `C 300 -18, 345 -6, ${tipX} 0`,
      `C 345 6, 300 18, 235 56`,
      `C 120 132, -25 178, -155 182`,
      `C -295 186, -355 92, ${baseX} 0`,
      `Z`
    ].join(' ');

    const leafFill = hasChildren
      ? 'url(#bodhiGoldLeafGrad)'
      : isMale
      ? 'url(#bodhiMaleLeafGrad)'
      : 'url(#bodhiFemaleLeafGrad)';
    const leafStroke = hasChildren ? '#b45309' : isMale ? '#15803d' : '#0369a1';
    const veinColor = hasChildren ? '#d97706' : isMale ? '#4d7c0f' : '#0284c7';

    g.appendChild(
      createSvgEl('path', {
        d: leafBladePathD,
        fill: leafFill,
        stroke: leafStroke,
        'stroke-width': hasChildren ? 9.5 : 7,
        'stroke-linejoin': 'round',
        class: 'banyan-leaf-shape'
      })
    );

    // 3. Natural Bodhi Leaf Venation fanning into the wide heart lobes
    const veinGroup = createSvgEl('g', {
      fill: 'none',
      stroke: veinColor,
      'stroke-linecap': 'round',
      opacity: '0.42'
    });
    veinGroup.appendChild(
      createSvgEl('path', {
        d: `M ${baseX + 10} 0 L ${tipX - 24} 0`,
        'stroke-width': 4.5
      })
    );
    const lateralVeins = [
      { x0: -275, cx: -245, cy: 96, x1: -175, y1: 152 },
      { x0: -170, cx: -115, cy: 108, x1: -35, y1: 154 },
      { x0: -50, cx: 10, cy: 92, x1: 85, y1: 126 },
      { x0: 65, cx: 120, cy: 64, x1: 185, y1: 82 }
    ];
    for (const v of lateralVeins) {
      veinGroup.appendChild(
        createSvgEl('path', {
          d: `M ${v.x0} 0 Q ${v.cx} ${-v.cy} ${v.x1} ${-v.y1} M ${v.x0} 0 Q ${v.cx} ${v.cy} ${v.x1} ${v.y1}`,
          'stroke-width': 2.8
        })
      );
    }
    g.appendChild(veinGroup);

    // 4. Right-Side-Up Readable Typography inside the Wide Bodhi Leaf
    const flipText = angleDeg < 0;
    const textGroup = createSvgEl('g', {
      transform: flipText ? 'rotate(180)' : ''
    });

    const badgeX = flipText ? -200 : 200;
    const orderLabel = node.code || String(node.siblingOrder || '');
    if (orderLabel) {
      textGroup.appendChild(
        createSvgEl('circle', {
          cx: badgeX,
          cy: 0,
          r: node.code ? 36 : 31,
          fill: hasChildren ? '#fef3c7' : '#f8fafc',
          stroke: leafStroke,
          'stroke-width': 3,
          opacity: '0.94'
        })
      );
      textGroup.appendChild(
        createSvgEl(
          'text',
          {
            x: badgeX,
            y: node.code ? 14 : 17,
            'text-anchor': 'middle',
            fill: hasChildren ? '#92400e' : '#1e293b',
            'font-family': "'Noto Serif', 'Be Vietnam Pro', serif",
            'font-size': node.code ? 40 : 50,
            'font-weight': '800'
          },
          orderLabel
        )
      );
    }

    const spouses = (node.spouses || []).filter(s => s.name);
    const spouseStr = spouses.map(s => s.name).join(' • ');
    const dateStr =
      node.gio ||
      (spouses[0] && spouses[0].gio) ||
      (node.sinh && node.sinh.trim() !== 'S:' ? node.sinh : '');
    const maxLeafTextSpan = 445;
    const textCenterX = flipText ? 42 : -42;

    const displayMainName = node.name || '';
    const hasSecondLine = Boolean(spouseStr || dateStr);
    const mainCy = hasSecondLine ? -46 : 0;
    const mainFontSize = computeInitialFontSize(displayMainName, maxLeafTextSpan, 90, 58);

    textGroup.appendChild(
      createSvgEl(
        'text',
        {
          x: textCenterX,
          y: Math.round(mainCy + mainFontSize * 0.35),
          'text-anchor': 'middle',
          fill: isMale ? '#dc2626' : '#1d4ed8',
          'font-family': "'Be Vietnam Pro', Arial, sans-serif",
          'font-size': mainFontSize,
          'font-weight': isMale ? '800' : '700',
          'data-max-span': maxLeafTextSpan,
          'data-orient': 'h',
          'data-cy': mainCy
        },
        displayMainName
      )
    );

    if (hasSecondLine) {
      const secondParts = [];
      if (spouseStr) secondParts.push(spouseStr);
      if (dateStr) secondParts.push(dateStr);
      const secondLine = secondParts.join(' • ');
      const secCy = 46;
      const secFontSize = computeInitialFontSize(secondLine, maxLeafTextSpan, 74, 52);

      textGroup.appendChild(
        createSvgEl(
          'text',
          {
            x: textCenterX,
            y: Math.round(secCy + secFontSize * 0.35),
            'text-anchor': 'middle',
            fill: isMale ? '#991b1b' : '#1e3a8a',
            'font-family': "'Be Vietnam Pro', Arial, sans-serif",
            'font-size': secFontSize,
            'font-weight': '600',
            'data-max-span': maxLeafTextSpan,
            'data-orient': 'h',
            'data-cy': secCy
          },
          secondLine
        )
      );
    }

    g.appendChild(textGroup);
    return g;
  }

  // Switch between Mẫu 1 (Kế Phả Đồ) and Mẫu 2 (Cây Đại Thụ)
  function switchViewMode(mode) {
    if (mode !== 'ke-pha' && mode !== 'cay-dai-thu') return;
    currentViewMode = mode;

    const btnKePha = document.getElementById('btnModeKePha');
    const btnCayDaiThu = document.getElementById('btnModeCayDaiThu');
    if (btnKePha && btnCayDaiThu) {
      btnKePha.classList.toggle('active', mode === 'ke-pha');
      btnCayDaiThu.classList.toggle('active', mode === 'cay-dai-thu');
    }

    renderPhaDo();
    if (selectedNodeId) {
      const node = familyData.nodes.find(n => n.id === selectedNodeId);
      if (node) {
        if (mode === 'cay-dai-thu') {
          focusOnPoint(node.banyanX || BANYAN_CX, node.banyanY || BANYAN_CY, 6800);
        } else {
          focusOnPoint(node.topX || 19242, (node.y || 2123) + 200, 7200);
        }
        return;
      }
    }
    fitFullScreen(true);
    showToast(
      mode === 'cay-dai-thu'
        ? '🌳 Đã chuyển sang Mẫu 2: Gia Phả Cây Đại Thụ!'
        : '📋 Đã chuyển sang Mẫu 1: Kế Phả Đồ Truyền Thống!'
    );
  }

  // Update ViewBox & Zoom Label
  function applyViewBox() {
    svgEl.setAttribute(
      'viewBox',
      `${Math.round(viewBox.x)} ${Math.round(viewBox.y)} ${Math.round(viewBox.w)} ${Math.round(viewBox.h)}`
    );
    const zoomPct = Math.round((WORLD_W / viewBox.w) * 100);
    zoomPercentLabel.textContent = `${zoomPct}%`;
  }

  function animateViewBoxTo(targetX, targetY, targetW, targetH, duration = 420) {
    if (animFrameId) cancelAnimationFrame(animFrameId);
    const startX = viewBox.x;
    const startY = viewBox.y;
    const startW = viewBox.w;
    const startH = viewBox.h;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3); // cubic ease-out
      viewBox.x = startX + (targetX - startX) * ease;
      viewBox.y = startY + (targetY - startY) * ease;
      viewBox.w = startW + (targetW - startW) * ease;
      viewBox.h = startH + (targetH - startH) * ease;
      applyViewBox();
      if (t < 1) {
        animFrameId = requestAnimationFrame(step);
      }
    }
    animFrameId = requestAnimationFrame(step);
  }

  function fitFullScreen(animate = true) {
    const rect = canvasContainer.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    let targetW = WORLD_W;
    let targetH = WORLD_W / aspect;
    if (targetH < WORLD_H) {
      targetH = WORLD_H;
      targetW = WORLD_H * aspect;
    }
    const targetX = (WORLD_W - targetW) / 2;
    const targetY = (WORLD_H - targetH) / 2;
    if (animate) {
      animateViewBoxTo(targetX, targetY, targetW, targetH);
    } else {
      viewBox = { x: targetX, y: targetY, w: targetW, h: targetH };
      applyViewBox();
    }
  }

  function focusOnPoint(worldX, worldY, targetZoomW = 8200) {
    const rect = canvasContainer.getBoundingClientRect();
    const aspect = rect.width / Math.max(1, rect.height);
    const w = targetZoomW;
    const h = w / aspect;
    const x = worldX - w / 2;
    const y = worldY - h / 2;
    animateViewBoxTo(x, y, w, h);
  }

  function focusGeneration(gen) {
    const gNum = Number(gen);
    const genNodes = familyData.nodes.filter(n => Number(n.generation) === gNum);
    if (genNodes.length === 0) return;

    if (currentViewMode === 'cay-dai-thu') {
      if (gNum <= 6) {
        const avgY =
          genNodes.reduce((sum, n) => sum + (n.banyanY || 15000), 0) / genNodes.length;
        const zoomSpan = gNum === 4 || gNum === 5 ? 13500 : 7800;
        focusOnPoint(BANYAN_CX, avgY, zoomSpan);
      } else {
        const { rx, ry } = getBanyanRingInfo(gNum);
        focusOnPoint(BANYAN_CX, BANYAN_CY - ry * 0.45, Math.max(9800, rx * 2.1));
      }
      return;
    }

    const gy = getGenBaselineY(gNum);
    const avgX =
      genNodes.reduce((sum, n) => sum + (n.topX || 19242), 0) / genNodes.length;
    const minX = Math.min(...genNodes.map(n => n.topX || 19242));
    const maxX = Math.max(...genNodes.map(n => n.topX || 19242));
    const spanW = Math.max(7500, Math.min(36000, maxX - minX + 4500));
    focusOnPoint(avgX, gy + 220, spanW);
  }

  // Select a member, highlight lineage, and open the detail drawer
  function selectMember(nodeId, panToNode = true) {
    const node = familyData.nodes.find(n => n.id === nodeId);
    if (!node) return;

    selectedNodeId = nodeId;
    highlightedIds = computeLineageSet(nodeId);
    renderPhaDo();
    populateDetailDrawer(node);
    memberDetailDrawer.classList.remove('hidden');

    if (panToNode) {
      if (currentViewMode === 'cay-dai-thu') {
        focusOnPoint(node.banyanX || BANYAN_CX, node.banyanY || BANYAN_CY, 6800);
      } else {
        focusOnPoint(node.topX, node.y + 200, 7200);
      }
    }
  }

  function clearSelection() {
    selectedNodeId = null;
    highlightedIds.clear();
    memberDetailDrawer.classList.add('hidden');
    renderPhaDo();
  }

  // Populate Right Side Detail Drawer
  function populateDetailDrawer(node) {
    const isMale = node.type === 'male';
    detailBadgeRole.textContent = isMale ? 'NAM ĐINH (NỘI TỘC)' : 'CON GÁI (NGOẠI TỘC)';
    detailBadgeRole.className = `role-badge ${isMale ? 'male' : 'female'}`;
    detailBadgeGen.textContent = `ĐỜI THỨ ${node.generation}`;

    detailMemberName.textContent = node.name;
    detailFullNameSub.textContent = node.fullName || '';

    detailCodeValue.textContent = node.code || '—';
    detailGioValue.textContent = node.gio ? node.gio.replace(/^G\.?\s*/, '') + ' Âm lịch' : '—';
    detailSinhValue.textContent =
      node.sinh && node.sinh.trim() !== 'S:' ? node.sinh.replace(/^S:\s*/, '') : 'Chưa cập nhật';

    const children = familyData.nodes.filter(n => n.parentId === node.id);
    detailChildrenCount.textContent = `${children.length} người`;

    // 1. Lineage Breadcrumb from Thủy Tổ Đời 1
    const chain = [];
    let curr = node;
    while (curr) {
      chain.unshift(curr);
      curr = curr.parentId ? familyData.nodes.find(n => n.id === curr.parentId) : null;
    }
    detailLineagePath.innerHTML = '';
    chain.forEach((item, idx) => {
      const span = document.createElement('span');
      span.className = `lineage-step ${item.id === node.id ? 'current' : ''}`;
      span.textContent = `Đ${item.generation}: ${item.name}`;
      span.addEventListener('click', () => selectMember(item.id, true));
      detailLineagePath.appendChild(span);
      if (idx < chain.length - 1) {
        const arrow = document.createElement('span');
        arrow.className = 'lineage-arrow';
        arrow.textContent = '➔';
        detailLineagePath.appendChild(arrow);
      }
    });

    // 2. Parents & Mother
    detailParentsBox.innerHTML = '';
    if (node.parentId) {
      const parent = familyData.nodes.find(n => n.id === node.parentId);
      if (parent) {
        const pChip = document.createElement('div');
        pChip.className = 'relative-chip';
        const mIdx = Number(node.motherIndex) || 0;
        const mother = parent.spouses && parent.spouses[mIdx];
        pChip.innerHTML = `
          <div>
            <strong>Cha: ${parent.name}</strong> (Đời ${parent.generation})
            <div style="font-size:12px;color:#64748b;margin-top:2px;">
              Mẹ: ${mother && mother.name ? mother.name : 'Chưa rõ tên'} ${mother && mother.gio ? '(' + mother.gio + ')' : ''}
            </div>
          </div>
          <span style="color:#d97706;font-weight:700;">Xem ➔</span>
        `;
        pChip.addEventListener('click', () => selectMember(parent.id, true));
        detailParentsBox.appendChild(pChip);
      }
    } else {
      detailParentsBox.innerHTML = `<div class="relative-chip static-chip" style="color:#64748b;">Thủy Tổ Phái Ất (Đời 1)</div>`;
    }

    // 3. Spouses
    detailSpousesTitle.textContent = isMale ? 'PHU NHÂN (VỢ)' : 'PHU QUÂN (CHỒNG / CON RỂ)';
    detailSpousesList.innerHTML = '';
    const validSpouses = (node.spouses || []).filter(s => s.name || s.gio || (s.sinh && s.sinh !== 'S:'));
    if (validSpouses.length > 0) {
      validSpouses.forEach((sp, i) => {
        const sChip = document.createElement('div');
        sChip.className = 'relative-chip static-chip';
        const orderLabel = isMale && validSpouses.length > 1 ? `Bà ${i + 1}: ` : '';
        const dateBadge = sp.gio || (sp.sinh && sp.sinh !== 'S:' ? sp.sinh : '');
        sChip.innerHTML = `
          <div>
            <strong>${orderLabel}${sp.name || '(Chưa ghi tên)'}</strong>
          </div>
          <span style="font-size:12px;color:#b91c1c;font-weight:600;">${dateBadge}</span>
        `;
        detailSpousesList.appendChild(sChip);
      });
    } else {
      detailSpousesList.innerHTML = `<div class="relative-chip static-chip" style="color:#64748b;">Chưa ghi nhận thông tin</div>`;
    }

    // 4. Children
    detailChildrenList.innerHTML = '';
    if (children.length > 0) {
      for (const ch of children) {
        const cChip = document.createElement('div');
        cChip.className = 'relative-chip';
        const spStr = (ch.spouses || []).map(s => s.name).filter(Boolean).join(', ');
        cChip.innerHTML = `
          <div>
            <span style="color:${ch.type === 'male' ? '#dc2626' : '#1d4ed8'};font-weight:700;">
              [${ch.type === 'male' ? 'Nam' : 'Nữ'}] ${ch.name}
            </span>
            ${spStr ? `<div style="font-size:11.5px;color:#64748b;">Vợ/Chồng: ${spStr}</div>` : ''}
          </div>
          <span style="font-size:12px;color:#64748b;">${ch.gio || ''} ➔</span>
        `;
        cChip.addEventListener('click', () => selectMember(ch.id, true));
        detailChildrenList.appendChild(cChip);
      }
    } else {
      detailChildrenList.innerHTML = `<div class="relative-chip static-chip" style="color:#64748b;">Chưa có dữ liệu đời con</div>`;
    }

    // 5. Siblings
    detailSiblingsList.innerHTML = '';
    if (node.parentId) {
      const siblings = familyData.nodes.filter(
        n => n.parentId === node.parentId && n.id !== node.id
      );
      if (siblings.length > 0) {
        for (const sib of siblings) {
          const sibChip = document.createElement('div');
          sibChip.className = 'relative-chip';
          sibChip.innerHTML = `
            <span>${sib.type === 'male' ? '👨' : '👩'} <strong>${sib.name}</strong></span>
            <span style="font-size:12px;color:#64748b;">Xem ➔</span>
          `;
          sibChip.addEventListener('click', () => selectMember(sib.id, true));
          detailSiblingsList.appendChild(sibChip);
        }
      } else {
        detailSiblingsList.innerHTML = `<div class="relative-chip static-chip" style="color:#64748b;">Con một</div>`;
      }
    } else {
      detailSiblingsList.innerHTML = `<div class="relative-chip static-chip" style="color:#64748b;">—</div>`;
    }

    detailNoteText.textContent = node.note || 'Chưa có ghi chú bổ sung.';
  }

  // Update Statistics & Generation Filter Select
  function updateStatsAndFilters() {
    const totalNodes = familyData.nodes.length;
    const maleCount = familyData.nodes.filter(n => n.type === 'male').length;
    const femaleCount = familyData.nodes.filter(n => n.type === 'female').length;
    const spouseCount = familyData.nodes.reduce(
      (acc, n) => acc + (n.spouses ? n.spouses.filter(s => s.name).length : 0),
      0
    );
    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));

    statsSummaryText.textContent = `${maxGen} Đời • ${totalNodes} Thành viên gốc (${maleCount} Nam đinh, ${femaleCount} Con gái) & ${spouseCount} Dâu/Rể`;

    // Populate generation filter dropdown
    const currentVal = genFilterSelect.value;
    genFilterSelect.innerHTML = `<option value="">Tất cả các Đời (1–${maxGen})</option>`;
    for (let g = 1; g <= maxGen; g++) {
      const cnt = familyData.nodes.filter(n => Number(n.generation) === g).length;
      const opt = document.createElement('option');
      opt.value = String(g);
      opt.textContent = `Đời thứ ${g} (${cnt} thành viên)`;
      genFilterSelect.appendChild(opt);
    }
    genFilterSelect.value = currentVal;

    // Update Gio count badge
    const gioList = extractAllGioRecords();
    document.getElementById('gioBadgeCount').textContent = String(gioList.length);
  }

  // Extract all Lunar Death Anniversary (Ngày Giỗ) records across the tree
  function extractAllGioRecords() {
    const list = [];

    function parseGioDayMonth(gioStr) {
      if (!gioStr) return null;
      const m = gioStr.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
      if (!m) return null;
      return { day: parseInt(m[1], 10), month: parseInt(m[2], 10) };
    }

    for (const node of familyData.nodes) {
      if (node.gio) {
        const dm = parseGioDayMonth(node.gio);
        const parent = node.parentId
          ? familyData.nodes.find(p => p.id === node.parentId)
          : null;
        list.push({
          nodeId: node.id,
          name: node.name,
          fullName: node.fullName || node.name,
          role: node.type === 'male' ? 'Nam đinh (Nội tộc)' : 'Cô (Con gái họ Nguyễn)',
          relation: parent ? `Con cụ ${parent.name}` : 'Thủy Tổ Phái Ất',
          generation: node.generation,
          gioRaw: node.gio,
          day: dm ? dm.day : 99,
          month: dm ? dm.month : 99
        });
      }
      if (Array.isArray(node.spouses)) {
        node.spouses.forEach((sp, idx) => {
          if (sp.gio) {
            const dm = parseGioDayMonth(sp.gio);
            list.push({
              nodeId: node.id,
              name: sp.name || `Phu nhân cụ ${node.name}`,
              fullName: sp.fullName || sp.name,
              role: 'Phu nhân (Nội tộc)',
              relation: `Phu nhân ${node.spouses.length > 1 ? '(Bà ' + (idx + 1) + ') ' : ''}cụ ${node.name}`,
              generation: node.generation,
              gioRaw: sp.gio,
              day: dm ? dm.day : 99,
              month: dm ? dm.month : 99
            });
          }
        });
      }
    }

    list.sort((a, b) => a.month - b.month || a.day - b.day || a.generation - b.generation);
    return list;
  }

  // Render Lunar Death Anniversary Table
  function renderGioModalTable() {
    const allRecords = extractAllGioRecords();
    const monthFilter = document.getElementById('gioMonthFilter').value;
    const query = normalizeVN(document.getElementById('gioSearchInput').value);
    const tbody = document.getElementById('gioTableBody');
    tbody.innerHTML = '';

    const monthNames = [
      '',
      'Tháng Giêng (1)',
      'Tháng Hai (2)',
      'Tháng Ba (3)',
      'Tháng Tư (4)',
      'Tháng Năm (5)',
      'Tháng Sáu (6)',
      'Tháng Bảy (7)',
      'Tháng Tám (8)',
      'Tháng Chín (9)',
      'Tháng Mười (10)',
      'Tháng Một (11)',
      'Tháng Chạp (12)'
    ];

    const filtered = allRecords.filter(r => {
      if (monthFilter !== 'all' && String(r.month) !== monthFilter) return false;
      if (query) {
        const hay = normalizeVN(`${r.name} ${r.fullName} ${r.relation} ${r.gioRaw}`);
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#64748b;padding:24px;">Không tìm thấy ngày giỗ phù hợp.</td></tr>`;
      return;
    }

    filtered.forEach((rec, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td><span class="gio-date-pill">Ngày ${rec.day}/${rec.month} ÂL</span></td>
        <td>${monthNames[rec.month] || '—'}</td>
        <td><strong>${rec.name}</strong></td>
        <td>${rec.role} — <span style="color:#64748b;">${rec.relation}</span></td>
        <td><span class="gen-badge">Đời ${rec.generation}</span></td>
        <td>
          <button class="btn btn-sm btn-outline jump-gio-btn" data-id="${rec.nodeId}">
            Xem trên Phả đồ ➔
          </button>
        </td>
      `;
      tr.querySelector('.jump-gio-btn').addEventListener('click', () => {
        document.getElementById('modalGioBackdrop').classList.add('hidden');
        selectMember(rec.nodeId, true);
      });
      tbody.appendChild(tr);
    });
  }

  // Search Engine
  function performSearch(rawQuery) {
    const q = normalizeVN(rawQuery);
    if (!q) {
      searchResultsDropdown.classList.add('hidden');
      btnClearSearch.classList.add('hidden');
      return;
    }
    btnClearSearch.classList.remove('hidden');

    const matches = [];
    for (const node of familyData.nodes) {
      const spouseNames = (node.spouses || []).map(s => `${s.name} ${s.fullName || ''} ${s.gio || ''}`).join(' ');
      const haystack = normalizeVN(
        `${node.name} ${node.fullName || ''} ${node.code || ''} ${node.gio || ''} doi ${node.generation} ${spouseNames}`
      );
      if (haystack.includes(q)) {
        matches.push(node);
      }
    }

    searchResultsDropdown.innerHTML = '';
    if (matches.length === 0) {
      searchResultsDropdown.innerHTML = `<div style="padding:14px;color:#64748b;font-size:13px;">Không tìm thấy thành viên nào khớp với "${rawQuery}".</div>`;
    } else {
      matches.slice(0, 25).forEach(node => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        const spText = (node.spouses || []).map(s => s.name).filter(Boolean).join(', ');
        div.innerHTML = `
          <div class="sr-main">
            <span class="sr-name">${node.code ? '(' + node.code + ') ' : ''}${node.name}</span>
            <span class="sr-sub">
              ${spText ? 'Vợ/Chồng: ' + spText + ' • ' : ''}${node.gio || node.sinh || ''}
            </span>
          </div>
          <div class="sr-badges">
            <span class="role-badge ${node.type === 'female' ? 'female' : ''}">${node.type === 'male' ? 'Nam' : 'Nữ'}</span>
            <span class="gen-badge">Đời ${node.generation}</span>
          </div>
        `;
        div.addEventListener('click', () => {
          searchResultsDropdown.classList.add('hidden');
          selectMember(node.id, true);
        });
        searchResultsDropdown.appendChild(div);
      });
    }
    searchResultsDropdown.classList.remove('hidden');
  }

  // Member Add / Edit Form Logic
  function openMemberForm({ mode, node = null, presetParent = null }) {
    const modal = document.getElementById('modalFormBackdrop');
    const titleEl = document.getElementById('formModalTitle');
    const idInput = document.getElementById('formMemberId');
    const typeSelect = document.getElementById('formType');
    const genInput = document.getElementById('formGeneration');
    const nameInput = document.getElementById('formName');
    const codeInput = document.getElementById('formCode');
    const fullNameInput = document.getElementById('formFullName');
    const parentSelect = document.getElementById('formParentId');
    const motherSelect = document.getElementById('formMotherIndex');
    const gioInput = document.getElementById('formGio');
    const sinhInput = document.getElementById('formSinh');
    const topXInput = document.getElementById('formTopX');
    const noteInput = document.getElementById('formNote');
    const spousesContainer = document.getElementById('formSpousesContainer');

    spousesContainer.innerHTML = '';

    if (mode === 'edit' && node) {
      titleEl.textContent = `✏️ Sửa thông tin: ${node.name} (Đời ${node.generation})`;
      idInput.value = node.id;
      typeSelect.value = node.type;
      genInput.value = node.generation;
      nameInput.value = node.name;
      codeInput.value = node.code || '';
      fullNameInput.value = node.fullName || '';
      gioInput.value = node.gio || '';
      sinhInput.value = node.sinh || '';
      topXInput.value = node.topX || '';
      noteInput.value = node.note || '';

      populateParentDropdown(node.generation, node.parentId);
      populateMotherDropdown(node.parentId, node.motherIndex || 0);

      const spList = node.spouses && node.spouses.length > 0 ? node.spouses : [];
      spList.forEach(sp => addSpouseRowToForm(sp));
    } else {
      const targetGen = presetParent ? Number(presetParent.generation) + 1 : 1;
      titleEl.textContent = presetParent
        ? `+ Thêm Con của cụ ${presetParent.name} (Đời ${targetGen})`
        : '+ Thêm Thành Viên Mới';
      idInput.value = '';
      typeSelect.value = 'male';
      genInput.value = targetGen;
      nameInput.value = '';
      codeInput.value = '';
      fullNameInput.value = '';
      gioInput.value = '';
      sinhInput.value = 'S:';
      topXInput.value = '';
      noteInput.value = '';

      populateParentDropdown(targetGen, presetParent ? presetParent.id : '');
      populateMotherDropdown(presetParent ? presetParent.id : '', 0);
    }

    modal.classList.remove('hidden');
  }

  function populateParentDropdown(childGen, selectedParentId) {
    const parentSelect = document.getElementById('formParentId');
    parentSelect.innerHTML = `<option value="">-- Không có / Thủy Tổ --</option>`;
    const targetParentGen = Number(childGen) - 1;
    const candidates = familyData.nodes.filter(
      n => Number(n.generation) === targetParentGen && n.type === 'male'
    );
    for (const p of candidates) {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `[Đời ${p.generation}] ${p.code ? '(' + p.code + ') ' : ''}${p.name}`;
      parentSelect.appendChild(opt);
    }
    parentSelect.value = selectedParentId || '';
  }

  function populateMotherDropdown(parentId, selectedMotherIdx) {
    const motherSelect = document.getElementById('formMotherIndex');
    motherSelect.innerHTML = '';
    const parent = familyData.nodes.find(n => n.id === parentId);
    if (parent && parent.spouses && parent.spouses.length > 0) {
      parent.spouses.forEach((sp, idx) => {
        const opt = document.createElement('option');
        opt.value = String(idx);
        opt.textContent = `Bà ${idx + 1}: ${sp.name || '(Chưa ghi tên)'}`;
        motherSelect.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = '0';
      opt.textContent = 'Vợ cả / Chính thất (Mặc định)';
      motherSelect.appendChild(opt);
    }
    motherSelect.value = String(selectedMotherIdx || 0);
  }

  function addSpouseRowToForm(sp = { name: '', gio: '', sinh: '' }) {
    const container = document.getElementById('formSpousesContainer');
    const row = document.createElement('div');
    row.className = 'spouse-edit-row';
    row.innerHTML = `
      <input type="text" class="sp-name-in" placeholder="Họ tên Vợ / Chồng" value="${sp.name || ''}" />
      <input type="text" class="sp-gio-in" placeholder="Ngày giỗ (G. 10/2)" value="${sp.gio || ''}" />
      <input type="text" class="sp-sinh-in" placeholder="Năm sinh (S:)" value="${sp.sinh || ''}" />
      <button type="button" class="btn btn-sm btn-danger-outline sp-remove-btn" title="Xóa dòng">✕</button>
    `;
    row.querySelector('.sp-remove-btn').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  // Export High-Resolution PNG of the Entire Phả Đồ (Kế Phả Đồ or Cây Đại Thụ)
  function exportHighResPNG() {
    showToast('Đang kết xuất ảnh Phả Đồ khổ lớn (Ultra-HD)...');
    const cloneSvg = svgEl.cloneNode(true);
    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));
    const isBanyan = currentViewMode === 'cay-dai-thu';
    const exportY = isBanyan ? 0 : 400;
    const exportW = isBanyan ? 30000 : 37600;
    const exportH = isBanyan ? 21600 : getGenBaselineY(maxGen) + 1400;

    cloneSvg.setAttribute('viewBox', `0 ${exportY} ${exportW} ${exportH}`);
    cloneSvg.setAttribute('width', '6400');
    cloneSvg.setAttribute('height', String(Math.round((6400 * exportH) / exportW)));

    // Insert solid background rect for PNG export
    const bgRect = createSvgEl('rect', {
      x: 0,
      y: exportY,
      width: exportW,
      height: exportH,
      fill: isBanyan ? '#f7f2e4' : '#ffffff'
    });
    cloneSvg.insertBefore(bgRect, cloneSvg.firstChild);

    const svgData = new XMLSerializer().serializeToString(cloneSvg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      canvas.width = 6400;
      canvas.height = Math.round((6400 * exportH) / exportW);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = isBanyan ? '#f7f2e4' : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = isBanyan
          ? 'Cay-Dai-Thu-Phai-At-Ho-Nguyen-Phuc.png'
          : 'Ke-Pha-Do-Phai-At-Ho-Nguyen-Phuc.png';
        a.click();
        showToast('✅ Đã tải xuống ảnh PNG khổ lớn thành công!');
      }, 'image/png');
    };
    img.src = url;
  }

  function exportVectorSVG() {
    const cloneSvg = svgEl.cloneNode(true);
    const maxGen = Math.max(14, ...familyData.nodes.map(n => Number(n.generation) || 1));
    const isBanyan = currentViewMode === 'cay-dai-thu';
    const exportY = isBanyan ? 0 : 400;
    const exportW = isBanyan ? 30000 : 37600;
    const exportH = isBanyan ? 21600 : getGenBaselineY(maxGen) + 1400;
    cloneSvg.setAttribute('viewBox', `0 ${exportY} ${exportW} ${exportH}`);
    cloneSvg.setAttribute('width', String(Math.round(exportW / 10)));
    cloneSvg.setAttribute('height', String(Math.round(exportH / 10)));

    const bgRect = createSvgEl('rect', {
      x: 0,
      y: exportY,
      width: exportW,
      height: exportH,
      fill: isBanyan ? '#f7f2e4' : '#ffffff'
    });
    cloneSvg.insertBefore(bgRect, cloneSvg.firstChild);

    const svgData = new XMLSerializer().serializeToString(cloneSvg);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = isBanyan
      ? 'Cay-Dai-Thu-Phai-At-Ho-Nguyen-Phuc.svg'
      : 'Ke-Pha-Do-Phai-At-Ho-Nguyen-Phuc.svg';
    a.click();
    showToast('✅ Đã xuất file Vector SVG gốc!');
  }

  // Export CSV for Excel / Google Sheets
  function exportToCSV() {
    const headers = [
      'ID',
      'Đời',
      'Vai trò (male/female)',
      'Tên trên Phả đồ',
      'Họ tên đầy đủ',
      'Mã nhánh',
      'Ngày Giỗ (G.)',
      'Năm sinh (S:)',
      'ID Cha',
      'Thứ tự Mẹ (0,1,2)',
      'Danh sách Vợ/Chồng (ngăn cách bởi |)',
      'Ngày Giỗ Vợ/Chồng',
      'Tọa độ X',
      'Ghi chú'
    ];
    const rows = [headers.join(',')];
    for (const n of familyData.nodes) {
      const spNames = (n.spouses || []).map(s => s.name || '').join(' | ');
      const spGios = (n.spouses || []).map(s => s.gio || '').join(' | ');
      const cols = [
        n.id,
        n.generation,
        n.type,
        `"${(n.name || '').replace(/"/g, '""')}"`,
        `"${(n.fullName || '').replace(/"/g, '""')}"`,
        `"${(n.code || '').replace(/"/g, '""')}"`,
        `"${(n.gio || '').replace(/"/g, '""')}"`,
        `"${(n.sinh || '').replace(/"/g, '""')}"`,
        n.parentId || '',
        n.motherIndex || 0,
        `"${spNames.replace(/"/g, '""')}"`,
        `"${spGios.replace(/"/g, '""')}"`,
        n.topX || '',
        `"${(n.note || '').replace(/"/g, '""')}"`
      ];
      rows.push(cols.join(','));
    }
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Gia-Pha-Ho-Nguyen-Phuc-Phai-At.csv';
    a.click();
    showToast('✅ Đã xuất bảng CSV chuẩn Excel / Google Sheets!');
  }

  function parseCSVRow(line) {
    const res = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        res.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    res.push(cur);
    return res;
  }

  function importFromCSVText(csvText) {
    const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) {
      alert('File CSV không có dữ liệu hợp lệ.');
      return;
    }
    const newNodes = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVRow(lines[i]);
      if (cols.length < 4 || !cols[0]) continue;
      const gen = Number(cols[1]) || 1;
      const topX = cols[12] ? Number(cols[12]) : null;
      const spNames = (cols[10] || '').split('|').map(s => s.trim());
      const spGios = (cols[11] || '').split('|').map(s => s.trim());
      const spouses = [];
      spNames.forEach((sn, idx) => {
        if (sn || spGios[idx]) {
          spouses.push({
            name: sn,
            fullName: sn,
            gio: spGios[idx] || '',
            sinh: '',
            x: topX ? topX + idx * 920 : null
          });
        }
      });
      newNodes.push({
        id: cols[0].trim(),
        generation: gen,
        type: cols[2].trim() === 'female' ? 'female' : 'male',
        name: cols[3].trim(),
        fullName: (cols[4] || cols[3]).trim(),
        code: (cols[5] || '').trim(),
        gio: (cols[6] || '').trim(),
        sinh: (cols[7] || '').trim(),
        parentId: cols[8] ? cols[8].trim() : null,
        motherIndex: Number(cols[9]) || 0,
        topX: topX,
        x: topX,
        y: getGenBaselineY(gen),
        barY: getGenBaselineY(gen) - 296,
        spouses,
        note: (cols[13] || '').trim()
      });
    }
    if (newNodes.length > 0) {
      familyData.nodes = newNodes;
      saveDataToStorage();
      renderPhaDo();
      fitFullScreen(true);
      showToast(`✅ Đã đồng bộ ${newNodes.length} thành viên từ Google Sheets!`);
    }
  }

  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  // Set up Event Listeners (Pan, Zoom, Modals, Buttons)
  function setupInteractions() {
    // Mouse Pan
    canvasContainer.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      isDragging = true;
      canvasContainer.classList.add('dragging');
      dragStart = { x: e.clientX, y: e.clientY, vx: viewBox.x, vy: viewBox.y };
    });

    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const rect = canvasContainer.getBoundingClientRect();
      const dx = (e.clientX - dragStart.x) * (viewBox.w / rect.width);
      const dy = (e.clientY - dragStart.y) * (viewBox.h / rect.height);
      viewBox.x = dragStart.vx - dx;
      viewBox.y = dragStart.vy - dy;
      applyViewBox();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      canvasContainer.classList.remove('dragging');
    });

    // Touch Pan
    canvasContainer.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        isDragging = true;
        dragStart = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          vx: viewBox.x,
          vy: viewBox.y
        };
      }
    });

    canvasContainer.addEventListener('touchmove', e => {
      if (!isDragging || e.touches.length !== 1) return;
      const rect = canvasContainer.getBoundingClientRect();
      const dx = (e.touches[0].clientX - dragStart.x) * (viewBox.w / rect.width);
      const dy = (e.touches[0].clientY - dragStart.y) * (viewBox.h / rect.height);
      viewBox.x = dragStart.vx - dx;
      viewBox.y = dragStart.vy - dy;
      applyViewBox();
    });

    canvasContainer.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Wheel Zoom centered at cursor
    canvasContainer.addEventListener(
      'wheel',
      e => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 0.84 : 1.19;
        const rect = canvasContainer.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / rect.width;
        const my = (e.clientY - rect.top) / rect.height;

        const newW = Math.max(2200, Math.min(65000, viewBox.w * zoomFactor));
        const newH = Math.max(1200, Math.min(45000, viewBox.h * zoomFactor));

        viewBox.x += (viewBox.w - newW) * mx;
        viewBox.y += (viewBox.h - newH) * my;
        viewBox.w = newW;
        viewBox.h = newH;
        applyViewBox();
      },
      { passive: false }
    );

    // Zoom Buttons
    document.getElementById('btnZoomIn').addEventListener('click', () => {
      animateViewBoxTo(
        viewBox.x + viewBox.w * 0.125,
        viewBox.y + viewBox.h * 0.125,
        viewBox.w * 0.75,
        viewBox.h * 0.75,
        220
      );
    });

    document.getElementById('btnZoomOut').addEventListener('click', () => {
      animateViewBoxTo(
        viewBox.x - viewBox.w * 0.16,
        viewBox.y - viewBox.h * 0.16,
        viewBox.w * 1.32,
        viewBox.h * 1.32,
        220
      );
    });

    document.getElementById('btnFitScreen').addEventListener('click', () => fitFullScreen(true));
    document.getElementById('btnFocusRoot').addEventListener('click', () => {
      const root = familyData.nodes.find(n => Number(n.generation) === 1);
      if (root) selectMember(root.id, true);
    });
    document.getElementById('btnHomeReset').addEventListener('click', () => fitFullScreen(true));

    // View Mode Switcher Buttons (Mẫu 1: Kế Phả Đồ vs Mẫu 2: Cây Đại Thụ)
    const btnModeKePha = document.getElementById('btnModeKePha');
    const btnModeCayDaiThu = document.getElementById('btnModeCayDaiThu');
    if (btnModeKePha) {
      btnModeKePha.addEventListener('click', () => switchViewMode('ke-pha'));
    }
    if (btnModeCayDaiThu) {
      btnModeCayDaiThu.addEventListener('click', () => switchViewMode('cay-dai-thu'));
    }

    // Generation Filter
    genFilterSelect.addEventListener('change', () => {
      const g = genFilterSelect.value;
      if (g) focusGeneration(Number(g));
      else fitFullScreen(true);
    });

    // Search Input
    searchInput.addEventListener('input', e => performSearch(e.target.value));
    searchInput.addEventListener('focus', e => {
      if (e.target.value.trim()) performSearch(e.target.value);
    });
    btnClearSearch.addEventListener('click', () => {
      searchInput.value = '';
      performSearch('');
    });

    // Close dropdowns on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-bar-wrap')) {
        searchResultsDropdown.classList.add('hidden');
      }
      if (!e.target.closest('.dropdown-wrap')) {
        document.getElementById('exportMenuDropdown').classList.add('hidden');
      }
    });

    // Drawer Buttons
    document.getElementById('btnCloseDrawer').addEventListener('click', clearSelection);

    document.getElementById('btnEditMember').addEventListener('click', () => {
      const node = familyData.nodes.find(n => n.id === selectedNodeId);
      if (node) openMemberForm({ mode: 'edit', node });
    });

    document.getElementById('btnAddChildToMember').addEventListener('click', () => {
      const node = familyData.nodes.find(n => n.id === selectedNodeId);
      if (!node) return;
      if (node.type === 'female') {
        alert('Theo quy ước Phả Đồ Nội Tộc, nhánh con cháu nội tộc được nối từ các ô Nam đinh. Bạn có thể ghi chú thông tin con của các Cô vào mục Ghi chú / Tiểu sử.');
        return;
      }
      openMemberForm({ mode: 'add', presetParent: node });
    });

    document.getElementById('btnAddSpouseToMember').addEventListener('click', () => {
      const node = familyData.nodes.find(n => n.id === selectedNodeId);
      if (!node) return;
      openMemberForm({ mode: 'edit', node });
      addSpouseRowToForm();
    });

    document.getElementById('btnDeleteMember').addEventListener('click', () => {
      const node = familyData.nodes.find(n => n.id === selectedNodeId);
      if (!node) return;
      const hasChildren = familyData.nodes.some(n => n.parentId === node.id);
      const msg = hasChildren
        ? `CẢNH BÁO: "${node.name}" đang có các nhánh con phía dưới. Bạn muốn tạo đề xuất xóa thành viên này?`
        : `Bạn muốn gửi đề xuất xóa "${node.name}" khỏi phả đồ?`;
      if (!confirm(msg)) return;
      openContributorModal({
        changeType: 'XOA',
        beforeNode: JSON.parse(JSON.stringify(node)),
        afterNode: null,
        diffSummary: buildNodeDiffSummary('XOA', node, null)
      });
    });

    // Topbar Buttons
    document.getElementById('btnAddRootMember').addEventListener('click', () => {
      const presetParent = selectedNodeId
        ? familyData.nodes.find(n => n.id === selectedNodeId && n.type === 'male')
        : familyData.nodes.find(n => Number(n.generation) === 1);
      openMemberForm({ mode: 'add', presetParent });
    });

    // Gio Modal
    document.getElementById('btnGioModal').addEventListener('click', () => {
      renderGioModalTable();
      document.getElementById('modalGioBackdrop').classList.remove('hidden');
    });
    document.getElementById('btnCloseGioModal').addEventListener('click', () => {
      document.getElementById('modalGioBackdrop').classList.add('hidden');
    });
    document.getElementById('gioMonthFilter').addEventListener('change', renderGioModalTable);
    document.getElementById('gioSearchInput').addEventListener('input', renderGioModalTable);
    document.getElementById('btnPrintGioList').addEventListener('click', () => window.print());

    // Form Modal Events
    document.getElementById('btnCloseFormModal').addEventListener('click', () => {
      document.getElementById('modalFormBackdrop').classList.add('hidden');
    });
    document.getElementById('btnCancelForm').addEventListener('click', () => {
      document.getElementById('modalFormBackdrop').classList.add('hidden');
    });
    document.getElementById('formGeneration').addEventListener('change', e => {
      populateParentDropdown(Number(e.target.value), '');
      populateMotherDropdown('', 0);
    });
    document.getElementById('formParentId').addEventListener('change', e => {
      populateMotherDropdown(e.target.value, 0);
    });
    document.getElementById('btnFormAddSpouseRow').addEventListener('click', () => {
      addSpouseRowToForm();
    });

    document.getElementById('memberForm').addEventListener('submit', e => {
      e.preventDefault();
      const idVal = document.getElementById('formMemberId').value;
      const typeVal = document.getElementById('formType').value;
      const genVal = Number(document.getElementById('formGeneration').value);
      const nameVal = document.getElementById('formName').value.trim();
      const codeVal = document.getElementById('formCode').value.trim();
      const fullNameVal = document.getElementById('formFullName').value.trim();
      const parentIdVal = document.getElementById('formParentId').value || null;
      const motherIdxVal = Number(document.getElementById('formMotherIndex').value) || 0;
      const gioVal = document.getElementById('formGio').value.trim();
      const sinhVal = document.getElementById('formSinh').value.trim();
      const topXVal = document.getElementById('formTopX').value
        ? Number(document.getElementById('formTopX').value)
        : null;
      const noteVal = document.getElementById('formNote').value.trim();

      const spouseRows = document.querySelectorAll('#formSpousesContainer .spouse-edit-row');
      const spouses = [];
      spouseRows.forEach(r => {
        const sName = r.querySelector('.sp-name-in').value.trim();
        const sGio = r.querySelector('.sp-gio-in').value.trim();
        const sSinh = r.querySelector('.sp-sinh-in').value.trim();
        if (sName || sGio || sSinh) {
          spouses.push({ name: sName, fullName: sName, gio: sGio, sinh: sSinh });
        }
      });

      const resolvedFullName =
        fullNameVal ||
        (typeVal === 'male' &&
        !nameVal.toUpperCase().startsWith('NGUYỄN') &&
        !nameVal.toUpperCase().startsWith('NG.')
          ? `NGUYỄN ${nameVal.toUpperCase()}`
          : nameVal);

      if (idVal) {
        const existing = familyData.nodes.find(n => n.id === idVal);
        if (!existing) return;
        const beforeNode = JSON.parse(JSON.stringify(existing));
        const afterNode = JSON.parse(JSON.stringify(existing));
        afterNode.type = typeVal;
        afterNode.generation = genVal;
        afterNode.name = nameVal;
        afterNode.code = codeVal;
        afterNode.fullName = resolvedFullName;
        afterNode.parentId = parentIdVal;
        afterNode.motherIndex = motherIdxVal;
        afterNode.gio = gioVal;
        afterNode.sinh = sinhVal;
        if (topXVal) {
          afterNode.topX = topXVal;
          afterNode.x = topXVal;
        }
        afterNode.note = noteVal;
        afterNode.spouses = spouses.map((s, idx) => ({
          ...s,
          x: existing.spouses[idx]?.x || (afterNode.topX || 19242) + idx * 920
        }));

        document.getElementById('modalFormBackdrop').classList.add('hidden');
        openContributorModal({
          changeType: 'SUA',
          beforeNode,
          afterNode,
          diffSummary: buildNodeDiffSummary('SUA', beforeNode, afterNode)
        });
      } else {
        const newId = 'N' + (Date.now() % 1000000);
        const newNode = {
          id: newId,
          generation: genVal,
          type: typeVal,
          name: nameVal,
          fullName: resolvedFullName,
          code: codeVal,
          gio: gioVal,
          sinh: sinhVal,
          parentId: parentIdVal,
          motherIndex: motherIdxVal,
          topX: topXVal,
          x: topXVal,
          y: getGenBaselineY(genVal),
          barY: getGenBaselineY(genVal) - 296,
          spouses,
          note: noteVal
        };
        document.getElementById('modalFormBackdrop').classList.add('hidden');
        openContributorModal({
          changeType: 'THEM',
          beforeNode: null,
          afterNode: newNode,
          diffSummary: buildNodeDiffSummary('THEM', null, newNode)
        });
      }
    });

    // Export & Data Dropdown Menu
    document.getElementById('btnExportMenu').addEventListener('click', e => {
      e.stopPropagation();
      document.getElementById('exportMenuDropdown').classList.toggle('hidden');
    });

    document.getElementById('btnExportPNG').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      exportHighResPNG();
    });

    document.getElementById('btnExportSVG').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      exportVectorSVG();
    });

    document.getElementById('btnPrintPDF').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      fitFullScreen(false);
      setTimeout(() => window.print(), 150);
    });

    document.getElementById('btnSaveJSON').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      const blob = new Blob([JSON.stringify(familyData, null, 2)], {
        type: 'application/json;charset=utf-8'
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'giapha-ho-nguyen-phuc-phai-at.json';
      a.click();
      showToast('💾 Đã tải xuống file dữ liệu JSON!');
    });

    document.getElementById('inputImportJSON').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const imported = JSON.parse(evt.target.result);
          if (imported && Array.isArray(imported.nodes)) {
            familyData = imported;
            if (!familyData.metadata) familyData.metadata = JSON.parse(JSON.stringify(DEFAULT_METADATA));
            if (!familyData.genY) {
              familyData.genY =
                (window.INITIAL_FAMILY_DATA && window.INITIAL_FAMILY_DATA.genY) ||
                JSON.parse(JSON.stringify(DEFAULT_GEN_Y));
            }
            if (!APPS_SCRIPT_URL) saveDataToStorage();
            renderPhaDo();
            fitFullScreen(true);
            showToast(`✅ Đã nạp tạm ${familyData.nodes.length} thành viên lên giao diện!`);
          } else {
            alert('File JSON không đúng định dạng dữ liệu Gia Phả.');
          }
        } catch (err) {
          alert('Lỗi đọc file JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btnSyncGoogleSheet').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      document.getElementById('modalSheetBackdrop').classList.remove('hidden');
    });

    document.getElementById('btnCloseSheetModal').addEventListener('click', () => {
      document.getElementById('modalSheetBackdrop').classList.add('hidden');
    });

    document.getElementById('btnExportCSV').addEventListener('click', exportToCSV);

    document.getElementById('btnLoadFromSheetUrl').addEventListener('click', async () => {
      const url = document.getElementById('inputGoogleSheetUrl').value.trim();
      if (!url) {
        alert('Vui lòng dán đường dẫn CSV đã xuất bản từ Google Sheets.');
        return;
      }
      try {
        showToast('🔄 Đang tải dữ liệu từ Google Sheets...');
        const res = await fetch(url);
        if (!res.ok) throw new Error('Không thể truy cập URL (' + res.status + ')');
        const csvText = await res.text();
        importFromCSVText(csvText);
        document.getElementById('modalSheetBackdrop').classList.add('hidden');
      } catch (err) {
        alert('Lỗi tải từ Google Sheets: ' + err.message);
      }
    });

    document.getElementById('btnTogglePaperTheme').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      canvasContainer.classList.toggle('vintage-paper');
      showToast('📜 Đã chuyển đổi phong cách nền bản vẽ!');
    });

    document.getElementById('btnResetDefaultData').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      if (!window.INITIAL_FAMILY_DATA) {
        alert('Chế độ online lấy dữ liệu chính thức trực tiếp từ Google Sheets (không có file data.js cục bộ).');
        return;
      }
      if (
        !confirm(
          'Bạn có chắc muốn khôi phục dữ liệu về bản gốc ngày 25/01/2026 (146 thành viên)? Các chỉnh sửa tạm trên trình duyệt sẽ được đặt lại.'
        )
      ) {
        return;
      }
      localStorage.removeItem(STORAGE_KEY);
      familyData = JSON.parse(JSON.stringify(window.INITIAL_FAMILY_DATA));
      clearSelection();
      fitFullScreen(true);
      showToast('↺ Đã khôi phục dữ liệu gốc (25/01/2026)!');
    });
  }

  // ==================== BẢO MẬT & QUY TRÌNH DUYỆT ĐỀ XUẤT ====================

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function callAppsScript(payload) {
    if (!APPS_SCRIPT_URL) {
      throw new Error('Chưa cấu hình APPS_SCRIPT_URL trong config.js');
    }
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      throw new Error('Lỗi kết nối máy chủ (' + res.status + ')');
    }
    const data = await res.json();
    if (!data || !data.ok) {
      throw new Error((data && data.error) || 'Yêu cầu thất bại');
    }
    return data;
  }

  function applyServerNodes(nodes) {
    familyData = {
      metadata: JSON.parse(JSON.stringify(DEFAULT_METADATA)),
      genY: JSON.parse(JSON.stringify(DEFAULT_GEN_Y)),
      nodes: Array.isArray(nodes) ? nodes : []
    };
    selectedNodeId = null;
    highlightedIds.clear();
    memberDetailDrawer.classList.add('hidden');
    renderPhaDo();
    fitFullScreen(false);
  }

  function updateRoleUI(pendingCount = 0) {
    const isAdmin = authSession.role === 'admin';
    const btnAdmin = document.getElementById('btnAdminApprovals');
    const btnSeedMenu = document.getElementById('btnAdminSeedSheets');
    const badge = document.getElementById('pendingProposalBadge');

    if (btnAdmin) btnAdmin.classList.toggle('hidden', !isAdmin);
    if (btnSeedMenu) btnSeedMenu.classList.toggle('hidden', !isAdmin);
    if (badge) badge.textContent = String(pendingCount || 0);
  }

  function buildNodeDiffSummary(changeType, beforeNode, afterNode) {
    if (changeType === 'THEM' && afterNode) {
      const spText = (afterNode.spouses || []).map(s => `${s.name}${s.gio ? ' (' + s.gio + ')' : ''}`).join(', ');
      return [
        `[THÊM MỚI] Đời ${afterNode.generation} — ${afterNode.name}`,
        `- Vai trò: ${afterNode.type === 'female' ? 'Con gái' : 'Nam đinh'}`,
        afterNode.fullName ? `- Họ tên đầy đủ: ${afterNode.fullName}` : '',
        afterNode.code ? `- Mã nhánh: ${afterNode.code}` : '',
        afterNode.gio ? `- Ngày Giỗ: ${afterNode.gio}` : '',
        afterNode.sinh ? `- Năm sinh: ${afterNode.sinh}` : '',
        spText ? `- Vợ/Chồng: ${spText}` : '',
        afterNode.note ? `- Ghi chú: ${afterNode.note}` : ''
      ]
        .filter(Boolean)
        .join('\n');
    }
    if (changeType === 'XOA' && beforeNode) {
      return `[ĐỀ XUẤT XÓA] Đời ${beforeNode.generation} — ${beforeNode.name} (ID: ${beforeNode.id})\n- Họ tên: ${beforeNode.fullName || beforeNode.name}\n- Ngày Giỗ: ${beforeNode.gio || '—'}`;
    }
    if (changeType === 'SUA' && beforeNode && afterNode) {
      const diffs = [`[CHỈNH SỬA] Đời ${afterNode.generation} — ${afterNode.name} (ID: ${afterNode.id})`];
      const checks = [
        ['Tên phả đồ', beforeNode.name || '', afterNode.name || ''],
        ['Họ tên đầy đủ', beforeNode.fullName || '', afterNode.fullName || ''],
        ['Đời thứ', String(beforeNode.generation || ''), String(afterNode.generation || '')],
        ['Vai trò', beforeNode.type || '', afterNode.type || ''],
        ['Mã nhánh', beforeNode.code || '', afterNode.code || ''],
        ['Ngày Giỗ', beforeNode.gio || '', afterNode.gio || ''],
        ['Năm sinh', beforeNode.sinh || '', afterNode.sinh || ''],
        ['ID Cha', beforeNode.parentId || '', afterNode.parentId || ''],
        ['Ghi chú', beforeNode.note || '', afterNode.note || '']
      ];
      checks.forEach(([label, oldV, newV]) => {
        if (oldV !== newV) {
          diffs.push(`- ${label}: "${oldV || '(trống)'}" → "${newV || '(trống)'}"`);
        }
      });
      const oldSp = (beforeNode.spouses || []).map(s => `${s.name || ''}${s.gio ? ' [' + s.gio + ']' : ''}`).join(' | ');
      const newSp = (afterNode.spouses || []).map(s => `${s.name || ''}${s.gio ? ' [' + s.gio + ']' : ''}`).join(' | ');
      if (oldSp !== newSp) {
        diffs.push(`- Vợ/Chồng: "${oldSp || '(chưa có)'}" → "${newSp || '(trống)'}"`);
      }
      if (diffs.length === 1) {
        diffs.push('- (Không có trường dữ liệu nào thay đổi so với bản gốc)');
      }
      return diffs.join('\n');
    }
    return '';
  }

  function downloadCsvText(filename, csvText) {
    const content = csvText.startsWith('\uFEFF') ? csvText : '\uFEFF' + csvText;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
  }

  function downloadLocalProposalCsv(changeType, contributor, beforeNode, afterNode, diffSummary) {
    const headers = [
      'ThoiGianGui',
      'TrangThai',
      'LoaiThayDoi',
      'TenNguoiGui',
      'SoDienThoai',
      'Email_QuanHe',
      'LyDoSua',
      'NodeID',
      'Doi',
      'TenThanhVien',
      'NoiDungThayDoiChiTiet',
      'DuLieuTruoc_JSON',
      'DuLieuSau_JSON'
    ];
    const target = afterNode || beforeNode || {};
    const row = [
      new Date().toLocaleString('vi-VN'),
      'CHO_DUYET',
      changeType,
      contributor.name,
      contributor.phone,
      contributor.relationEmail || '',
      contributor.reason || '',
      target.id || '',
      target.generation || '',
      target.name || '',
      diffSummary,
      beforeNode ? JSON.stringify(beforeNode) : '',
      afterNode ? JSON.stringify(afterNode) : ''
    ];
    const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = headers.map(esc).join(',') + '\r\n' + row.map(esc).join(',');
    const fileTag = (target.name || 'ThanhVien').replace(/\s+/g, '_');
    downloadCsvText(`DeXuat-${changeType}-${fileTag}.csv`, csv);
  }

  function unlockScreen() {
    document.body.classList.remove('app-locked');
    document.getElementById('authGateOverlay').classList.add('hidden');
  }

  function lockScreen() {
    authSession = { unlocked: false, password: '', role: 'member', isLocalDemo: false };
    try {
      sessionStorage.removeItem(AUTH_SESSION_KEY);
    } catch (e) {}
    document.getElementById('authPasswordInput').value = '';
    document.getElementById('authErrorMsg').classList.add('hidden');
    document.body.classList.add('app-locked');
    document.getElementById('authGateOverlay').classList.remove('hidden');
  }

  function setupAuthGate() {
    const titleEl = document.getElementById('authClanTitle');
    const subEl = document.getElementById('authClanSubtitle');
    if (APP_CFG.CLAN_TITLE && titleEl) titleEl.textContent = APP_CFG.CLAN_TITLE;
    if (APP_CFG.CLAN_SUBTITLE && subEl) subEl.textContent = APP_CFG.CLAN_SUBTITLE;

    const passInput = document.getElementById('authPasswordInput');
    const errEl = document.getElementById('authErrorMsg');
    const submitBtn = document.getElementById('btnAuthSubmit');
    const localBox = document.getElementById('authLocalFallbackBox');

    if (!APPS_SCRIPT_URL && window.INITIAL_FAMILY_DATA && localBox) {
      localBox.classList.remove('hidden');
    }

    document.getElementById('btnToggleAuthPass').addEventListener('click', () => {
      passInput.type = passInput.type === 'password' ? 'text' : 'password';
    });

    async function performLogin(password) {
      errEl.classList.add('hidden');
      if (!APPS_SCRIPT_URL) {
        if (window.INITIAL_FAMILY_DATA) {
          errEl.textContent =
            'Chưa cấu hình APPS_SCRIPT_URL trong config.js. Vui lòng bấm nút "Vào Chế Độ Xem Thử Nội Bộ" bên dưới hoặc cấu hình Apps Script.';
        } else {
          errEl.textContent =
            'Hệ thống chưa được kết nối tới Google Apps Script (config.js thiếu APPS_SCRIPT_URL).';
        }
        errEl.classList.remove('hidden');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = '⏳ Đang xác thực & tải phả đồ...';
      try {
        const res = await callAppsScript({ action: 'login', password });
        authSession = {
          unlocked: true,
          password,
          role: res.role || 'member',
          isLocalDemo: false
        };
        try {
          sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ password }));
        } catch (e) {}

        unlockScreen();
        updateRoleUI(res.pendingCount || 0);

        if (res.needsSeed && window.INITIAL_FAMILY_DATA) {
          familyData = JSON.parse(JSON.stringify(window.INITIAL_FAMILY_DATA));
          renderPhaDo();
          fitFullScreen(false);
        } else {
          applyServerNodes(res.nodes || []);
        }

        if (res.needsSeed && res.role === 'admin') {
          document.getElementById('adminSeedBanner').classList.remove('hidden');
          openAdminProposalsModal();
          showToast('⚠️ Sheet GiaPha_ChinhThuc đang trống — hãy bấm "Nạp dữ liệu lên Sheet".');
        } else {
          showToast(
            res.role === 'admin'
              ? '🛡️ Đăng nhập thành công với quyền Chủ sở hữu (Admin).'
              : '✅ Mở khóa thành công! Chào mừng về với Gia Phả dòng họ.'
          );
        }
      } catch (err) {
        errEl.textContent = err.message || 'Mật khẩu không đúng hoặc không kết nối được máy chủ.';
        errEl.classList.remove('hidden');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '🔓 Mở Khóa Gia Phả';
      }
    }

    document.getElementById('authLoginForm').addEventListener('submit', e => {
      e.preventDefault();
      performLogin(passInput.value);
    });

    document.getElementById('btnAuthLocalDemo').addEventListener('click', () => {
      authSession = { unlocked: true, password: '', role: 'admin', isLocalDemo: true };
      familyData = loadInitialData();
      unlockScreen();
      updateRoleUI(0);
      renderPhaDo();
      fitFullScreen(false);
      showToast('👁️ Đang ở chế độ xem thử nội bộ (chưa kết nối Google Sheets).');
    });

    document.getElementById('btnLockApp').addEventListener('click', lockScreen);

    // Tự động khôi phục phiên trong cùng tab trình duyệt khi bấm F5
    try {
      const savedSession = sessionStorage.getItem(AUTH_SESSION_KEY);
      if (savedSession && APPS_SCRIPT_URL) {
        const parsed = JSON.parse(savedSession);
        if (parsed && parsed.password) {
          passInput.value = parsed.password;
          performLogin(parsed.password);
        }
      }
    } catch (e) {}
  }

  function openContributorModal(actionObj) {
    pendingEditAction = actionObj;
    document.getElementById('contribDiffPreview').textContent = actionObj.diffSummary || '';

    const nameEl = document.getElementById('contribName');
    const phoneEl = document.getElementById('contribPhone');
    const relEl = document.getElementById('contribRelation');
    const reasonEl = document.getElementById('contribReason');

    try {
      const saved = JSON.parse(localStorage.getItem(CONTRIB_PREFILL_KEY) || '{}');
      if (saved.name && !nameEl.value) nameEl.value = saved.name;
      if (saved.phone && !phoneEl.value) phoneEl.value = saved.phone;
      if (saved.relationEmail && !relEl.value) relEl.value = saved.relationEmail;
    } catch (e) {}

    if (authSession.role === 'admin' && !nameEl.value) {
      nameEl.value = 'Chủ sở hữu (Admin)';
    }
    reasonEl.value = '';

    const btnAdminNow = document.getElementById('btnAdminPublishNow');
    if (btnAdminNow) {
      btnAdminNow.classList.toggle('hidden', authSession.role !== 'admin');
    }

    document.getElementById('modalContributorBackdrop').classList.remove('hidden');
  }

  function setupContributorModal() {
    const closeAndMaybeReturn = () => {
      document.getElementById('modalContributorBackdrop').classList.add('hidden');
      pendingEditAction = null;
    };

    document.getElementById('btnCloseContributorModal').addEventListener('click', closeAndMaybeReturn);
    document.getElementById('btnCancelContributor').addEventListener('click', () => {
      const prev = pendingEditAction;
      document.getElementById('modalContributorBackdrop').classList.add('hidden');
      if (prev && (prev.changeType === 'THEM' || prev.changeType === 'SUA')) {
        document.getElementById('modalFormBackdrop').classList.remove('hidden');
      }
      pendingEditAction = null;
    });

    function readContributorInputs(requirePhone = true) {
      const name = document.getElementById('contribName').value.trim();
      const phone = document.getElementById('contribPhone').value.trim();
      const relationEmail = document.getElementById('contribRelation').value.trim();
      const reason = document.getElementById('contribReason').value.trim();
      if (!name) {
        alert('Vui lòng nhập Họ và Tên của bạn.');
        return null;
      }
      if (requirePhone && phone.replace(/\D/g, '').length < 8) {
        alert('Vui lòng nhập Số điện thoại liên hệ hợp lệ (ít nhất 8 chữ số).');
        return null;
      }
      try {
        localStorage.setItem(CONTRIB_PREFILL_KEY, JSON.stringify({ name, phone, relationEmail }));
      } catch (e) {}
      return { name, phone, relationEmail, reason };
    }

    document.getElementById('contributorForm').addEventListener('submit', async e => {
      e.preventDefault();
      if (!pendingEditAction) return;
      const contributor = readContributorInputs(true);
      if (!contributor) return;

      const btn = document.getElementById('btnSubmitProposal');
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu CSV & gửi thông báo...';

      try {
        if (APPS_SCRIPT_URL) {
          const res = await callAppsScript({
            action: 'submitProposal',
            password: authSession.password,
            changeType: pendingEditAction.changeType,
            contributor,
            beforeNode: pendingEditAction.beforeNode,
            afterNode: pendingEditAction.afterNode,
            diffSummary: pendingEditAction.diffSummary
          });
          document.getElementById('modalContributorBackdrop').classList.add('hidden');
          pendingEditAction = null;
          alert(
            `✅ ĐÃ GỬI ĐỀ XUẤT THÀNH CÔNG!\n\n` +
              `Mã đề xuất: ${res.proposalId}\n` +
              `Nội dung sửa đổi đã được lưu vào bảng CSV và gửi Email thông báo tới Chủ gia phả.\n\n` +
              `Lưu ý: Thay đổi sẽ chỉ được công khai (public) trên web sau khi Chủ sở hữu kiểm tra và bấm Duyệt.`
          );
          if (authSession.role === 'admin') {
            loadAdminProposals(true);
          }
        } else {
          downloadLocalProposalCsv(
            pendingEditAction.changeType,
            contributor,
            pendingEditAction.beforeNode,
            pendingEditAction.afterNode,
            pendingEditAction.diffSummary
          );
          document.getElementById('modalContributorBackdrop').classList.add('hidden');
          pendingEditAction = null;
          showToast('📥 Đã tải file CSV đề xuất về máy (chế độ thử nghiệm chưa kết nối Google Sheets).');
        }
      } catch (err) {
        alert('Không thể gửi đề xuất: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '📤 Gửi Đề Xuất Chờ Duyệt';
      }
    });

    document.getElementById('btnAdminPublishNow').addEventListener('click', async () => {
      if (!pendingEditAction || authSession.role !== 'admin') return;
      const contributor = readContributorInputs(false);
      if (!contributor) return;

      const btn = document.getElementById('btnAdminPublishNow');
      btn.disabled = true;
      btn.textContent = '⏳ Đang lưu & công khai...';

      try {
        const { changeType, beforeNode, afterNode, diffSummary } = pendingEditAction;
        if (APPS_SCRIPT_URL) {
          const res = await callAppsScript({
            action: 'adminDirectSave',
            password: authSession.password,
            changeType,
            contributor,
            beforeNode,
            afterNode,
            diffSummary
          });
          applyServerNodes(res.nodes || []);
          if (afterNode && afterNode.id) selectMember(afterNode.id, true);
          showToast('✅ Đã lưu trực tiếp & công khai lên Gia Phả Chính Thức!');
        } else {
          if (changeType === 'THEM' && afterNode) {
            familyData.nodes.push(afterNode);
          } else if (changeType === 'SUA' && afterNode) {
            const idx = familyData.nodes.findIndex(n => n.id === afterNode.id);
            if (idx >= 0) familyData.nodes[idx] = afterNode;
          } else if (changeType === 'XOA' && beforeNode) {
            familyData.nodes = familyData.nodes.filter(n => n.id !== beforeNode.id);
          }
          saveDataToStorage();
          renderPhaDo();
          if (afterNode && afterNode.id) selectMember(afterNode.id, true);
          else clearSelection();
          showToast('✅ Đã lưu thay đổi trên chế độ thử nghiệm!');
        }
        document.getElementById('modalContributorBackdrop').classList.add('hidden');
        pendingEditAction = null;
      } catch (err) {
        alert('Lỗi lưu trực tiếp: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '✅ Duyệt & Public Ngay (Admin)';
      }
    });
  }

  async function seedNodesToGoogleSheet(nodesToSeed) {
    if (!APPS_SCRIPT_URL) {
      alert('Chưa cấu hình APPS_SCRIPT_URL trong config.js.');
      return;
    }
    if (!Array.isArray(nodesToSeed) || nodesToSeed.length === 0) {
      alert('Không có dữ liệu thành viên để nạp.');
      return;
    }
    if (
      !confirm(
        `Bạn muốn nạp ${nodesToSeed.length} thành viên lên Google Sheet "GiaPha_ChinhThuc"? (Nếu Sheet đã có dữ liệu, dữ liệu cũ sẽ được ghi đè theo bản này).`
      )
    ) {
      return;
    }
    try {
      showToast('☁️ Đang nạp dữ liệu lên Google Sheets...');
      const res = await callAppsScript({
        action: 'seedOfficialData',
        password: authSession.password,
        nodes: nodesToSeed,
        overwrite: true
      });
      document.getElementById('adminSeedBanner').classList.add('hidden');
      applyServerNodes(res.nodes || nodesToSeed);
      showToast(`✅ Đã nạp thành công ${res.count} thành viên lên Google Sheets!`);
    } catch (err) {
      alert('Lỗi nạp dữ liệu lên Google Sheets: ' + err.message);
    }
  }

  async function loadAdminProposals(silent = false) {
    if (authSession.role !== 'admin') return;
    const listEl = document.getElementById('adminProposalsList');
    if (!APPS_SCRIPT_URL) {
      listEl.innerHTML =
        '<div class="empty-proposals">Chế độ xem thử chưa kết nối Google Apps Script. Khi bạn deploy Apps Script và dán URL vào <code>config.js</code>, danh sách đề xuất từ mọi người sẽ hiển thị tại đây.</div>';
      return;
    }
    if (!silent) {
      listEl.innerHTML = '<div class="empty-proposals">⏳ Đang tải danh sách đề xuất từ Google Sheets...</div>';
    }
    try {
      const res = await callAppsScript({
        action: 'listProposals',
        password: authSession.password
      });
      cachedProposals = res.proposals || [];
      const pendingCount = cachedProposals.filter(p => p.status === 'CHO_DUYET').length;
      updateRoleUI(pendingCount);
      if (!silent) renderAdminProposals();
    } catch (err) {
      if (!silent) {
        listEl.innerHTML = `<div class="empty-proposals">❌ Lỗi tải danh sách: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  function renderAdminProposals() {
    const listEl = document.getElementById('adminProposalsList');
    const filter = document.getElementById('proposalStatusFilter').value;
    const filtered =
      filter === 'ALL' ? cachedProposals : cachedProposals.filter(p => p.status === filter);

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="empty-proposals">Không có đề xuất nào trong mục này.</div>';
      return;
    }

    listEl.innerHTML = filtered
      .map(p => {
        const typeLabel =
          p.changeType === 'THEM' ? 'THÊM MỚI' : p.changeType === 'XOA' ? 'ĐỀ XUẤT XÓA' : 'CHỈNH SỬA';
        const statusLabel =
          p.status === 'CHO_DUYET'
            ? 'Chờ duyệt'
            : p.status === 'DA_DUYET'
              ? 'Đã duyệt'
              : 'Đã từ chối';
        const actionsHtml =
          p.status === 'CHO_DUYET'
            ? `<div class="proposal-actions">
                <button type="button" class="btn btn-danger-outline btn-sm btn-reject-prop" data-pid="${escapeHtml(p.proposalId)}">❌ Từ chối</button>
                <button type="button" class="btn btn-success btn-sm btn-approve-prop" data-pid="${escapeHtml(p.proposalId)}">✅ Duyệt &amp; Public</button>
              </div>`
            : `<div class="proposal-actions"><span class="prop-time">Xử lý bởi: ${escapeHtml(p.reviewedBy || '—')} (${escapeHtml(p.reviewedAt || '—')})</span></div>`;

        return `
          <div class="proposal-card">
            <div class="proposal-card-header">
              <div class="proposal-badges">
                <span class="prop-id">${escapeHtml(p.proposalId)}</span>
                <span class="prop-badge prop-type-${escapeHtml(p.changeType)}">${typeLabel}</span>
                <span class="prop-badge prop-status-${escapeHtml(p.status)}">${statusLabel}</span>
              </div>
              <span class="prop-time">🕒 ${escapeHtml(p.submittedAt)}</span>
            </div>
            <div class="proposal-sender-grid">
              <div><strong>Người gửi:</strong> ${escapeHtml(p.senderName)}</div>
              <div><strong>SĐT:</strong> ${escapeHtml(p.senderPhone)}</div>
              <div><strong>Quan hệ/Email:</strong> ${escapeHtml(p.senderRelation || '—')}</div>
              <div><strong>Lý do:</strong> ${escapeHtml(p.reason || '—')}</div>
            </div>
            <div class="proposal-diff-text">${escapeHtml(p.diffSummary || `${p.memberName} (Đời ${p.generation})`)}</div>
            ${actionsHtml}
          </div>
        `;
      })
      .join('');

    listEl.querySelectorAll('.btn-approve-prop').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-pid');
        if (!confirm(`Xác nhận DUYỆT đề xuất ${pid} và cập nhật công khai lên Gia Phả?`)) return;
        btn.disabled = true;
        btn.textContent = '⏳ Đang duyệt...';
        try {
          const res = await callAppsScript({
            action: 'approveProposal',
            password: authSession.password,
            proposalId: pid
          });
          cachedProposals = res.proposals || [];
          updateRoleUI(res.pendingCount || 0);
          applyServerNodes(res.nodes || []);
          renderAdminProposals();
          showToast(`✅ Đã duyệt và công khai đề xuất ${pid}!`);
        } catch (err) {
          alert('Lỗi khi duyệt: ' + err.message);
          btn.disabled = false;
          btn.textContent = '✅ Duyệt & Public';
        }
      });
    });

    listEl.querySelectorAll('.btn-reject-prop').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.getAttribute('data-pid');
        const note = prompt(`Nhập lý do từ chối đề xuất ${pid} (có thể bỏ trống):`);
        if (note === null) return;
        btn.disabled = true;
        try {
          const res = await callAppsScript({
            action: 'rejectProposal',
            password: authSession.password,
            proposalId: pid,
            rejectNote: note
          });
          cachedProposals = res.proposals || [];
          updateRoleUI(res.pendingCount || 0);
          renderAdminProposals();
          showToast(`❌ Đã từ chối đề xuất ${pid}.`);
        } catch (err) {
          alert('Lỗi khi từ chối: ' + err.message);
          btn.disabled = false;
        }
      });
    });
  }

  function openAdminProposalsModal() {
    document.getElementById('modalAdminProposalsBackdrop').classList.remove('hidden');
    loadAdminProposals(false);
  }

  function setupAdminProposalsModal() {
    document.getElementById('btnAdminApprovals').addEventListener('click', openAdminProposalsModal);
    document.getElementById('btnCloseAdminProposalsModal').addEventListener('click', () => {
      document.getElementById('modalAdminProposalsBackdrop').classList.add('hidden');
    });
    document.getElementById('proposalStatusFilter').addEventListener('change', renderAdminProposals);
    document.getElementById('btnRefreshProposals').addEventListener('click', () => loadAdminProposals(false));

    document.getElementById('btnDownloadProposalsCsv').addEventListener('click', async () => {
      if (!APPS_SCRIPT_URL) {
        alert('Chức năng này cần kết nối Google Apps Script.');
        return;
      }
      try {
        const res = await callAppsScript({
          action: 'exportProposalsCsv',
          password: authSession.password
        });
        downloadCsvText('Danh-Sach-De-Xuat-Gia-Pha.csv', res.csvText || '');
        showToast('📥 Đã tải xuống file CSV toàn bộ lịch sử đề xuất!');
      } catch (err) {
        alert('Lỗi tải CSV: ' + err.message);
      }
    });

    const handleSeedClick = () => {
      const sourceNodes =
        familyData.nodes && familyData.nodes.length > 0
          ? familyData.nodes
          : (window.INITIAL_FAMILY_DATA && window.INITIAL_FAMILY_DATA.nodes) || [];
      seedNodesToGoogleSheet(sourceNodes);
    };
    document.getElementById('btnModalSeedSheets').addEventListener('click', handleSeedClick);
    document.getElementById('btnAdminSeedSheets').addEventListener('click', () => {
      document.getElementById('exportMenuDropdown').classList.add('hidden');
      handleSeedClick();
    });

    document.getElementById('inputAdminSeedJson').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = evt => {
        try {
          const parsed = JSON.parse(evt.target.result);
          if (parsed && Array.isArray(parsed.nodes)) {
            seedNodesToGoogleSheet(parsed.nodes);
          } else {
            alert('File JSON không đúng định dạng Gia Phả.');
          }
        } catch (err) {
          alert('Lỗi đọc file JSON: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
  }

  // Initialize App
  function init() {
    setupInteractions();
    setupContributorModal();
    setupAdminProposalsModal();
    setupAuthGate();
  }

  init();
})();
