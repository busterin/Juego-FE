// --- Parámetros de juego ---
const filas = 8, columnas = 8;
const rangoJugador = 3;   // puntos de movimiento de unidades del jugador
const rangoEnemigo = 2;   // puntos de movimiento de cada enemigo
const ENEMY_BASE_DAMAGE = 50;   // daño fijo de enemigos
const STORAGE_KEY = "tactic-heroes-v1";

// --- Terrenos y costes ---
const TL = "llanura", BO = "bosque", AG = "agua", MO = "montana";
const terrainCost = { [TL]:1, [BO]:2, [AG]:Infinity, [MO]:Infinity };
const passable = t => terrainCost[t] !== Infinity;

// Mapa 8x8 de ejemplo (edítalo a gusto)
let tilemap = [
  [TL,TL,TL,TL,BO,BO,TL,TL],
  [TL,TL,BO,BO,BO,TL,TL,TL],
  [TL,TL,TL,TL,TL,TL,TL,TL],
  [TL,AG,AG,TL,TL,TL,BO,TL],
  [TL,AG,AG,TL,MO,TL,BO,TL],
  [TL,TL,TL,TL,MO,TL,TL,TL],
  [TL,TL,BO,TL,TL,TL,TL,TL],
  [TL,TL,TL,TL,TL,TL,TL,TL],
];

// --- Estado general ---
let turno = "jugador"; // 'jugador' | 'enemigo' | 'fin'
let wave = 1;          // oleada (no se muestra, pero la usamos)
let enemies = [];      // lista de enemigos

// --- Unidades del jugador ---
const makeKnight = () => ({
  tipo: "caballero",
  fila: 4, col: 2, vivo: true,
  nombre: "Caballero",
  hp: 100, maxHp: 100,
  retrato: "assets/player.png",
  nivel: 1, kills: 0,
  damage: 50,
  range: [1],            // solo adyacente
  acted: false
});

const makeArcher = () => ({
  tipo: "arquera",
  fila: 5, col: 2, vivo: true,
  nombre: "Arquera",
  hp: 80, maxHp: 80,
  retrato: "assets/archer.png",
  nivel: 1, kills: 0,
  damage: 50,           // pedido: 50 de daño
  range: [2],           // SOLO a 2 casillas exactas en línea recta
  acted: false
});

let players = [ makeKnight(), makeArcher() ];

let seleccionado = null;             // unidad propia seleccionada
let celdasMovibles = new Set();      // "f,c" alcanzables con coste

// --- DOM ---
const mapa = document.getElementById("mapa");
const acciones = document.getElementById("acciones");
const turnoLabel = document.getElementById("turno");
const ficha = document.getElementById("ficha");
const btnFinTurno = document.getElementById("btnFinTurno");

// --- Guardado / Carga ---
function saveProgress() {
  const data = {
    wave,
    players: players.map(p => ({
      tipo: p.tipo,
      fila: p.fila, col: p.col, vivo: p.vivo,
      hp: p.hp, maxHp: p.maxHp,
      nivel: p.nivel, kills: p.kills, damage: p.damage
    }))
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    wave = d.wave ?? 1;
    if (Array.isArray(d.players) && d.players.length === 2){
      const pk = makeKnight(), pa = makeArcher();
      const srcK = d.players.find(x=>x.tipo==="caballero") || pk;
      const srcA = d.players.find(x=>x.tipo==="arquera") || pa;
      players = [
        Object.assign(pk, srcK, {range:[1]}),
        Object.assign(pa, srcA, {range:[2]})
      ];
    }
    return true;
  } catch { return false; }
}

function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  wave = 1;
  players = [ makeKnight(), makeArcher() ];
  enemies = [];
  seleccionado = null;
  celdasMovibles.clear();
  spawnWave();
  dibujarMapa();
  setTurno("jugador");
  renderFicha(null);
}

