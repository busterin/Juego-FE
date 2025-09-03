// --- Parámetros de juego ---
const filas = 8, columnas = 8;
const rangoJugador = 3;   // puntos de movimiento del jugador
const rangoEnemigo = 2;   // puntos de movimiento de cada enemigo
const ENEMY_BASE_DAMAGE = 50;
const STORAGE_KEY = "mini-tactico-progress-v1";

// --- Terrenos y costes ---
const TL = "llanura", BO = "bosque", AG = "agua", MO = "montana";
const terrainCost = {
  [TL]: 1,
  [BO]: 2,
  [AG]: Infinity,   // impasable
  [MO]: Infinity    // impasable
};
function passable(t) { return terrainCost[t] !== Infinity; }

// Mapa 8x8 (edítalo como quieras)
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

// Estado general
let turno = "jugador"; // 'jugador' | 'enemigo' | 'fin'
let wave = 1;          // oleada actual
let enemies = [];      // array de enemigos vivos

// Personaje del jugador con sistema de nivel
let jugador = { 
  fila: 4, col: 2, vivo: true,
  nombre: "Caballero",
  hp: 100, maxHp: 100,
  retrato: "assets/player.png",
  nivel: 1,
  kills: 0,
  damage: 50
};

let seleccionado = false;
let celdasMovibles = new Set();     // "f,c" alcanzables con coste
let ultimoObjetivo = null;

// DOM
const mapa = document.getElementById("mapa");
const acciones = document.getElementById("acciones");
const turnoLabel = document.getElementById("turno");
const ficha = document.getElementById("ficha");
const estado = document.getElementById("estado");

// --- Guardado / Carga ---
function saveProgress() {
  const data = {
    wave,
    jugador: {
      hp: jugador.hp, maxHp: jugador.maxHp,
      nivel: jugador.nivel, kills: jugador.kills, damage: jugador.damage
    }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  flashEstado("Progreso guardado.");
}
function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    wave = d.wave ?? 1;
    jugador.maxHp = d.jugador?.maxHp ?? 100;
    jugador.hp    = Math.min(jugador.maxHp, d.jugador?.hp ?? jugador.maxHp);
    jugador.nivel = d.jugador?.nivel ?? 1;
    jugador.kills = d.jugador?.kills ?? 0;
    jugador.damage = d.jugador?.damage ?? 50;
    return true;
  } catch { return false; }
}
function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  wave = 1;
  jugador = { 
    fila: 4, col: 2, vivo: true,
    nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.png",
    nivel: 1, kills: 0, damage: 50
  };
  enemies = [];
  seleccionado = false;
  celdasMovibles.clear();
  ultimoObjetivo = null;
  flashEstado("Progreso reiniciado.");
  spawnWave();
  dibujarMapa();
  setTurno("jugador");
  renderFicha(null);
}

// --- UI Estado ---
function flashEstado(msg){
  estado.textContent = `Oleada ${wave} · Nivel ${jugador.nivel} · Daño ${jugador.damage} · HP ${jugador.hp}/${jugador.maxHp} — ${msg}`;
  setTimeout(updateEstado, 1600);
}
function updateEstado(){
  estado.textContent = `Oleada ${wave} · Nivel ${jugador.nivel} · Daño ${jugador.damage} · HP ${jugador.hp}/${jugador.maxHp} · Enemigos ${enemies.filter(e=>e.vivo).length}`;
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
const adyacentes = (a,b) =>
  (Math.abs(a.fila - b.fila) === 1 && a.col === b.col) ||
  (Math.abs(a.col - b.col) === 1 && a.fila === b.fila);

// --- Spawner de oleadas (no aparece en tiles impasables) ---
function spawnWave(){
  enemies = [];
  const count = Math.min(2 + wave, 6);
  const ocupadas = new Set([key(jugador.fila, jugador.col)]);
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
      hp: 100, maxHp: 100,
      retrato: "assets/enemy.png",
      damage: ENEMY_BASE_DAMAGE
    });
  }
  updateEstado();
}

