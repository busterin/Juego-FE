// --- Parámetros de juego ---
const filas = 8, columnas = 8;
const rangoJugador = 3;
const rangoEnemigo = 2;

const ENEMY_BASE_DAMAGE = 50; // daño del enemigo (constante)

// Estado
let turno = "jugador"; // 'jugador' | 'enemigo' | 'fin'

// Personaje del jugador con sistema de nivel
let jugador = { 
  fila: 4, col: 2, vivo: true,
  nombre: "Caballero",
  hp: 100, maxHp: 100,
  retrato: "assets/player.png",
  nivel: 1,
  kills: 0,
  damage: 50 // daño actual (sube +10 por nivel)
};

// Enemigo básico
let enemigo = { 
  fila: 4, col: 5, vivo: true,
  nombre: "Bandido",
  hp: 100, maxHp: 100,
  retrato: "assets/enemy.png"
};

let seleccionado = false;            // ¿el jugador está seleccionado?
let celdasMovibles = new Set();      // "f,c" de posiciones alcanzables

const mapa = document.getElementById("mapa");
const acciones = document.getElementById("acciones");
const turnoLabel = document.getElementById("turno");
const ficha = document.getElementById("ficha");

// --- Ajuste responsivo del tamaño de las celdas ---
function ajustarTamanoTablero() {
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

  const margenHorizontal = 24; // px
  const margenVertical   = 220; // px (título + panel)
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

// --- Render ---
function dibujarMapa() {
  mapa.innerHTML = "";
  for (let f = 0; f < filas; f++) {
    for (let c = 0; c < columnas; c++) {
      const celda = document.createElement("div");
      celda.className = "celda";
      celda.dataset.fila = f;
      celda.dataset.col = c;

      if (seleccionado && celdasMovibles.has(key(f,c))) {
        celda.classList.add("movible");
      }
      if (seleccionado && jugador.fila===f && jugador.col===c){
        celda.classList.add("seleccionada");
      }

      // Minis
      if (jugador.vivo && jugador.fila === f && jugador.col === c) {
        const pj = document.createElement("div");
        pj.className = "fichaMini jugador";
        celda.appendChild(pj);
      }
      if (enemigo.vivo && enemigo.fila === f && enemigo.col === c) {
        const en = document.createElement("div");
        en.className = "fichaMini enemigo";
        celda.appendChild(en);
      }

      celda.addEventListener("click", () => manejarClick(f,c));
      mapa.appendChild(celda);
    }
  }
}

function refrescarUIAcciones() {
  acciones.innerHTML = "";
  if (turno !== "jugador" || !jugador.vivo) return;

  if (enemigo.vivo && adyacentes(jugador, enemigo)) {
    const bAtacar = document.createElement("button");
    bAtacar.className = "primary";
    bAtacar.textContent = `ATACAR (-${jugador.damage} HP)`;
    bAtacar.onclick = () => {
      // Ataque del jugador con daño que escala por nivel
      aplicarDanyo(enemigo, jugador.damage);
      renderFicha(enemigo); // refresca barra del objetivo

      if (!enemigo.vivo) {
        jugador.kills += 1;
        const subio = comprobarSubidaNivel(jugador); // puede subir nivel (cada 3 kills)
        dibujarMapa();
        if (subio) {
          acciones.innerHTML = `<div id='mensaje'>¡${jugador.nombre} sube a <b>nivel ${jugador.nivel}</b>! (+10 HP máx, +10 daño)</div>`;
          setTurno("jugador"); // te dejo el turno para que veas el mensaje
        } else {
          acciones.innerHTML = "<div id='mensaje'>¡Has vencido al enemigo!</div>";
          setTurno("fin");
        }
      } else {
        // pasa turno al enemigo
        seleccionado = false;
        celdasMovibles.clear();
        dibujarMapa();
        acciones.innerHTML = "";
        setTurno("enemigo");
        setTimeout(turnoEnemigo, 350);
      }
    };
    acciones.appendChild(bAtacar);
  } else {
    const bPasar = document.createElement("button");
    bPasar.textContent = "PASAR TURNO";
    bPasar.onclick = () => {
      seleccionado = false;
      celdasMovibles.clear();
      dibujarMapa();
      setTurno("enemigo");
      acciones.innerHTML = "";
      setTimeout(turnoEnemigo, 300);
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

  // Si la unidad no tiene nivel/daño (enemigo), mostramos solo HP.
  const extra = (unidad === jugador)
    ? `<p class="meta">Nivel <b>${unidad.nivel}</b> · Daño <b>${unidad.damage}</b></p>`
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
  if (objetivo.hp <= 0) {
    objetivo.vivo = false;
  }
}

// --- Subida de nivel (cada 3 kills) ---
function comprobarSubidaNivel(pj){
  if (pj.kills > 0 && pj.kills % 3 === 0) {
    pj.nivel += 1;
    pj.maxHp += 10;
    pj.hp = Math.min(pj.maxHp, pj.hp + 10); // cura 10 sin pasarse
    pj.damage += 10;
    renderFicha(pj);
    return true;
  }
  return false;
}

// --- Lógica de selección/movimiento + clicks (ficha) ---
function manejarClick(f,c){
  // Mostrar ficha al clickar una unidad
  if (jugador.vivo && f === jugador.fila && c === jugador.col) {
    renderFicha(jugador);
  } else if (enemigo.vivo && f === enemigo.fila && c === enemigo.col) {
    renderFicha(enemigo);
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
  if (celdasMovibles.has(key(f,c)) && !(enemigo.vivo && enemigo.fila===f && enemigo.col===c)) {
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
      if (d>0 && d<=rangoJugador && !(enemigo.vivo && enemigo.fila===f && enemigo.col===c)) {
        celdasMovibles.add(key(f,c));
      }
    }
  }
}

// --- IA Enemiga ---
function turnoEnemigo(){
  if (!enemigo.vivo || turno !== "enemigo") { 
    if (turno !== "fin") { setTurno("jugador"); }
    return; 
  }

  if (adyacentes(enemigo, jugador)) {
    return atacarEnemigo();
  }

  for (let paso=0; paso<rangoEnemigo; paso++){
    const siguiente = pasoHacia(enemigo, jugador);
    if (!siguiente) break;
    if (siguiente.fila === jugador.fila && siguiente.col === jugador.col) break;
    enemigo.fila = siguiente.fila;
    enemigo.col = siguiente.col;
    if (adyacentes(enemigo, jugador)) break;
  }

  dibujarMapa();

  if (adyacentes(enemigo, jugador)) {
    setTimeout(atacarEnemigo, 300);
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
    if (!p) continue;
    if (!dentro(p.fila, p.col)) continue;
    if (p.fila === jugador.fila && p.col === jugador.col) continue;
    if (distManhattan(p, objetivo) < distManhattan(origen, objetivo)) {
      return p;
    }
  }
  const alternativas = [
    { fila: origen.fila - Math.sign(objetivo.fila - origen.fila), col: origen.col },
    { fila: origen.fila, col: origen.col - Math.sign(objetivo.col - origen.col) }
  ];
  for (const p of alternativas){
    if (!dentro(p.fila, p.col)) continue;
    if (p.fila === jugador.fila && p.col === jugador.col) continue;
    return p;
  }
  return null;
}

function atacarEnemigo(){
  aplicarDanyo(jugador, ENEMY_BASE_DAMAGE);
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

// --- Inicio ---
ajustarTamanoTablero();
dibujarMapa();
setTurno("jugador");