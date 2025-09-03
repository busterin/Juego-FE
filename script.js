// --- Parámetros de juego ---
const filas = 8, columnas = 8;
const rangoJugador = 3;
const rangoEnemigo = 2;

const ENEMY_BASE_DAMAGE = 50; // daño básico enemigo
const STORAGE_KEY = "mini-tactico-progress-v1";

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
  damage: 50 // empieza en 50; +10 por nivel cada 3 kills
};

let seleccionado = false;           // ¿el jugador está seleccionado?
let celdasMovibles = new Set();     // "f,c" posiciones alcanzables
let ultimoObjetivo = null;          // enemigo clicado/inspeccionado recientemente

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
      hp: jugador.hp,
      maxHp: jugador.maxHp,
      nivel: jugador.nivel,
      kills: jugador.kills,
      damage: jugador.damage
    }
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  flashEstado("Progreso guardado.");
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    const data = JSON.parse(raw);
    wave = data.wave ?? 1;
    jugador.maxHp = data.jugador?.maxHp ?? 100;
    jugador.hp    = Math.min(jugador.maxHp, data.jugador?.hp ?? jugador.maxHp);
    jugador.nivel = data.jugador?.nivel ?? 1;
    jugador.kills = data.jugador?.kills ?? 0;
    jugador.damage = data.jugador?.damage ?? 50;
    return true;
  } catch { return false; }
}

function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  // Estado base
  wave = 1;
  jugador = { 
    fila: 4, col: 2, vivo: true,
    nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.png",
    nivel: 1,
    kills: 0,
    damage: 50
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
  setTimeout(()=>{ // volver a estado "limpio"
    estado.textContent = `Oleada ${wave} · Nivel ${jugador.nivel} · Daño ${jugador.damage} · HP ${jugador.hp}/${jugador.maxHp} · Enemigos ${enemies.filter(e=>e.vivo).length}`;
  }, 1600);
}

function updateEstado(){
  estado.textContent = `Oleada ${wave} · Nivel ${jugador.nivel} · Daño ${jugador.damage} · HP ${jugador.hp}/${jugador.maxHp} · Enemigos ${enemies.filter(e=>e.vivo).length}`;
}

// --- NUEVO: Ajuste responsivo del tamaño de las celdas ---
function ajustarTamanoTablero() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const margenHorizontal = 24; // px
  const margenVertical   = 240; // px (título + panel + toolbar)
  const disponibleAncho = vw - margenHorizontal;
  const disponibleAlto  = vh - margenVertical;

  const ladoTablero = Math.max(240, Math.min(disponibleAncho, disponibleAlto));
  const gap = 3;
  const celdas = 8;

  const cellPx = Math.floor((ladoTablero - (celdas - 1) * gap) / celdas);
  const cellClamped = Math.min(cellPx, 96);

  document.documentElement.style.setProperty('--cell', `${cellClamped}px`);
}
window.addEventListener('resize', ajustarTamanoTablero);
window.addEventListener('orientationchange', ajustarTamanoTablero);

// --- Utilidades ---
const key = (f,c) => `${f},${c}`;
const dentro = (f,c) => f>=0 && f<filas && c>=0 && c<columnas;
const distManhattan = (a,b) => Math.abs(a.fila-b.fila)+Math.abs(a.col-b.col);
const adyacentes = (a,b) =>
  (Math.abs(a.fila - b.fila) === 1 && a.col === b.col) ||
  (Math.abs(a.col - b.col) === 1 && a.fila === b.fila);

function setTurno(t){
  turno = t;
  turnoLabel.textContent = (t === "jugador") ? "TU TURNO" :
                           (t === "enemigo") ? "TURNO ENEMIGO" :
                           "FIN DE PARTIDA";
}

// --- Spawner de oleadas ---
function spawnWave(){
  enemies = [];
  const count = Math.min(2 + wave, 6); // 1:3 enemigos, 2:4, ... máx 6
  const ocupadas = new Set([key(jugador.fila, jugador.col)]);

  function randomPos(){
    // evita primera columna para que no aparezcan encima de ti
    const f = Math.floor(Math.random() * filas);
    const c = Math.floor(Math.random() * columnas);
    return {f,c};
  }

  for (let i=0; i<count; i++){
    let pos;
    do {
      pos = randomPos();
    } while (ocupadas.has(key(pos.f, pos.c)) || (pos.f===jugador.fila && pos.c===jugador.col));
    ocupadas.add(key(pos.f, pos.c));

    enemies.push({
      id: `E${Date.now()}-${i}`,
      nombre: `Bandido ${i+1}`,
      fila: pos.f, col: pos.c, vivo: true,
      hp: 100, maxHp: 100,
      retrato: "assets/enemy.png",
      damage: ENEMY_BASE_DAMAGE
    });
  }
  updateEstado();
}