// --- Ajuste responsivo del tamaño de las celdas ---
function ajustarTamanoTablero() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const margenHorizontal = 24, margenVertical = 240;
  const disponibleAncho = vw - margenHorizontal;
  const disponibleAlto  = vh - margenVertical;
  const ladoTablero = Math.max(240, Math.min(disponibleAncho, disponibleAlto));
  const gap = 3, celdas = 8;
  const cellPx = Math.floor((ladoTablero - (celdas - 1) * gap) / celdas);
  const cellClamped = Math.min(cellPx, 96);
  document.documentElement.style.setProperty('--cell', `${cellClamped}px`);
}
window.addEventListener('resize', ajustarTamanoTablero);
window.addEventListener('orientationchange', ajustarTamanoTablero);

// --- Utilidades ---
const key = (f,c) => `${f},${c}`;
const dentro = (f,c) => f>=0 && f<filas && c>=0 && c<columnas;
const manhattan = (a,b) => Math.abs(a.fila-b.fila)+Math.abs(a.col-b.col);
const enLineaRecta = (a,b) => (a.fila===b.fila) || (a.col===b.col);
function setTurno(t){
  turno = t;
  turnoLabel.textContent = (t === "jugador") ? "TU TURNO" :
                           (t === "enemigo") ? "TURNO ENEMIGO" : "FIN DE PARTIDA";
}

// --- Spawner de oleadas ---
function spawnWave(){
  enemies = [];
  const count = Math.min(2 + wave, 6);
  const ocupadas = new Set([
    ...players.filter(p=>p.vivo).map(p=>key(p.fila,p.col))
  ]);

  for (let i=0; i<count; i++){
    let f,c;
    do {
      f = Math.floor(Math.random()*filas);
      c = Math.floor(Math.random()*columnas);
    } while (
      ocupadas.has(key(f,c)) ||
      !passable(tilemap[f][c])
    );
    ocupadas.add(key(f,c));
    enemies.push({
      id: `E${Date.now()}-${i}`,
      nombre: `Bandido ${i+1}`,
      fila: f, col: c, vivo: true,
      hp: 50, maxHp: 50,                // 50 de vida
      retrato: "assets/enemy.png",
      damage: ENEMY_BASE_DAMAGE         // 50 de daño
    });
  }
  // Al empezar turno del jugador, reset de acciones
  if (turno==="jugador") players.forEach(p=>p.acted=false);
}

// --- Render ---
function dibujarMapa() {
  mapa.innerHTML = "";
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = document.createElement("div");
      celda.className = `celda ${tilemap[f][c]}`;
      celda.dataset.fila = f;
      celda.dataset.col = c;

      if (seleccionado && celdasMovibles.has(key(f,c))) celda.classList.add("movible");
      if (seleccionado && seleccionado.fila===f && seleccionado.col===c) celda.classList.add("seleccionada");

      // Minis jugadores
      players.forEach(p=>{
        if (p.vivo && p.fila===f && p.col===c){
          const mini = document.createElement("div");
          mini.className = "fichaMini " + (p.tipo==="caballero" ? "mini-caballero" : "mini-arquera");
          celda.appendChild(mini);
        }
      });
      // Minis enemigos
      enemies.forEach(en => {
        if (en.vivo && en.fila===f && en.col===c){
          const mini = document.createElement("div");
          mini.className = "fichaMini mini-enemigo";
          celda.appendChild(mini);
        }
      });

      celda.addEventListener("click", () => manejarClick(f,c));
      mapa.appendChild(celda);
    }
  }
}

function botonesAccionesPara(unidad){
  acciones.innerHTML = "";
  if (turno !== "jugador" || !unidad?.vivo) return;

  const bEnd = document.createElement("button");
  bEnd.textContent = "Terminar acción";
  bEnd.onclick = () => {
    unidad.acted = true;
    seleccionado = null;
    celdasMovibles.clear();
    dibujarMapa();
    acciones.innerHTML = "";
    comprobarCambioATurnoEnemigo();
  };
  acciones.appendChild(bEnd);

  const objetivos = enemigosEnRango(unidad);
  objetivos.forEach(en => {
    const b = document.createElement("button");
    b.className = "primary";
    b.textContent = `ATACAR ${en.nombre} (-${unidad.damage})`;
    b.onclick = () => atacarUnidadA(unidad, en);
    acciones.appendChild(b);
  });
}

