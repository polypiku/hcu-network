/* ═══════════════════════════════════════════════════════════
   HCU Network Monitoring System — app.js
   Version 2.0  |  แยกไฟล์สำหรับ Production/Present
═══════════════════════════════════════════════════════════ */

/* ── STATE ────────────────────────────────────────────── */
var DB = { buildings: {} };
var curB = '', curF = '';
var curDotId = null, tempDot = null, isNew = false;
var pendingLeft = 50, pendingTop = 50;
var appMode = 'view', dragging = null, dOff = { x: 0, y: 0 };
var dotColor = '#c62828', dotSize = 26, dotSig = 3;
var currentPhoto = '';
var popDotId = null;
var sbOpen = true;
var COLS = ['#c62828','#1565c0','#2e7d32','#e65100','#6a1b9a','#00838f','#f57f17','#455a64','#000'];
var _imoCallback = null, _cfmCallback = null;

/* expose globals for Firebase module */
window.DB = DB;
window.getCurB = function() { return curB; };
window.getCurF = function() { return curF; };
window.setCurB = function(v) { curB = v; };
window.setCurF = function(v) { curF = v; };

/* ── HELPERS ────────────────────────────────────────────── */
function sid(s) {
  return encodeURIComponent(s || '').replace(/%/g, '_');
}

function flash(msg, c) {
  var el = document.getElementById('hss');
  el.textContent = msg;
  el.style.color = c || 'rgba(255,255,255,.95)';
  el.classList.add('show');
  setTimeout(function() { el.classList.remove('show'); }, 2500);
}

function getFloor() {
  return (curB && curF && DB.buildings[curB] && DB.buildings[curB].floors)
    ? DB.buildings[curB].floors[curF] : null;
}

/* ── DASHBOARD ──────────────────────────────────────────── */
var dashVisible = false;

window.toggleDashboard = function() {
  dashVisible = !dashVisible;
  var dash = document.getElementById('dashboard');
  var btn  = document.getElementById('dashBtn');
  if (dashVisible) {
    dash.classList.add('show');
    btn.classList.add('active');
    refreshDashboard();
  } else {
    dash.classList.remove('show');
    btn.classList.remove('active');
  }
};

function refreshDashboard() {
  var allDots = [];
  var buildings = DB.buildings || {};
  var bCount = Object.keys(buildings).length;
  var fCount = 0;

  Object.values(buildings).forEach(function(b) {
    var floors = b.floors || {};
    fCount += Object.keys(floors).length;
    Object.values(floors).forEach(function(f) {
      Object.values(f.dots || {}).forEach(function(d) {
        allDots.push(d);
      });
    });
  });

  var total = allDots.length;
  var highSig = allDots.filter(function(d) { return (d.sig || 0) >= 4; }).length;
  var lowSig  = allDots.filter(function(d) { return (d.sig || 0) <= 2; }).length;

  /* Summary cards */
  setText('dashTotalDots',   total);
  setText('dashBuildings',   bCount);
  setText('dashFloors',      fCount);
  setText('dashHighSig',     highSig);
  setText('dashLowSig',      lowSig);

  /* Building breakdown table */
  var tbody = document.getElementById('dashTableBody');
  if (tbody) {
    tbody.innerHTML = '';
    if (!bCount) {
      tbody.innerHTML = '<tr><td colspan="5" class="dash-empty">ยังไม่มีข้อมูล</td></tr>';
    } else {
      Object.entries(buildings).forEach(function(entry) {
        var bName = entry[0], bData = entry[1];
        var floors = bData.floors || {};
        Object.entries(floors).forEach(function(fe, fi) {
          var fName = fe[0], fData = fe[1];
          var dots  = Object.values(fData.dots || {});
          var hi    = dots.filter(function(d) { return (d.sig || 0) >= 4; }).length;
          var lo    = dots.filter(function(d) { return (d.sig || 0) <= 2; }).length;
          var mid   = dots.length - hi - lo;
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + (fi === 0 ? '<strong>' + bName + '</strong>' : '') + '</td>' +
            '<td>' + fName + '</td>' +
            '<td><span class="badge badge-blu">' + dots.length + '</span></td>' +
            '<td><span class="badge badge-grn">' + hi + '</span></td>' +
            '<td><span class="badge badge-red">' + lo + '</span></td>';
          tbody.appendChild(tr);
        });
        if (!Object.keys(floors).length) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td><strong>' + bName + '</strong></td>' +
            '<td colspan="4" style="color:#bbb;font-size:.75rem;">ยังไม่มีชั้น</td>';
          tbody.appendChild(tr);
        }
      });
    }
  }

  /* Signal distribution bars */
  var sigDist = [0,0,0,0,0,0]; // index 0-5
  allDots.forEach(function(d) { sigDist[d.sig || 0]++; });
  var maxSig = Math.max.apply(null, sigDist) || 1;
  var barColors = ['#bbb','#ef5350','#ff7043','#ffa726','#66bb6a','#43a047'];
  for (var i = 0; i <= 5; i++) {
    var bar = document.getElementById('sigBar' + i);
    var cnt = document.getElementById('sigCnt' + i);
    if (bar) bar.style.width = Math.round(sigDist[i] / maxSig * 100) + '%';
    if (bar) bar.style.background = barColors[i];
    if (cnt) cnt.textContent = sigDist[i];
  }

  /* Filter dropdown for building */
  var fsel = document.getElementById('dashFilterB');
  if (fsel) {
    var prev = fsel.value;
    fsel.innerHTML = '<option value="">— ทุกอาคาร —</option>';
    Object.keys(buildings).forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b; opt.textContent = b;
      fsel.appendChild(opt);
    });
    fsel.value = prev;
    renderDashDotTable(fsel.value);
  }
}