// --- Render ---
function dibujarMapa() {
  mapa.innerHTML = "";
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = document.createElement("div");
      celda.className = "celda";
      celda.dataset.fila = f;
      celda.dataset.col = c;

      if (seleccionado && celdasMovibles.has(key(f,c))) celda.classList.add("movible");
      if (seleccionado && jugador.fila===f && jugador.col===c) celda.classList.add("seleccionada");

      // Mini del jugador
      if (jugador.vivo && jugador.fila === f && jugador.col === c) {
        const pj = document.createElement("div");
        pj.className = "fichaMini jugador";
        celda.appendChild(pj);
      }
      // Minis de enemigos
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

function refrescarUIAcciones() {
  acciones.innerHTML = "";
  if (turno !== "jugador" || !jugador.vivo) return;

  const adj = enemigosAdyacentes(jugador);
  if (adj.length > 0) {
    // Si hay varios, ofrecer un botón por enemigo
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

// --- Subida de nivel (cada 3 kills) ---
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

// --- Lógica de selección/movimiento + clicks (ficha) ---
function manejarClick(f,c){
  // Mostrar ficha al clickar una unidad
  if (jugador.vivo && f === jugador.fila && c === jugador.col) {
    renderFicha(jugador);
    ultimoObjetivo = null;
  } else {
    const en = enemies.find(e => e.vivo && e.fila===f && e.col===c);
    if (en){
      renderFicha(en);
      ultimoObjetivo = en;
    }
  }

  if (turno !== "jugador" || !jugador.vivo) return;

  // Selección inicial
  if (!seleccionado) {
    if (f === jugador.fila && c === jugador.col) {
      seleccionado = true;
      calcularCeldasMovibles();
      dibujarMapa();
    }
    return;
  }

  // Deseleccionar
  if (f === jugador.fila && c === jugador.col) {
    seleccionado = false;
    celdasMovibles.clear();
    dibujarMapa();
    acciones.innerHTML = "";
    return;
  }

  // Mover si es válido y libre
  const ocupadaPorEnemigo = enemies.some(e => e.vivo && e.fila===f && e.col===c);
  if (celdasMovibles.has(key(f,c)) && !ocupadaPorEnemigo) {
    jugador.fila = f;
    jugador.col = c;
    seleccionado = false;
    celdasMovibles.clear();
    dibujarMapa();
    refrescarUIAcciones();
  }
}

function calcularCeldasMovibles(){
  celdasMovibles.clear();
  for (let f=0; f<filas; f++){
    for (let c=0; c<columnas; c++){
      const d = Math.abs(f - jugador.fila) + Math.abs(c - jugador.col);
      const ocupado = enemies.some(e=>e.vivo && e.fila===f && e.col===c);
      if (d>0 && d<=rangoJugador && !ocupado) celdasMovibles.add(key(f,c));
    }
  }
}

function enemigosAdyacentes(pj){
  return enemies.filter(e => e.vivo && adyacentes(pj, e));
}

// --- Combate ---
function atacarJugadorA(objetivo){
  aplicarDanyo(objetivo, jugador.damage);
  renderFicha(objetivo);
  if (!objetivo.vivo){
    jugador.kills += 1;
    // ¿fin de oleada?
    if (enemies.every(e => !e.vivo)) {
      wave += 1;
      flashEstado(`¡Oleada superada! Preparando oleada ${wave}...`);
      saveProgress(); // guarda wave y stats
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
    if (subio) {
      setTurno("jugador"); // te quedas el turno para ver el mensaje
      acciones.innerHTML = "";
      return;
    }
  }
  // Enemigo sobrevive → turno IA
  seleccionado = false;
  celdasMovibles.clear();
  dibujarMapa();
  acciones.innerHTML = "";
  setTurno("enemigo");
  setTimeout(turnoIAEnemigos, 350);
}

// --- IA Enemiga (todos los enemigos actúan) ---
function turnoIAEnemigos(){
  if (turno !== "enemigo") return;
  if (!jugador.vivo) return;

  // Cada enemigo mueve/ataca
  for (const en of enemies) {
    if (!en.vivo) continue;

    // Si ya está adyacente, ataca
    if (adyacentes(en, jugador)) {
      aplicarDanyo(jugador, en.damage);
      continue;
    }
    // Mover hasta 'rangoEnemigo' pasos hacia el jugador
    for (let paso=0; paso<rangoEnemigo; paso++){
      const siguiente = pasoHacia(en, jugador);
      if (!siguiente) break;
      if (siguiente.fila === jugador.fila && siguiente.col === jugador.col) break;
      // Evitar ocupar a otro enemigo
      const ocupado = enemies.some(o => o!==en && o.vivo && o.fila===siguiente.fila && o.col===siguiente.col);
      if (ocupado) break;
      en.fila = siguiente.fila;
      en.col = siguiente.col;
      if (adyacentes(en, jugador)) break;
    }
    // Si tras mover queda adyacente, ataca
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

function pasoHacia(origen, objetivo){
  const opciones = [
    { fila: origen.fila + Math.sign(objetivo.fila - origen.fila), col: origen.col },
    { fila: origen.fila, col: origen.col + Math.sign(objetivo.col - origen.col) }
  ];
  for (const p of opciones){
    if (!dentro(p.fila, p.col)) continue;
    if (p.fila === jugador.fila && p.col === jugador.col) continue;
    // Evita moverse donde ya hay enemigo
    const ocupado = enemies.some(e => e.vivo && e.fila===p.fila && e.col===p.col);
    if (ocupado) continue;
    if (distManhattan(p, objetivo) < distManhattan(origen, objetivo)) return p;
  }
  // alternativas (si no acercan, toma la primera libre)
  const alternativas = [
    { fila: origen.fila - Math.sign(objetivo.fila - origen.fila), col: origen.col },
    { fila: origen.fila, col: origen.col - Math.sign(objetivo.col - origen.col) }
  ];
  for (const p of alternativas){
    if (!dentro(p.fila, p.col)) continue;
    const ocupado = enemies.some(e => e.vivo && e.fila===p.fila && e.col===p.col);
    if (ocupado) continue;
    if (p.fila === jugador.fila && p.col === jugador.col) continue;
    return p;
  }
  return null;
}

// --- Inicio ---
function init(){
  ajustarTamanoTablero();
  const had = loadProgress();
  if (!had) saveProgress(); // crea estado inicial
  spawnWave();
  dibujarMapa();
  setTurno("jugador");
  updateEstado();
  renderFicha(null);

  document.getElementById("btnGuardar").onclick = saveProgress;
  document.getElementById("btnReset").onclick = resetProgress;
}
init();