btnFinTurno.onclick = () => {
  if (turno !== "jugador") return;
  players.forEach(p=>p.acted = true);
  seleccionado = null;
  celdasMovibles.clear();
  acciones.innerHTML = "";
  setTurno("enemigo");
  setTimeout(turnoIAEnemigos, 300);
};

// --- Ficha inferior ---
function renderFicha(unidad){
  if (!unidad) { ficha.style.display = "none"; ficha.innerHTML = ""; return; }
  const pct = Math.max(0, Math.min(100, Math.round((unidad.hp / unidad.maxHp) * 100)));
  const grad = (pct > 50) ? "linear-gradient(90deg, #2ecc71, #27ae60)" :
               (pct > 25) ? "linear-gradient(90deg, #f1c40f, #e67e22)" :
                            "linear-gradient(90deg, #e74c3c, #c0392b)";
  const esJugador = players.includes(unidad);
  const extra = esJugador
    ? `<p class="meta">Nivel <b>${unidad.nivel}</b> · Daño <b>${unidad.damage}</b> · KOs <b>${unidad.kills}</b>${unidad.acted?" · Acción gastada":""}</p>`
    : ``;
  ficha.innerHTML = `
    <div class="card">
      <div class="portrait" style="background-image:url('${unidad.retrato}')"></div>
      <div class="info">
        <p class="name">${unidad.nombre}</p>
        ${extra}
        <div class="hp">
          <div class="bar"><span style="width:${pct}%; background:${grad}"></span></div>
          <div class="value">${unidad.hp}/${unidad.maxHp} HP</div>
        </div>
      </div>
    </div>
  `;
  ficha.style.display = "block";
}

// --- FX de ataque: flash, parpadeo y número flotante ---
function efectoAtaque(objetivo, cantidad, fuente /* 'player' | 'enemy' */){
  const idx = objetivo.fila * columnas + objetivo.col;
  const celda = mapa.children[idx];
  if (!celda) return;

  // Flash según fuente
  const flashClass = (fuente === 'enemy') ? 'flash-enemy' : 'flash-player';
  celda.classList.add(flashClass);
  setTimeout(() => celda.classList.remove(flashClass), 280);

  // Parpadeo en el sprite
  const sprite = celda.firstElementChild;
  if (sprite) {
    sprite.classList.add('blink-hit');
    setTimeout(() => sprite.classList.remove('blink-hit'), 1200);
  }

  // Número flotante
  const dmg = document.createElement('div');
  dmg.className = 'dmg-float ' + (fuente === 'enemy' ? 'dmg-enemy' : 'dmg-player');
  dmg.textContent = `-${cantidad}`;
  celda.appendChild(dmg);
  setTimeout(()=>{ if (dmg.parentNode) dmg.parentNode.removeChild(dmg); }, 650);
}

function aplicarDanyo(objetivo, cantidad, fuente /* 'player' | 'enemy' */){
  objetivo.hp = Math.max(0, objetivo.hp - cantidad);
  if (objetivo.hp <= 0) objetivo.vivo = false;
  efectoAtaque(objetivo, cantidad, fuente);
}

// --- Subida de nivel (cada 3 kills por unidad) ---
function comprobarSubidaNivel(pj){
  if (pj.kills > 0 && pj.kills % 3 === 0) {
    pj.nivel += 1;
    pj.maxHp += 10;
    pj.hp = Math.min(pj.maxHp, pj.hp + 10);
    pj.damage += 10;
    renderFicha(pj);
    saveProgress();
    return true;
  }
  return false;
}