function renderDashDotTable(filterB) {
  var tbody = document.getElementById('dashDotBody');
  if (!tbody) return;
  tbody.innerHTML = '';
  var rows = [];
  Object.entries(DB.buildings || {}).forEach(function(be) {
    var bName = be[0], bData = be[1];
    if (filterB && bName !== filterB) return;
    Object.entries(bData.floors || {}).forEach(function(fe) {
      var fName = fe[0], fData = fe[1];
      Object.values(fData.dots || {}).forEach(function(d) {
        rows.push({ b: bName, f: fName, d: d });
      });
    });
  });

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="dash-empty">ไม่พบข้อมูลจุด</td></tr>';
    return;
  }

  rows.sort(function(a, b) { return a.d.id.localeCompare(b.d.id); });
  rows.forEach(function(r) {
    var d = r.d;
    var sigClass = (d.sig || 0) >= 4 ? 'badge-grn' : (d.sig || 0) <= 2 ? 'badge-red' : 'badge-yel';
    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' +
        (d.color || '#c62828') + ';margin-right:6px;vertical-align:middle;"></span>' +
        (d.id || '—') + '</td>' +
      '<td>' + r.b + '</td>' +
      '<td>' + r.f + '</td>' +
      '<td>' + (d.room || '—') + '</td>' +
      '<td>' + (d.ip || '—') + '</td>' +
      '<td><span class="badge ' + sigClass + '">' + (d.sig || 0) + '/5</span></td>';
    tbody.appendChild(tr);
  });
}

function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

window.onDashFilterChange = function() {
  var v = document.getElementById('dashFilterB').value;
  renderDashDotTable(v);
};

/* ── CUSTOM DROPDOWN ────────────────────────────────────── */
window.toggleCdd = function(id) {
  var cdd  = document.getElementById(id);
  var btn  = cdd.querySelector('.cdd-btn');
  var list = cdd.querySelector('.cdd-list');
  var isOpen = list.classList.contains('show');
  document.querySelectorAll('.cdd-list').forEach(function(l) { l.classList.remove('show'); });
  document.querySelectorAll('.cdd-btn').forEach(function(b)  { b.classList.remove('open'); });
  if (!isOpen) {
    list.classList.add('show'); btn.classList.add('open');
    var r = btn.getBoundingClientRect();
    list.style.left  = r.left + 'px';
    list.style.top   = r.bottom + 'px';
    list.style.width = r.width + 'px';
  }
};

document.addEventListener('click', function(e) {
  if (!e.target.closest('.cdd')) {
    document.querySelectorAll('.cdd-list').forEach(function(l) { l.classList.remove('show'); });
    document.querySelectorAll('.cdd-btn').forEach(function(b)  { b.classList.remove('open'); });
  }
});

function setCddVal(id, label) {
  document.getElementById(id + 'Val').textContent = label || '—';
}

window.rebuildCddB = function() {
  var list = document.getElementById('cddBList');
  var keys = Object.keys(DB.buildings);
  list.innerHTML = '';
  if (!keys.length) {
    list.innerHTML = '<div class="cdd-empty">ยังไม่มีอาคาร</div>';
    setCddVal('cddB', '— ยังไม่มีอาคาร —');
    curB = ''; renderFloorList(); return;
  }
  keys.forEach(function(k) {
    var opt = document.createElement('div');
    opt.className = 'cdd-opt' + (k === curB ? ' active' : '');
    opt.textContent = 'อาคาร: ' + k;
    opt.onclick = function() {
      curB = k; curF = ''; clearDots(); closePanel(); closePopup();
      document.querySelectorAll('.cdd-list').forEach(function(l) { l.classList.remove('show'); });
      document.querySelectorAll('.cdd-btn').forEach(function(b)  { b.classList.remove('open'); });
      rebuildCddB(); renderFloorList(); updateUI();
    };
    list.appendChild(opt);
  });
  if (!curB || !DB.buildings[curB]) curB = keys[0];
  setCddVal('cddB', 'อาคาร: ' + curB);
  renderFloorList();
};

/* ── SIDEBAR TOGGLE ─────────────────────────────────────── */
window.toggleSidebar = function() {
  sbOpen = !sbOpen;
  document.getElementById('sidebar').classList.toggle('collapsed', !sbOpen);
  document.getElementById('sbToggle').textContent = sbOpen ? '☰' : '▶';
};

/* ── INPUT MODAL ────────────────────────────────────────── */
window.showImo = function(icon, title, lbl, ph, def, cb) {
  document.getElementById('imoIcon').textContent  = icon;
  document.getElementById('imoTitle').textContent = title;
  document.getElementById('imoLbl').textContent   = lbl;
  document.getElementById('imoInp').placeholder   = ph;
  document.getElementById('imoInp').value         = def || '';
  _imoCallback = cb;
  document.getElementById('imoModal').classList.add('show');
  setTimeout(function() {
    document.getElementById('imoInp').focus();
    document.getElementById('imoInp').select();
  }, 100);
};

window.confirmImo = function() {
  var v = document.getElementById('imoInp').value.trim();
  document.getElementById('imoModal').classList.remove('show');
  if (_imoCallback) { _imoCallback(v); _imoCallback = null; }
};

window.cancelImo = function() {
  document.getElementById('imoModal').classList.remove('show');
  _imoCallback = null;
};

/* ── CONFIRM MODAL ──────────────────────────────────────── */
window.showCfm = function(msg, cb) {
  document.getElementById('cfmMsg').textContent = msg;
  _cfmCallback = cb;
  document.getElementById('cfmModal').classList.add('show');
};

window.confirmCfm = function() {
  document.getElementById('cfmModal').classList.remove('show');
  if (_cfmCallback) { _cfmCallback(); _cfmCallback = null; }
};

window.cancelCfm = function() {
  document.getElementById('cfmModal').classList.remove('show');
  _cfmCallback = null;
};