// --- Render (incluye clase de terreno en cada celda) ---
function dibujarMapa() {
  mapa.innerHTML = "";
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = document.createElement("div");
      celda.className = `celda ${tilemap[f][c]}`; // terreno
      celda.dataset.fila = f;
      celda.dataset.col = c;

      if (seleccionado && celdasMovibles.has(key(f,c))) celda.classList.add("movible");
      if (seleccionado && jugador.fila===f && jugador.col===c) celda.classList.add("seleccionada");

      if (jugador.vivo && jugador.fila === f && jugador.col === c) {
        const pj = document.createElement("div");
        pj.className = "fichaMini jugador";
        celda.appendChild(pj);
      }
      enemies.forEach(en => {
        if (en.vivo && en.fila===f && en.col===c){
          const mini = document.createElement("div");
          mini.className = "fichaMini enemigo";
          celda.appendChild(mini);
        }
      });

      celda.addEventListener("click", () => manejarClick(f,c));
      mapa.appendChild(celda);
    }
  }
}

function setTurno(t){
  turno = t;
  turnoLabel.textContent = (t === "jugador") ? "TU TURNO" :
                           (t === "enemigo") ? "TURNO ENEMIGO" : "FIN DE PARTIDA";
}

function refrescarUIAcciones() {
  acciones.innerHTML = "";
  if (turno !== "jugador" || !jugador.vivo) return;

  const adj = enemigosAdyacentes(jugador);
  if (adj.length > 0) {
    adj.forEach(en => {
      const b = document.createElement("button");
      b.className = "primary";
      b.textContent = `ATACAR ${en.nombre} (-${jugador.damage})`;
      b.onclick = () => atacarJugadorA(en);
      acciones.appendChild(b);
    });
  } else {
    const bPasar = document.createElement("button");
    bPasar.textContent = "PASAR TURNO";
    bPasar.onclick = () => {
      seleccionado = false;
      celdasMovibles.clear();
      dibujarMapa();
      setTurno("enemigo");
      acciones.innerHTML = "";
      setTimeout(turnoIAEnemigos, 300);
    };
    acciones.appendChild(bPasar);
  }
}

