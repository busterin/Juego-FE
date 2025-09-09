/* build: dialogue-2chars-fixed */
(function(){
  // --- Dimensiones del tablero 9:16 ---
  const ROWS = 16, COLS = 9;
  const NON_PLAYABLE_BOTTOM_ROWS = 4;

  // Parámetros
  const PLAYER_MAX_MP = 5;
  const ENEMY_MAX_MP  = 3;
  const ENEMY_BASE_DAMAGE = 50;

  // Estado
  let turno = "jugador";
  let fase = 1;
  let enemies = [];
  let players = [];
  let seleccionado = null;
  let celdasMovibles = new Set();
  let distSel = null;

  // Refs celdas (grid construido una vez)
  const celdaRefs = Array.from({length: ROWS}, () => Array(COLS).fill(null));

  // ---------- Diálogos intro ----------
  const dialogLines = [
    { who:'knight', name:'Caballero', text:'Os doy la bienvenida a Tactic Heroes. Nuestro objetivo es derrotar al ejército rival.' },
    { who:'archer', name:'Arquera',   text:'Seleccionar un personaje para ver su rango de movimiento y después elegir dónde colocarlo.' },
    { who:'knight', name:'Caballero', text:'El caballero ataca si está adyacente al enemigo y la arquera a una casilla de distancia.' },
    { who:'archer', name:'Arquera',   text:'Todo listo. ¡Entremos en combate!' }
  ];
  let dlgIndex = 0, typing=false, typeTimer=null, speakPopTimer=null;

  // Unidades del jugador
  const makeKnight = () => ({
    id: "K", tipo: "caballero",
    fila: Math.floor(ROWS*0.6), col: Math.floor(COLS*0.25),
    vivo: true, nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.png", nivel: 1, kills: 0,
    damage: 50, range: [1], acted: false, mp: PLAYER_MAX_MP
  });
  const makeArcher = () => ({
    id: "A", tipo: "arquera",
    fila: Math.floor(ROWS*0.65), col: Math.floor(COLS*0.25),
    vivo: true, nombre: "Arquera",
    hp: 80, maxHp: 80,
    retrato: "assets/archer.png", nivel: 1, kills: 0,
    damage: 50, range: [2], acted: false, mp: PLAYER_MAX_MP
  });

  // DOM
  const mapa = document.getElementById("mapa");
  const acciones = document.getElementById("acciones");
  const ficha = document.getElementById("ficha");
  const overlayWin = document.getElementById("overlayWin");
  const btnContinuar = document.getElementById("btnContinuar");
  const turnBanner = document.getElementById("turnBanner");

  // Portada + diálogo
  const portada = document.getElementById("portada");
  const btnJugar = document.getElementById("btnJugar");
  const dialog = document.getElementById("dialogScene");
  const dialogNameEl = document.getElementById("dialogName");
  const dialogTextEl = document.getElementById("dialogText");
  const btnDialogNext = document.getElementById("btnDialogNext");
  const charKnight = document.getElementById("charKnight");
  const charArcher = document.getElementById("charArcher");

  // ---------- Banner turno ----------
  function showTurnBanner(text){
    turnBanner.textContent = text;
    turnBanner.style.display = "block";
    setTimeout(()=>{ turnBanner.style.display = "none"; }, 1300);
  }
  function setTurno(t){
    turno = t;
    showTurnBanner(t==="jugador" ? "TU TURNO" : t==="enemigo" ? "TURNO ENEMIGO" : "FIN DE PARTIDA");
  }

  // ---------- Layout ----------
  function getUsableViewport(){
    const w = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    const h = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0);
    return { w, h };
  }
  function ajustarTamanoTablero(){
    const { w:vw, h:vh } = getUsableViewport();
    const pad = 12;
    const cell = Math.max(28, Math.floor(Math.min((vw - pad)/COLS, (vh - pad)/ROWS)));
    document.documentElement.style.setProperty('--cell', `${cell}px`);
    document.documentElement.style.setProperty('--cols', COLS);
    document.documentElement.style.setProperty('--rows', ROWS);
    document.documentElement.style.setProperty('--npRows', NON_PLAYABLE_BOTTOM_ROWS);
    mapa.style.width  = `${cell * COLS}px`;
    mapa.style.height = `${cell * ROWS}px`;
  }
  window.addEventListener('resize', ajustarTamanoTablero);
  window.addEventListener('orientationchange', ajustarTamanoTablero);
  new ResizeObserver(()=>ajustarTamanoTablero()).observe(document.body);

  // ---------- Bloqueo vertical (ajustado para portada) ----------
  function isLandscape(){ return window.innerWidth > window.innerHeight; }

  function applyOrientationLock(){
    const blocker = document.getElementById("orientationBlocker");
    const enHorizontal = isLandscape();
    const portadaVisible = portada && getComputedStyle(portada).display !== "none";

    // Solo bloquear si estamos en horizontal y NO está la portada
    const shouldBlock = enHorizontal && !portadaVisible;
    blocker.style.display = shouldBlock ? "grid" : "none";

    // La portada siempre debe ser clicable
    if (portada){
      portada.style.pointerEvents = "auto";
      portada.style.filter = "none";
    }

    // Desactiva interacción solo en diálogo y mapa cuando corresponda
    const dim = (el)=>{ 
      if(!el) return; 
      el.style.pointerEvents = shouldBlock ? "none" : "auto"; 
      el.style.filter = shouldBlock ? "grayscale(1) blur(1.5px) brightness(.7)" : "none"; 
    };
    dim(dialog);
    dim(mapa);
  }

  function setupOrientationLock(){
    applyOrientationLock();
    window.addEventListener("resize", applyOrientationLock);
    window.addEventListener("orientationchange", ()=> setTimeout(applyOrientationLock,100));
  }

  // ---------- Utils ----------
  const key = (f,c) => `${f},${c}`;
  const dentro = (f,c) => f>=0 && f<ROWS && c>=0 && c<COLS;
  const noJugable = (f) => f >= ROWS - NON_PLAYABLE_BOTTOM_ROWS;
  const manhattan = (a,b) => Math.abs(a.fila-b.fila)+Math.abs(a.col-b.col);
  const enLineaRecta = (a,b) => (a.fila===b.fila) || (a.col===b.col);
  function getCelda(f,c){ return celdaRefs[f]?.[c] || null; }

  // ---------- Oleadas ----------
  function spawnFase(){
    enemies = [];
    const count = (fase === 1) ? 3 : (fase === 2) ? 4 : 0;
    if (count === 0) return;
    const ocupadas = new Set(players.filter(p=>p.vivo).map(p=>key(p.fila,p.col)));
    for (let i=0; i<count; i++){
      let f,c;
      do {
        f = Math.floor(Math.random()*(ROWS - NON_PLAYABLE_BOTTOM_ROWS));
        c = Math.floor(Math.random()*COLS);
      } while (ocupadas.has(key(f,c)));
      ocupadas.add(key(f,c));
      enemies.push({
        id:`E${Date.now()}-${i}`,
        nombre:`Bandido ${i+1 + (fase===2?3:0)}`,
        fila:f, col:c, vivo:true,
        hp:50, maxHp:50,
        retrato:"assets/enemy.png",
        damage:ENEMY_BASE_DAMAGE,
        mp: ENEMY_MAX_MP
      });
    }
    if (turno==="jugador") players.forEach(p=>{ p.acted=false; p.mp=PLAYER_MAX_MP; });
  }

  // ---------- Render ----------
  function dibujarMapa(){
    for (let f=0; f<ROWS; f++){
      for (let c=0; c<COLS; c++){
        const celda = getCelda(f,c);
        if (!celda) continue;

        celda.style.pointerEvents = noJugable(f) ? "none" : "auto";
        celda.classList.toggle("movible", !!(seleccionado && celdasMovibles.has(key(f,c))));
        celda.classList.toggle("seleccionada", !!(seleccionado && seleccionado.fila===f && seleccionado.col===c));
        celda.querySelectorAll(".fichaMiniImg").forEach(n=>n.remove());

        for (const p of players){
          if (p.vivo && p.fila===f && p.col===c){
            const img = document.createElement("img");
            img.src = (p.tipo==="caballero") ? "assets/player.png" : "assets/archer.png";
            img.alt = p.nombre;
            img.className = "fichaMiniImg";
            celda.appendChild(img);
          }
        }
        for (const e of enemies){
          if (e.vivo && e.fila===f && e.col===c){
            const img = document.createElement("img");
            img.src = "assets/enemy.png";
            img.alt = e.nombre;
            img.className = "fichaMiniImg";
            celda.appendChild(img);
          }
        }
      }
    }
  }

  // … (el resto del código es igual que el que ya te pasé, sin cambios en combate, IA o diálogos)

  // ---------- Construcción de grid (una vez) ----------
  function construirGrid(){
    mapa.innerHTML = "";
    for (let f=0; f<ROWS; f++){
      for (let c=0; c<COLS; c++){
        const celda = document.createElement("div");
        celda.className = "celda";
        celda.dataset.key = key(f,c);
        celdaRefs[f][c] = celda;
        celda.addEventListener("click", ()=>manejarClick(f,c));
        mapa.appendChild(celda);
      }
    }
  }

  // ---------- Init ----------
  function init(){
    players=[makeKnight(),makeArcher()];
    ajustarTamanoTablero();
    construirGrid();
    spawnFase();
    dibujarMapa();

    if (btnContinuar) btnContinuar.onclick=()=>{ overlayWin.style.display="none"; location.reload(); };

    if (btnJugar){
      btnJugar.onclick = ()=>{
        if (portada) portada.style.display = "none";
        if (dialog){
          dlgIndex = 0;
          dialog.style.display = "block";
          showCurrentDialog();
        } else {
          mapa.style.display = "grid";
          setTurno("jugador");
        }
        applyOrientationLock();
      };
    } else {
      mapa.style.display = "grid";
      setTurno("jugador");
    }

    if (btnDialogNext) {
      let dialogCooldown = false;
      btnDialogNext.onclick = () => {
        if (dialogCooldown) return;
        dialogCooldown = true;
        setTimeout(()=> dialogCooldown=false, 180);
        advanceDialog();
      };
    }

    setupOrientationLock();
  }
  init();
})();