/* ── UI STATE ───────────────────────────────────────────── */
window.updateUI = function() {
  var hasB   = !!(curB && DB.buildings[curB]);
  var hasF   = !!(hasB && curF && DB.buildings[curB].floors && DB.buildings[curB].floors[curF]);
  var fd     = hasF ? DB.buildings[curB].floors[curF] : null;
  var hasImg = !!(fd && fd.img);
  var dots   = fd ? Object.values(fd.dots || {}) : [];

  document.getElementById('stepBuilding').style.display = (!hasB)         ? 'flex' : 'none';
  document.getElementById('stepFloor').style.display    = (hasB && !hasF) ? 'flex' : 'none';
  document.getElementById('stepUpload').style.display   = (hasF && !hasImg) ? 'flex' : 'none';
  document.getElementById('mapWrap').style.display      = hasImg ? 'inline-block' : 'none';
  document.getElementById('modeBar').style.display      = hasImg ? 'flex' : 'none';

  document.getElementById('floorSection').style.display = hasB  ? 'block' : 'none';
  document.getElementById('mapSection').style.display   = hasF  ? 'block' : 'none';
  document.getElementById('dotSection').style.display   = hasImg ? 'block' : 'none';
  document.getElementById('mapSt').textContent = hasImg ? '✅ มีรูปแผนผัง' : 'ยังไม่มีรูป';
  document.getElementById('dotCount').textContent = dots.length;
  renderDotList(dots);

  setDisabled('btnRenB', !hasB);
  setDisabled('btnDelB', !hasB);

  if (dashVisible) refreshDashboard();
};

/* ── DOT LIST IN SIDEBAR ────────────────────────────────── */
function renderDotList(dots) {
  var el = document.getElementById('dotList'); if (!el) return;
  el.innerHTML = '';
  if (!dots || !dots.length) return;
  dots.slice().sort(function(a, b) { return (a.id || '').localeCompare(b.id || ''); }).forEach(function(dot) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 6px;background:white;border:1.5px solid var(--yel);border-radius:6px;cursor:pointer;font-size:.75rem;font-weight:600;transition:background .15s;';
    row.onmouseover = function() { this.style.background = 'var(--yel-l)'; };
    row.onmouseout  = function() { this.style.background = 'white'; };
    var dot2 = document.createElement('div');
    dot2.style.cssText = 'width:10px;height:10px;border-radius:50%;flex-shrink:0;background:' + (dot.color || '#c62828') + ';border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.25);';
    var lbl = document.createElement('span');
    lbl.textContent = dot.id || '?'; lbl.style.flex = '1';
    var pos = document.createElement('span');
    pos.textContent = '(' + Math.round(dot.left) + '%,' + Math.round(dot.top) + '%)';
    pos.style.cssText = 'font-size:.65rem;color:var(--sub);font-weight:400;';
    row.appendChild(dot2); row.appendChild(lbl); row.appendChild(pos);
    row.onclick = function() {
      setMode('view');
      var fd = getFloor(); if (!fd) return;
      var latest = fd.dots && fd.dots[dot.id] ? fd.dots[dot.id] : dot;
      var mw = document.getElementById('mapWrap');
      if (mw) {
        var scrollX = latest.left / 100 * mw.offsetWidth  - window.innerWidth / 2;
        var scrollY = latest.top  / 100 * mw.offsetHeight - window.innerHeight / 2;
        mw.closest('.map-area').scrollTo({ left: Math.max(0, scrollX), top: Math.max(0, scrollY), behavior: 'smooth' });
      }
      document.querySelectorAll('.hotspot').forEach(function(h) { h.classList.remove('sel'); });
      var he = document.getElementById('hs_' + sid(dot.id || ''));
      if (he) { he.classList.add('sel'); he.querySelector('.hdot').style.transform = 'scale(1.5)'; }
      setTimeout(function() {
        var he2 = document.getElementById('hs_' + sid(dot.id || ''));
        if (he2) he2.querySelector('.hdot').style.transform = '';
      }, 1500);
    };
    el.appendChild(row);
  });
}

function setDisabled(id, dis) {
  var el = document.getElementById(id);
  if (dis) el.classList.add('disabled');
  else     el.classList.remove('disabled');
}

/* ── BUILDING ───────────────────────────────────────────── */
window.addBuilding = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  showImo('🏢','เพิ่มอาคาร','ชื่ออาคาร','เช่น อาคาร 2','',function(n) {
    if (!n) return;
    if (DB.buildings[n]) { flash('มีอาคาร "' + n + '" แล้ว','#ef5350'); return; }
    DB.buildings[n] = { floors: {} };
    curB = n; curF = '';
    rebuildCddB(); renderFloorList(); updateUI();
    flash('✅ เพิ่มอาคาร "' + n + '" แล้ว');
  });
};

window.renameBuilding = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  if (!curB) return;
  showImo('✏️','แก้ชื่ออาคาร','ชื่อใหม่','',curB,function(n) {
    if (!n || n === curB) return;
    if (DB.buildings[n]) { flash('มีชื่อนี้แล้ว','#ef5350'); return; }
    DB.buildings[n] = DB.buildings[curB];
    delete DB.buildings[curB]; curB = n;
    rebuildCddB(); updateUI();
    flash('✅ เปลี่ยนชื่อเป็น "' + n + '"');
  });
};

window.deleteBuilding = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  if (!curB) return;
  showCfm('ลบอาคาร "' + curB + '" และข้อมูลทั้งหมด ใช่ไหม?', function() {
    delete DB.buildings[curB]; curB = ''; curF = '';
    rebuildCddB(); renderFloorList(); clearDots(); closePanel(); closePopup(); updateUI();
    flash('🗑 ลบอาคารแล้ว');
  });
};

