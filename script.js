// --- Parámetros de juego ---
const filas = 8, columnas = 8;
const rangoJugador = 3;
const rangoEnemigo = 2;

// Estado
let turno = "jugador"; // 'jugador' | 'enemigo' | 'fin'
let jugador = { fila: 4, col: 2, vivo: true };
let enemigo = { fila: 4, col: 5, vivo: true };

let seleccionado = false; // ¿el jugador está seleccionado?
let celdasMovibles = new Set(); // "f,c" de posiciones alcanzables

const mapa = document.getElementById("mapa");
const acciones = document.getElementById("acciones");
const turnoLabel = document.getElementById("turno");

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
      celda.dataset.pos = `${f},${c}`;

      if (seleccionado && celdasMovibles.has(key(f,c))) {
        celda.classList.add("movible");
      }
      if (seleccionado && jugador.fila===f && jugador.col===c){
        celda.classList.add("seleccionada");
      }

      if (jugador.vivo && jugador.fila === f && jugador.col === c) {
        const pj = document.createElement("div");
        pj.className = "ficha jugador";
        celda.appendChild(pj);
      }
      if (enemigo.vivo && enemigo.fila === f && enemigo.col === c) {
        const en = document.createElement("div");
        en.className = "ficha enemigo";
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
    bAtacar.textContent = "ATACAR";
    bAtacar.onclick = () => {
      enemigo.vivo = false;
      acciones.innerHTML = "<div id='mensaje'>¡Has vencido al enemigo!</div>";
      setTurno("fin");
      dibujarMapa();
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

// --- Lógica de selección/movimiento ---
function manejarClick(f,c){
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
  if (!enemigo.vivo || turno !== "enemigo") { return; }

  if (adyacentes(enemigo, jugador)) {
    atacarEnemigo();
    return;
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
  jugador.vivo = false;
  dibujarMapa();
  acciones.innerHTML = "<div id='mensaje' style='color:#842029'>¡Has sido derrotado!</div>";
  setTurno("fin");
}

// --- Inicio ---
dibujarMapa();
setTurno("jugador");