// --- Movimiento (BFS por coste) ---
function calcularCeldasMovibles(unidad){
  celdasMovibles.clear();
  const coste = Array.from({length: filas}, ()=>Array(columnas).fill(Infinity));
  const q = [];
  coste[unidad.fila][unidad.col] = 0;
  q.push({f: unidad.fila, c: unidad.col});

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (q.length){
    const {f,c} = q.shift();
    for (const [df,dc] of dirs){
      const nf=f+df, nc=c+dc;
      if (!dentro(nf,nc)) continue;
      const terr = tilemap[nf][nc];
      if (!passable(terr)) continue;

      // ocupado por cualquier unidad (aliada/enemiga) ≡ no pasas
      const ocupado = enemies.some(e=>e.vivo && e.fila===nf && e.col===nc) ||
                      players.some(p=>p.vivo && p!==unidad && p.fila===nf && p.col===nc);
      if (ocupado) continue;

      const nuevoCoste = coste[f][c] + terrainCost[terr];
      if (nuevoCoste <= rangoJugador && nuevoCoste < coste[nf][nc]){
        coste[nf][nc] = nuevoCoste;
        q.push({f:nf,c:nc});
      }
    }
  }
  for (let f=0; f<filas; f++){
    for (let c=0; c<columnas; c++){
      if ((f!==unidad.fila || c!==unidad.col) && coste[f][c] <= rangoJugador){
        celdasMovibles.add(key(f,c));
      }
    }
  }
}

function enemigosEnRango(unidad){
  return enemies.filter(e=>{
    if (!e.vivo) return false;
    if (!enLineaRecta(unidad, e)) return false; // sólo ortogonal
    const d = Math.abs(unidad.fila - e.fila) + Math.abs(unidad.col - e.col);
    return unidad.range.includes(d);
  });
}

// --- Clicks ---
function manejarClick(f,c){
  // Mostrar ficha si hay unidad
  const pj = players.find(p=>p.vivo && p.fila===f && p.col===c);
  const en = enemies.find(e=>e.vivo && e.fila===f && e.col===c);
  if (pj){ renderFicha(pj); }
  else if (en){ renderFicha(en); }

  if (turno !== "jugador") return;

  // Seleccionar unidad propia si no gastó acción
  if (pj){
    if (pj.acted){
      seleccionado = null;
      celdasMovibles.clear();
      dibujarMapa();
      acciones.innerHTML = "";
      return;
    }
    seleccionado = pj;
    calcularCeldasMovibles(seleccionado);
    dibujarMapa();
    botonesAccionesPara(seleccionado);
    return;
  }

  // Si hay una unidad seleccionada, intentar moverla
  if (seleccionado){
    if (f === seleccionado.fila && c === seleccionado.col){
      // deseleccionar
      seleccionado = null;
      celdasMovibles.clear();
      dibujarMapa();
      acciones.innerHTML = "";
      return;
    }
    const esAlcanzable = celdasMovibles.has(key(f,c));
    const ocupado = enemies.some(e=>e.vivo && e.fila===f && e.col===c) ||
                    players.some(p=>p.vivo && p!==seleccionado && p.fila===f && p.col===c);
    const terr = tilemap[f][c];
    if (passable(terr) && esAlcanzable && !ocupado){
      seleccionado.fila = f; seleccionado.col = c;
      dibujarMapa();
      botonesAccionesPara(seleccionado);
    }
  }
}

// --- Combate ---
function atacarUnidadA(unidad, objetivo){
  aplicarDanyo(objetivo, unidad.damage, 'player');
  renderFicha(objetivo);
  if (!objetivo.vivo){
    unidad.kills += 1;

    // ¿fin de oleada?
    if (enemies.every(e => !e.vivo)) {
      wave += 1;
      unidad.acted = true;
      seleccionado = null;
      celdasMovibles.clear();
      dibujarMapa();
      acciones.innerHTML = "<div id='mensaje'>¡Oleada superada!</div>";
      setTimeout(()=>{
        spawnWave();
        dibujarMapa();
        setTurno("jugador");
        acciones.innerHTML = "";
        players.forEach(p=>p.acted=false);
      }, 500);
      return;
    }

    const subio = comprobarSubidaNivel(unidad);
    dibujarMapa();
    if (subio) { /* turno sigue en jugador */ }
  }
  // Tras atacar, esa unidad gasta su acción
  unidad.acted = true;
  seleccionado = null;
  celdasMovibles.clear();
  acciones.innerHTML = "";
  dibujarMapa();
  comprobarCambioATurnoEnemigo();
}