/* ── FLOOR LIST ─────────────────────────────────────────── */
window.renderFloorList = function() {
  var list = document.getElementById('floorList');
  list.innerHTML = '';
  if (!curB || !DB.buildings[curB]) return;
  var floors = DB.buildings[curB].floors || {};
  Object.keys(floors).forEach(function(f) {
    var item = document.createElement('div');
    item.className = 'floor-item' + (f === curF ? ' active' : '');
    var dotCount = Object.keys(floors[f].dots || {}).length;
    var adminBtns = window._isAdmin
      ? '<button class="fi-edit" title="แก้ชื่อ">✏️</button>' +
        '<button class="fi-del" title="ลบ">✕</button>' : '';
    item.innerHTML =
      '<span class="fi-name">' + f + '</span>' +
      (dotCount ? '<span class="dot-badge">' + dotCount + '</span>' : '') +
      adminBtns;
    if (window._isAdmin) {
      item.querySelector('.fi-edit').onclick = function(e) {
        e.stopPropagation();
        showImo('✏️','แก้ชื่อชั้น','ชื่อใหม่','',f,function(n) {
          if (!n || n === f) return;
          if (DB.buildings[curB].floors[n]) { flash('มีชื่อนี้แล้ว','#ef5350'); return; }
          DB.buildings[curB].floors[n] = DB.buildings[curB].floors[f];
          delete DB.buildings[curB].floors[f];
          if (curF === f) curF = n;
          renderFloorList(); updateUI();
          flash('✅ เปลี่ยนชื่อชั้นเป็น "' + n + '"');
        });
      };
      item.querySelector('.fi-del').onclick = function(e) {
        e.stopPropagation();
        showCfm('ลบชั้น "' + f + '" และจุดทั้งหมด ใช่ไหม?', function() {
          delete DB.buildings[curB].floors[f];
          if (curF === f) { curF = ''; clearDots(); closePanel(); closePopup(); }
          renderFloorList(); updateUI();
          flash('🗑 ลบชั้นแล้ว');
        });
      };
    }
    item.addEventListener('click', function() {
      curF = f; clearDots(); closePanel(); closePopup();
      renderFloorList(); loadFloorView(); updateUI();
    });
    list.appendChild(item);
  });
};

window.addFloor = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  if (!curB) { flash('กรุณาเลือกอาคารก่อน','#ef5350'); return; }
  showImo('📐','เพิ่มชั้น','ชื่อชั้น','เช่น ชั้น 1','ชั้น 1',function(n) {
    if (!n) return;
    if (DB.buildings[curB].floors[n]) { flash('มีชั้น "' + n + '" แล้ว','#ef5350'); return; }
    DB.buildings[curB].floors[n] = { img: '', dots: {} };
    curF = n; renderFloorList(); loadFloorView(); updateUI();
    flash('✅ เพิ่มชั้น "' + n + '" แล้ว');
  });
};

/* ── MAP IMAGE ──────────────────────────────────────────── */
window.loadMap = function(e) {
  var file = e.target.files[0]; if (!file) return;
  if (!curB || !curF) { flash('กรุณาเลือกอาคารและชั้นก่อน','#ef5350'); return; }
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var cv = document.createElement('canvas');
      var MAX = 1400, w = img.width, h = img.height;
      if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      DB.buildings[curB].floors[curF].img = cv.toDataURL('image/jpeg', .85);
      loadFloorView(); updateUI();
      if (typeof fbSaveStructure === 'function') fbSaveStructure();
      flash('✅ โหลดรูปแผนผังแล้ว');
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file); e.target.value = '';
};

window.loadFloorView = function() {
  var fd = getFloor(); clearDots();
  if (fd && fd.img) {
    document.getElementById('floorImg').src = fd.img;
    Object.values(fd.dots || {}).forEach(renderDot);
  }
};

window.clearDots = function() {
  document.querySelectorAll('.hotspot').forEach(function(h) { h.remove(); });
};

/* ── MODE ───────────────────────────────────────────────── */
window.setMode = function(m) {
  appMode = m;
  document.getElementById('mbV').classList.toggle('active', m === 'view');
  document.getElementById('mbA').classList.toggle('active', m === 'add');
  document.getElementById('mbM').classList.toggle('active', m === 'move');
  document.getElementById('mapWrap').classList.toggle('add-mode', m === 'add');
  if (m !== 'view') closePopup();
};

/* ── CLICK MAP ──────────────────────────────────────────── */
document.getElementById('mapWrap').addEventListener('click', function(e) {
  if (appMode !== 'add') return;
  if (e.target.closest('.hotspot')) return;
  var r  = this.getBoundingClientRect();
  var lp = parseFloat(((e.clientX - r.left) / r.width  * 100).toFixed(2));
  var tp = parseFloat(((e.clientY - r.top)  / r.height * 100).toFixed(2));
  var rip = document.createElement('div');
  rip.style.cssText = 'position:absolute;left:' + lp + '%;top:' + tp + '%;width:22px;height:22px;border-radius:50%;background:rgba(198,40,40,.3);transform:translate(-50%,-50%);pointer-events:none;z-index:50;animation:ripOut .5s ease-out forwards';
  this.appendChild(rip); setTimeout(function() { rip.remove(); }, 600);
  pendingLeft = parseFloat(lp.toFixed(2));
  pendingTop  = parseFloat(tp.toFixed(2));
  var newDot = { id:'',room:'',brand:'',ip:'',photo:'',note:'',sig:3,color:dotColor,size:dotSize,left:pendingLeft,top:pendingTop };
  currentPhoto = '';
  isNew = true; curDotId = null;
  openPanel(newDot);
});