// --- Ficha inferior ---
function renderFicha(unidad){
  if (!unidad) { ficha.style.display = "none"; ficha.innerHTML = ""; return; }
  const pct = Math.max(0, Math.min(100, Math.round((unidad.hp / unidad.maxHp) * 100)));
  const grad = (pct > 50) ? "linear-gradient(90deg, #2ecc71, #27ae60)" :
               (pct > 25) ? "linear-gradient(90deg, #f1c40f, #e67e22)" :
                            "linear-gradient(90deg, #e74c3c, #c0392b)";
  const esJugador = unidad === jugador;
  const extra = esJugador
    ? `<p class="meta">Nivel <b>${jugador.nivel}</b> · Daño <b>${jugador.damage}</b> · KOs <b>${jugador.kills}</b></p>`
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

function aplicarDanyo(objetivo, cantidad){
  objetivo.hp = Math.max(0, objetivo.hp - cantidad);
  if (objetivo.hp <= 0) objetivo.vivo = false;
}

function comprobarSubidaNivel(pj){
  if (pj.kills > 0 && pj.kills % 3 === 0) {
    pj.nivel += 1;
    pj.maxHp += 10;
    pj.hp = Math.min(pj.maxHp, pj.hp + 10);
    pj.damage += 10;
    flashEstado(`¡${pj.nombre} sube a nivel ${pj.nivel}! (+10 HP máx, +10 daño)`);
    renderFicha(pj);
    saveProgress();
    return true;
  }
  return false;
}

// --- Calcular celdas alcanzables (BFS por coste) ---
function calcularCeldasMovibles(){
  celdasMovibles.clear();
  const coste = Array.from({length: filas}, ()=>Array(columnas).fill(Infinity));
  const q = [];
  coste[jugador.fila][jugador.col] = 0;
  q.push({f: jugador.fila, c: jugador.col});

  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  while (q.length){
    const {f,c} = q.shift();
    for (const [df,dc] of dirs){
      const nf = f+df, nc = c+dc;
      if (!dentro(nf,nc)) continue;
      const terr = tilemap[nf][nc];
      if (!passable(terr)) continue;
      // no puedes entrar en una casilla ocupada por enemigo
      const ocupado = enemies.some(e=>e.vivo && e.fila===nf && e.col===nc);
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
      if ((f!==jugador.fila || c!==jugador.col) && coste[f][c] <= rangoJugador){
        celdasMovibles.add(key(f,c));
      }
    }
  }
}

function enemigosAdyacentes(pj){
  return enemies.filter(e => e.vivo && adyacentes(pj, e));
}

// --- Clicks y movimiento ---
function manejarClick(f,c){
  // Mostrar ficha
  if (jugador.vivo && f === jugador.fila && c === jugador.col) {
    renderFicha(jugador); ultimoObjetivo = null;
  } else {
    const en = enemies.find(e => e.vivo && e.fila===f && e.col===c);
    if (en){ renderFicha(en); ultimoObjetivo = en; }
  }

  if (turno !== "jugador" || !jugador.vivo) return;

  if (!seleccionado) {
    if (f === jugador.fila && c === jugador.col) {
      seleccionado = true;
      calcularCeldasMovibles();
      dibujarMapa();
    }
    return;
  }
  if (f === jugador.fila && c === jugador.col) {
    seleccionado = false;
    celdasMovibles.clear();
    dibujarMapa();
    acciones.innerHTML = "";
    return;
  }

  const terr = tilemap[f][c];
  const esAlcanzable = celdasMovibles.has(key(f,c));
  const ocupado = enemies.some(e => e.vivo && e.fila===f && e.col===c);
  if (passable(terr) && esAlcanzable && !ocupado){
    jugador.fila = f; jugador.col = c;
    seleccionado = false;
    celdasMovibles.clear();
    dibujarMapa();
    refrescarUIAcciones();
  }
}

// --- IA Enemiga con pathfinding BFS respetando terreno ---
function turnoIAEnemigos(){
  if (turno !== "enemigo") return;
  if (!jugador.vivo) return;

  for (const en of enemies) {
    if (!en.vivo) continue;

    if (adyacentes(en, jugador)) {
      aplicarDanyo(jugador, en.damage);
      continue;
    }

    // Camino más corto (BFS) desde enemigo a jugador por terreno pasable
    const path = shortestPath(en.fila, en.col, jugador.fila, jugador.col, true);
    if (path.length > 1){
      // mueve hasta 'rangoEnemigo' pasos por el path (sin entrar en jugador)
      let pasos = Math.min(rangoEnemigo, path.length-1);
      while (pasos > 0){
        const next = path[path.length - 1 - pasos + 1]; // avanzar hacia el final
        // evita chocar con otros enemigos
        const ocupado = enemies.some(o => o!==en && o.vivo && o.fila===next.f && o.col===next.c);
        if (ocupado) break;
        en.fila = next.f; en.col = next.c;
        pasos--;
      }
    }

    if (adyacentes(en, jugador)) {
      aplicarDanyo(jugador, en.damage);
    }
  }

  renderFicha(jugador);
  dibujarMapa();

  if (!jugador.vivo) {
    acciones.innerHTML = "<div id='mensaje' style='color:#842029'>¡Has sido derrotado!</div>";
    setTurno("fin");
  } else {
    setTurno("jugador");
    acciones.innerHTML = "";
  }
}

// BFS para camino más corto (sin costes extra; ya respetamos impasables).
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

  // reconstruir
  const path = [];
  let cur = {f:tf,c:tc};
  if (!prev[tf][tc]) return []; // sin camino
  while (cur){
    path.push(cur);
    cur = prev[cur.f][cur.c];
  }
  return path.reverse(); // desde origen a destino
}

// --- Combate ---
function enemigosAdyacentes(pj){
  return enemies.filter(e => e.vivo && adyacentes(pj, e));
}
function atacarJugadorA(objetivo){
  aplicarDanyo(objetivo, jugador.damage);
  renderFicha(objetivo);
  if (!objetivo.vivo){
    jugador.kills += 1;
    if (enemies.every(e => !e.vivo)) {
      wave += 1;
      flashEstado(`¡Oleada superada! Preparando oleada ${wave}...`);
      saveProgress();
      setTimeout(()=>{
        spawnWave();
        dibujarMapa();
        setTurno("jugador");
        acciones.innerHTML = "";
        updateEstado();
      }, 500);
      return;
    }
    const subio = comprobarSubidaNivel(jugador);
    dibujarMapa();
    if (subio) { setTurno("jugador"); acciones.innerHTML = ""; return; }
  }
  seleccionado = false;
  celdasMovibles.clear();
  dibujarMapa();
  acciones.innerHTML = "";
  setTurno("enemigo");
  setTimeout(turnoIAEnemigos, 350);
}

// --- Inicio ---
function init(){
  ajustarTamanoTablero();
  const had = loadProgress();
  if (!had) saveProgress();
  spawnWave();
  dibujarMapa();
  setTurno("jugador");
  updateEstado();
  renderFicha(null);

  document.getElementById("btnGuardar").onclick = saveProgress;
  document.getElementById("btnReset").onclick = resetProgress;
}
init();