function comprobarCambioATurnoEnemigo(){
  if (players.every(p => !p.vivo || p.acted)) {
    setTurno("enemigo");
    setTimeout(turnoIAEnemigos, 300);
  }
}

// --- IA Enemiga ---
function turnoIAEnemigos(){
  if (turno !== "enemigo") return;
  const objetivos = players.filter(p=>p.vivo);
  if (objetivos.length === 0) {
    acciones.innerHTML = "<div id='mensaje' style='color:#842029'>¡Has sido derrotado!</div>";
    setTurno("fin"); return;
  }

  for (const en of enemies) {
    if (!en.vivo) continue;

    // objetivo: el jugador más cercano
    let objetivo = objetivos[0];
    let mejor = manhattan(en, objetivo);
    for (const p of objetivos){
      const d = manhattan(en, p);
      if (d < mejor){ mejor = d; objetivo = p; }
    }

    // Si ya está adyacente, ataca
    if (manhattan(en, objetivo) === 1) {
      aplicarDanyo(objetivo, en.damage, 'enemy');
    } else {
      // Mover hacia el objetivo (BFS evitando impasables y choques)
      const path = shortestPath(en.fila, en.col, objetivo.fila, objetivo.col, true);
      if (path.length > 1){
        let pasos = Math.min(rangoEnemigo, path.length-1);
        while (pasos > 0){
          const next = path[path.length - 1 - pasos + 1];
          const ocupado = enemies.some(o => o!==en && o.vivo && o.fila===next.f && o.col===next.c) ||
                          players.some(p=>p.vivo && p.fila===next.f && p.col===next.c);
          if (ocupado) break;
          en.fila = next.f; en.col = next.c;
          pasos--;
        }
      }
      if (manhattan(en, objetivo) === 1) {
        aplicarDanyo(objetivo, en.damage, 'enemy');
      }
    }
  }

  // Fin de turno enemigo → vuelve al jugador y resetea acciones
  players.forEach(p=>p.acted=false);
  players.forEach(p=>{ if (p.hp<=0) p.vivo=false; });
  renderFicha(players.find(p=>p.vivo) || null);
  dibujarMapa();

  if (players.every(p=>!p.vivo)) {
    acciones.innerHTML = "<div id='mensaje' style='color:#842029'>¡Has sido derrotado!</div>";
    setTurno("fin");
  } else {
    setTurno("jugador");
    acciones.innerHTML = "";
  }
}

// BFS de camino mínimo evitando impasables y (opcional) evitando enemigos
function shortestPath(sf, sc, tf, tc, avoidEnemies){
  const prev = Array.from({length: filas}, ()=>Array(columnas).fill(null));
  const q = [];
  const seen = Array.from({length: filas}, ()=>Array(columnas).fill(false));
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  q.push({f:sf,c:sc}); seen[sf][sc]=true;

  while (q.length){
    const {f,c} = q.shift();
    if (f===tf && c===tc) break;
    for (const [df,dc] of dirs){
      const nf=f+df, nc=c+dc;
      if (!dentro(nf,nc)) continue;
      const terr = tilemap[nf][nc];
      if (!passable(terr)) continue;
      if (avoidEnemies && enemies.some(e=>e.vivo && e.fila===nf && e.col===nc)) continue;
      if (!seen[nf][nc]) {
        seen[nf][nc]=true;
        prev[nf][nc]={f,c};
        q.push({f:nf,c:nc});
      }
    }
  }

  const path = [];
  let cur = {f:tf,c:tc};
  if (!prev[tf][tc]) return [];
  while (cur){
    path.push(cur);
    cur = prev[cur.f][cur.c];
  }
  return path.reverse();
}

// --- Inicio ---
function init(){
  ajustarTamanoTablero();
  const had = loadProgress();
  if (!had) saveProgress();
  players.forEach(p=>p.acted=false);
  spawnWave();
  dibujarMapa();
  setTurno("jugador");
  renderFicha(null);

  document.getElementById("btnGuardar").onclick = saveProgress;
  document.getElementById("btnReset").onclick = resetProgress;
}
init();