/* ── RENDER DOT ─────────────────────────────────────────── */
function lighten(hex) {
  var r = parseInt(hex.slice(1,3), 16) + 90;
  var g = parseInt(hex.slice(3,5), 16) + 90;
  var b = parseInt(hex.slice(5,7), 16) + 90;
  return 'rgb(' + Math.min(255,r) + ',' + Math.min(255,g) + ',' + Math.min(255,b) + ')';
}
function dotBg(dot) {
  var base = dot.color || '#c62828';
  return 'radial-gradient(circle at 35% 35%,' + lighten(base) + ',' + base + ')';
}

window.renderDot = function(dot) {
  var eid = 'hs_' + sid(dot.id), el = document.getElementById(eid);
  if (!el) {
    el = document.createElement('div'); el.className = 'hotspot'; el.id = eid; el.dataset.dotId = dot.id;
    var d   = document.createElement('div'); d.className = 'hdot';
    var lbl = document.createElement('div'); lbl.className = 'hlbl'; lbl.textContent = dot.id;
    lbl.style.display = 'none';
    el.appendChild(d); el.appendChild(lbl);
    el.addEventListener('mousedown', function(ev) {
      ev.stopPropagation(); if (appMode !== 'move') return;
      dragging = { el: el, dot: dot };
      var r = document.getElementById('mapWrap').getBoundingClientRect();
      dOff.x = ev.clientX - r.left - (dot.left / 100 * r.width);
      dOff.y = ev.clientY - r.top  - (dot.top  / 100 * r.height);
      ev.preventDefault();
    });
    el.addEventListener('click', function(ev) {
      ev.stopPropagation(); if (appMode === 'move') return;
      var fd = getFloor(); var latestDot = fd && fd.dots ? fd.dots[dot.id] : dot;
      if (appMode === 'view') showPopup(latestDot || dot, ev);
      else openPanel(latestDot || dot);
    });
    document.getElementById('mapWrap').appendChild(el);
  }
  var d = el.querySelector('.hdot');
  d.style.width  = (dot.size || 26) + 'px';
  d.style.height = (dot.size || 26) + 'px';
  d.style.background = dotBg(dot);
  el.querySelector('.hlbl').textContent = dot.id;
  el.style.left = dot.left + '%';
  el.style.top  = dot.top  + '%';
};

/* ── DRAG ───────────────────────────────────────────────── */
document.addEventListener('mousemove', function(e) {
  if (!dragging) return;
  var r  = document.getElementById('mapWrap').getBoundingClientRect();
  var lp = Math.max(0, Math.min(100, (e.clientX - r.left - dOff.x) / r.width  * 100));
  var tp = Math.max(0, Math.min(100, (e.clientY - r.top  - dOff.y) / r.height * 100));
  dragging.dot.left = parseFloat(lp.toFixed(2));
  dragging.dot.top  = parseFloat(tp.toFixed(2));
  dragging.el.style.left = lp + '%';
  dragging.el.style.top  = tp + '%';
});

document.addEventListener('mouseup', function() {
  if (dragging) {
    if (typeof fbSaveDot === 'function' && window._isAdmin) {
      fbSaveDot(curB, curF, dragging.dot);
    }
    dragging = null;
  }
});

/* ── POPUP ──────────────────────────────────────────────── */
window.showPopup = function(dot, ev) {
  popDotId = dot.id;
  document.getElementById('popTitle').textContent = 'Router: ' + dot.id;
  document.getElementById('popRoom').textContent  = dot.room  || '—';
  document.getElementById('popIp').textContent    = dot.ip    || '—';
  document.getElementById('popBrand').textContent = dot.brand || '—';
  var sb = document.getElementById('popSig'); sb.innerHTML = '';
  var hs = [8,11,14,17,20], sv = dot.sig || 3;
  for (var i = 1; i <= 5; i++) {
    var sp = document.createElement('span');
    sp.style.height = hs[i-1] + 'px';
    sp.style.background = i <= sv ? (sv >= 4 ? 'var(--grn2)' : 'var(--red2)') : '#ddd';
    sb.appendChild(sp);
  }
  var pp = document.getElementById('popPhoto');
  if (dot.photo && (dot.photo.startsWith('data:') || dot.photo.startsWith('http'))) {
    pp.src = dot.photo; pp.style.display = 'block';
  } else { pp.style.display = 'none'; }
  if (dot.note) {
    document.getElementById('popNote').textContent = dot.note;
    document.getElementById('popNoteWrap').style.display = 'block';
  } else {
    document.getElementById('popNoteWrap').style.display = 'none';
  }
  document.querySelector('.pb-edit').style.display = window._isAdmin ? '' : 'none';
  var p = document.getElementById('popup'); p.style.display = 'block';
  var pw = 285, ph = 370;
  var cx = ev ? ev.clientX : window.innerWidth / 2;
  var cy = ev ? ev.clientY : window.innerHeight / 2;
  var left = cx + 16, top = cy - 20;
  if (left + pw > window.innerWidth  - 10) left = cx - pw - 16;
  if (top  + ph > window.innerHeight - 10) top  = window.innerHeight - ph - 10;
  if (left < 10) left = 10;
  if (top  < 10) top  = 10;
  p.style.left = left + 'px'; p.style.top = top + 'px';
};

window.closePopup = function() {
  document.getElementById('popup').style.display = 'none'; popDotId = null;
};

/* Popup drag */
(function() {
  var _pop = null, _drag = false, _sx = 0, _sy = 0, _sl = 0, _st = 0;
  document.addEventListener('mousedown', function(e) {
    var hd = e.target.closest('.pop-hd'); if (!hd) return;
    _pop = document.getElementById('popup');
    _drag = true; _sx = e.clientX; _sy = e.clientY;
    _sl = parseInt(_pop.style.left) || 0; _st = parseInt(_pop.style.top) || 0;
    e.preventDefault();
  });
  document.addEventListener('mousemove', function(e) {
    if (!_drag || !_pop) return;
    _pop.style.left = Math.max(0, Math.min(window.innerWidth  - 285, _sl + e.clientX - _sx)) + 'px';
    _pop.style.top  = Math.max(0, Math.min(window.innerHeight - 100, _st + e.clientY - _sy)) + 'px';
  });
  document.addEventListener('mouseup', function() { _drag = false; _pop = null; });
})();

/* ── RIGHT PANEL ────────────────────────────────────────── */
window.openPanel = function(dot) {
  curDotId = dot.id || null;
  tempDot  = dot;
  isNew    = isNew;   // preserved from caller
  dotColor = dot.color || '#c62828';
  dotSize  = dot.size  || 26;
  dotSig   = dot.sig   || 3;
  currentPhoto = dot.photo || '';

  document.getElementById('fId').value    = dot.id    || '';
  document.getElementById('fRoom').value  = dot.room  || '';
  document.getElementById('fBrand').value = dot.brand || '';
  document.getElementById('fIp').value    = dot.ip    || '';
  document.getElementById('fNote').value  = dot.note  || '';
  document.getElementById('rpTitle').textContent = dot.id || 'ข้อมูลจุด';

  // signal
  document.getElementById('sigR').value = dotSig;
  updateSig(dotSig);
  // size
  document.getElementById('szR').value = dotSize;
  document.getElementById('szV').textContent = dotSize + 'px';
  // color
  document.getElementById('cCol').value = dotColor;
  updateDotPrev();
  // swatches
  document.querySelectorAll('.csw').forEach(function(sw) {
    sw.classList.toggle('active', sw.dataset.color === dotColor);
  });
  // photo
  var prev = document.getElementById('photoPrev');
  var uic  = document.getElementById('photoUp').querySelector('.pu-ic');
  var utx  = document.getElementById('photoUp').querySelector('.pu-tx');
  if (currentPhoto) {
    prev.src = currentPhoto; prev.style.display = 'block';
    if(uic) uic.style.display='none'; if(utx) utx.style.display='none';
  } else {
    prev.style.display = 'none';
    if(uic) uic.style.display=''; if(utx) utx.style.display='';
  }

  document.getElementById('rpanel').style.display = 'flex';
};

window.closePanel = function() {
  document.getElementById('rpanel').style.display = 'none';
  curDotId = null; tempDot = null; isNew = false; currentPhoto = '';
};

window.editFromPopup = function() {
  if (!popDotId) return;
  var fd = getFloor(); if (!fd) return;
  var dot = (fd.dots && fd.dots[popDotId]) || {};
  isNew = false; curDotId = popDotId;
  openPanel(dot); closePopup();
};

window.repFromPopup = function() {
  if (!popDotId) return;
  var fd = getFloor(); var dot = (fd && fd.dots && fd.dots[popDotId]) || {};
  document.getElementById('rDev').value  = dot.id   || '';
  document.getElementById('rRoom').value = dot.room || '';
  openReport();
};

/* ── SIGNAL / SIZE / COLOR CONTROLS ────────────────────── */
window.updateSig = function(v) {
  dotSig = parseInt(v);
  var num  = document.getElementById('sigNum');
  var prev = document.getElementById('sigPrev');
  if (num) num.textContent = v + '/5';
  if (prev) {
    prev.innerHTML = '';
    var hs = [8,11,14,17,20];
    for (var i = 1; i <= 5; i++) {
      var sp = document.createElement('span');
      sp.style.cssText = 'display:block;width:5px;height:' + hs[i-1] + 'px;border-radius:2px;background:' + (i <= dotSig ? (dotSig >= 4 ? '#43a047' : '#e53935') : '#ddd') + ';';
      prev.appendChild(sp);
    }
  }
};

window.setSize = function(v) {
  dotSize = parseInt(v);
  document.getElementById('szV').textContent = v + 'px';
  updateDotPrev();
};

window.setColor = function(c) {
  dotColor = c;
  document.getElementById('cCol').value = c;
  document.querySelectorAll('.csw').forEach(function(sw) {
    sw.classList.toggle('active', sw.dataset.color === c);
  });
  updateDotPrev();
};

function updateDotPrev() {
  var el = document.getElementById('dotPrev'); if (!el) return;
  var base = dotColor || '#c62828';
  var r = parseInt(base.slice(1,3),16)+90, g = parseInt(base.slice(3,5),16)+90, b = parseInt(base.slice(5,7),16)+90;
  var light = 'rgb('+Math.min(255,r)+','+Math.min(255,g)+','+Math.min(255,b)+')';
  el.style.width  = dotSize + 'px';
  el.style.height = dotSize + 'px';
  el.style.background = 'radial-gradient(circle at 35% 35%,' + light + ',' + base + ')';
}

/* ── PHOTO ──────────────────────────────────────────────── */
window.handlePhoto = function(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var img = new Image();
    img.onload = function() {
      var cv = document.createElement('canvas');
      var SZ = 600, w = img.width, h = img.height;
      if (w > h) { if (w > SZ) { h = Math.round(h * SZ / w); w = SZ; } }
      else        { if (h > SZ) { w = Math.round(w * SZ / h); h = SZ; } }
      cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h);
      currentPhoto = cv.toDataURL('image/jpeg', .82);
      var prev = document.getElementById('photoPrev');
      var uic  = document.getElementById('photoUp').querySelector('.pu-ic');
      var utx  = document.getElementById('photoUp').querySelector('.pu-tx');
      prev.src = currentPhoto; prev.style.display = 'block';
      if(uic) uic.style.display='none'; if(utx) utx.style.display='none';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file); e.target.value = '';
};

/* ── SAVE / DELETE DOT ──────────────────────────────────── */
window.saveDot = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  if (!curB || !curF) { flash('กรุณาเลือกอาคารและชั้นก่อน','#ef5350'); return; }
  var id = document.getElementById('fId').value.trim();
  if (!id) { flash('กรุณาระบุรหัส/ชื่อจุด','#ef5350'); return; }
  var photo = currentPhoto || '';
  if (!photo && !isNew && curDotId) {
    var fd0 = getFloor();
    if (fd0 && fd0.dots && fd0.dots[curDotId]) photo = fd0.dots[curDotId].photo || '';
  }
  var dot = {
    id: id,
    room:  document.getElementById('fRoom').value.trim(),
    brand: document.getElementById('fBrand').value.trim(),
    ip:    document.getElementById('fIp').value.trim(),
    note:  document.getElementById('fNote').value.trim(),
    sig: dotSig, color: dotColor, size: dotSize, photo: photo,
    left: isNew ? pendingLeft : (tempDot ? parseFloat(tempDot.left.toFixed(2)) : 50),
    top:  isNew ? pendingTop  : (tempDot ? parseFloat(tempDot.top.toFixed(2))  : 50)
  };
  var fd = getFloor(); if (!fd) { flash('ไม่พบข้อมูลชั้น','#ef5350'); return; }
  if (!fd.dots) fd.dots = {};
  if (isNew && fd.dots[id]) { flash('มีจุด "' + id + '" อยู่แล้ว กรุณาใช้ชื่ออื่น','#ef5350'); return; }
  if (!isNew && curDotId && curDotId !== id) {
    delete fd.dots[curDotId];
    var old = document.getElementById('hs_' + sid(curDotId));
    if (old) old.remove();
  }
  fd.dots[id] = dot;
  curDotId = id; isNew = false; tempDot = dot;
  clearDots();
  Object.values(fd.dots).forEach(renderDot);
  document.getElementById('rpTitle').textContent = id;
  document.querySelectorAll('.hotspot').forEach(function(h) { h.classList.remove('sel'); });
  var he = document.getElementById('hs_' + sid(id)); if (he) he.classList.add('sel');
  updateUI();
  if (typeof fbSaveDot       === 'function') fbSaveDot(curB, curF, dot);
  if (typeof fbSaveStructure === 'function') fbSaveStructure();
  flash('💾 บันทึกจุด "' + id + '" แล้ว');
};

window.delDot = function() {
  if (!window._isAdmin) { window.flashFB('⛔ เฉพาะ Admin เท่านั้น','#e53935'); return; }
  if (isNew) { closePanel(); return; }
  if (!curDotId) { closePanel(); return; }
  showCfm('ลบจุด "' + curDotId + '" ใช่ไหม?', function() {
    var fd = getFloor();
    if (fd && fd.dots) delete fd.dots[curDotId];
    var el = document.getElementById('hs_' + sid(curDotId)); if (el) el.remove();
    if (typeof fbDeleteDot === 'function') fbDeleteDot(curB, curF, curDotId);
    closePanel(); updateUI(); flash('🗑 ลบจุดแล้ว');
  });
};

/* ── REPORT ─────────────────────────────────────────────── */
window.openReport  = function() { document.getElementById('repModal').classList.add('show'); };
window.closeReport = function() { document.getElementById('repModal').classList.remove('show'); };

/* ── SAVE / LOAD FILE ───────────────────────────────────── */
window.saveToFile = function() {
  var blob = new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'hcu-ap-data.json'; a.click();
  flash('✅ บันทึกไฟล์แล้ว');
};

window.loadFile = function(e) {
  var file = e.target.files[0]; if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    try {
      var d = JSON.parse(ev.target.result);
      if (!d.buildings) { flash('ไฟล์ไม่ถูกต้อง','#ef5350'); return; }
      DB = d; curB = ''; curF = '';
      var bkeys = Object.keys(DB.buildings);
      if (bkeys.length) {
        curB = bkeys[0];
        var fkeys = Object.keys(DB.buildings[curB].floors || {});
        if (fkeys.length) curF = fkeys[0];
      }
      rebuildCddB(); renderFloorList(); loadFloorView(); updateUI();
      flash('✅ โหลดข้อมูลสำเร็จ');
    } catch(err) { flash('ไฟล์ไม่ถูกต้อง','#ef5350'); }
  };
  reader.readAsText(file); e.target.value = '';
};

/* ── SWATCHES ───────────────────────────────────────────── */
function buildSwatches() {
  var sw = document.getElementById('csws');
  COLS.forEach(function(c) {
    var d = document.createElement('div');
    d.className = 'csw' + (c === dotColor ? ' active' : '');
    d.style.background = c; d.dataset.color = c;
    d.onclick = function() { setColor(c); };
    sw.appendChild(d);
  });
}

/* ── INIT ───────────────────────────────────────────────── */
buildSwatches(); updateSig(3); updateDotPrev(); updateUI();

/* ════════════════════════════════════════
   LOADING OVERLAY
════════════════════════════════════════ */
window.showLoading = function(msg) {
  var lo = document.getElementById('loadingOverlay');
  var lt = document.getElementById('loadingText');
  if (lt) lt.textContent = msg || 'กำลังโหลดข้อมูล...';
  if (lo) { lo.classList.remove('hide'); lo.style.display = 'flex'; }
};

window.hideLoading = function() {
  var lo = document.getElementById('loadingOverlay');
  if (!lo) return;
  lo.classList.add('hide');
  setTimeout(function() { lo.style.display = 'none'; }, 450);
};

/* ════════════════════════════════════════
   SYNC STATUS
════════════════════════════════════════ */
window.setSyncStatus = function(state, timeStr) {
  var dot  = document.getElementById('syncDot');
  var txt  = document.getElementById('syncText');
  if (!dot || !txt) return;
  if (state === 'online') {
    dot.className = 'sync-dot online';
    txt.textContent = timeStr ? ('sync ' + timeStr) : 'เชื่อมต่อแล้ว';
  } else if (state === 'offline') {
    dot.className = 'sync-dot offline';
    txt.textContent = '⚠️ ออฟไลน์';
  } else {
    dot.className = 'sync-dot';
    txt.textContent = 'กำลังโหลด...';
  }
};

function timeAgo(ts) {
  var sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 10)  return 'เมื่อกี้';
  if (sec < 60)  return sec + ' วิที่แล้ว';
  if (sec < 3600) return Math.floor(sec / 60) + ' นาทีที่แล้ว';
  return Math.floor(sec / 3600) + ' ชม.ที่แล้ว';
}

var _lastSyncTs = 0;
window.markSynced = function() {
  _lastSyncTs = Date.now();
  setSyncStatus('online', 'เมื่อกี้');
};

setInterval(function() {
  if (_lastSyncTs > 0) setSyncStatus('online', timeAgo(_lastSyncTs));
}, 15000);

/* ════════════════════════════════════════
   TOGGLE ชื่อจุดบน MAP
════════════════════════════════════════ */
var labelsVisible = false;

window.toggleLabels = function() {
  labelsVisible = !labelsVisible;
  document.querySelectorAll('.hlbl').forEach(function(el) {
    el.style.display = labelsVisible ? 'block' : 'none';
  });
  var btn = document.getElementById('mbL');
  if (btn) {
    btn.classList.toggle('mbt-toggle-on', labelsVisible);
    btn.textContent = labelsVisible ? '🏷️ ซ่อนชื่อ' : '🏷️ ชื่อจุด';
  }
};

/* ════════════════════════════════════════
   FILTER จุดตามสัญญาณ
════════════════════════════════════════ */
var mapFilter = 'all';

window.setMapFilter = function(f) {
  mapFilter = f;
  ['mbFAll','mbFLow','mbFOk'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  var active = { all:'mbFAll', low:'mbFLow', ok:'mbFOk' }[f];
  var el = document.getElementById(active);
  if (el) el.classList.add('active');
  applyMapFilter();
};

function applyMapFilter() {
  var fd = getFloor(); if (!fd) return;
  document.querySelectorAll('.hotspot').forEach(function(hs) {
    var dotId = hs.dataset.dotId;
    var dot   = fd.dots && fd.dots[dotId];
    var sig   = dot ? (dot.sig || 0) : 0;
    var show  = true;
    if (mapFilter === 'low') show = sig <= 2;
    if (mapFilter === 'ok')  show = sig >= 4;
    hs.style.opacity = show ? '1' : '0.12';
    hs.style.pointerEvents = show ? '' : 'none';
  });
}

/* เรียก applyMapFilter หลัง renderDot ด้วย */
var _origRenderDot = window.renderDot;
window.renderDot = function(dot) {
  _origRenderDot(dot);
  applyMapFilter();
};

/* ════════════════════════════════════════
   PRINT / EXPORT
════════════════════════════════════════ */
window.printMap = function() {
  var fd = getFloor();
  if (!fd || !fd.img) { flash('กรุณาเลือกชั้นที่มีแผนผังก่อน','#ef5350'); return; }

  /* ตั้งค่า print header */
  var ph = document.getElementById('printHeader');
  if (ph) {
    ph.textContent = 'HCU Network Monitoring System  |  ' +
      (curB || '') + ' ' + (curF || '') +
      '  |  วันที่พิมพ์: ' + new Date().toLocaleDateString('th-TH', {
        year:'numeric', month:'long', day:'numeric'
      });
  }

  /* แสดงชื่อจุดทั้งหมดก่อนพิมพ์ */
  var prevVis = labelsVisible;
  document.querySelectorAll('.hlbl').forEach(function(el) { el.style.display = 'block'; });

  /* สร้าง legend */
  var leg = document.getElementById('printLegend');
  if (leg) {
    var dots = fd.dots ? Object.values(fd.dots) : [];
    var colors = {};
    dots.forEach(function(d) { if (d.color) colors[d.color] = true; });
    leg.innerHTML = '<span style="font-weight:700;margin-right:8px;">Legend:</span>';
    var sigLabels = ['ไม่มีสัญญาณ','ต่ำมาก','ต่ำ','ปานกลาง','ดี','ดีมาก'];
    var sigColors = ['#9e9e9e','#ef5350','#ff7043','#ffa726','#66bb6a','#43a047'];
    for (var i = 0; i <= 5; i++) {
      var sp = document.createElement('span');
      sp.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:11px;';
      sp.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:' + sigColors[i] + ';display:inline-block;"></span>' + sigLabels[i];
      leg.appendChild(sp);
    }
  }

  window.print();

  /* คืนค่าหลัง print */
  if (!prevVis) {
    document.querySelectorAll('.hlbl').forEach(function(el) { el.style.display = 'none'; });
  }
};

/* ════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════ */
document.addEventListener('keydown', function(e) {
  var tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 's') { e.preventDefault(); saveToFile(); return; }
    if (e.key === 'p') { e.preventDefault(); printMap(); return; }
  }
  switch (e.key) {
    case 'v': case 'V': setMode('view');  break;
    case 'a': case 'A': if (window._isAdmin) setMode('add');  break;
    case 'm': case 'M': if (window._isAdmin) setMode('move'); break;
    case 'l': case 'L': toggleLabels(); break;
    case 'd': case 'D': toggleDashboard(); break;
    case 'Escape':
      closePopup(); closePanel();
      document.querySelectorAll('.overlay').forEach(function(o) { o.classList.remove('show'); });
      break;
  }
});

/* ════════════════════════════════════════
   HELP MODAL
════════════════════════════════════════ */
window.openHelp = function() {
  document.getElementById('helpModal').classList.add('show');
};
window.closeHelp = function() {
  document.getElementById('helpModal').classList.remove('show');
};
