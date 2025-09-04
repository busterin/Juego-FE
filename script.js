/* build: dialogue-2chars */
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
    const style = getComputedStyle(document.documentElement);
    const insetTop = parseInt(style.getPropertyValue('env(safe-area-inset-top)')) || 0;
    const insetBottom = parseInt(style.getPropertyValue('env(safe-area-inset-bottom)')) || 0;
    return { w, h: h - insetTop - insetBottom };
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

  // ---------- Bloqueo vertical ----------
  function isLandscape(){ return window.innerWidth > window.innerHeight; }
  function applyOrientationLock(){
    const blocker = document.getElementById("orientationBlocker");
    const enHorizontal = isLandscape();
    blocker.style.display = enHorizontal ? "grid" : "none";
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
  function getCelda(f,c){ return mapa.querySelector(`.celda[data-key="${f},${c}"]`); }

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
    mapa.querySelectorAll(".celda").forEach(n=>n.remove());
    for (let f=0; f<ROWS; f++){
      for (let c=0; c<COLS; c++){
        const celda = document.createElement("div");
        celda.className = "celda";
        celda.dataset.key = key(f,c);
        if (noJugable(f)) celda.style.pointerEvents = "none";
        if (seleccionado && celdasMovibles.has(key(f,c))) celda.classList.add("movible");
        if (seleccionado && seleccionado.fila===f && seleccionado.col===c) celda.classList.add("seleccionada");

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

        celda.addEventListener("click", ()=>manejarClick(f,c));
        mapa.appendChild(celda);
      }
    }
  }

  // ---------- Acciones / HUD ----------
  function endTurn(){
    players.forEach(p=>{ p.acted=true; p.mp=0; });
    seleccionado=null; celdasMovibles.clear(); distSel=null;
    acciones.innerHTML="";
    setTurno("enemigo");
    setTimeout(turnoIAEnemigos, 140);
  }

  function botonesAccionesPara(unidad){
    acciones.innerHTML="";
    if (turno!=="jugador" || !unidad?.vivo) return;

    const infoMp = document.createElement("div");
    infoMp.textContent = `MP: ${unidad.mp}/${PLAYER_MAX_MP}`;
    acciones.appendChild(infoMp);

    enemigosEnRango(unidad).forEach(en=>{
      const b=document.createElement("button");
      b.className="primary";
      b.textContent=`ATACAR ${en.nombre}`;
      b.onclick=()=>atacarUnidadA(unidad,en);
      acciones.appendChild(b);
    });

    const bTurn=document.createElement("button");
    bTurn.textContent="Pasar turno";
    bTurn.onclick=endTurn;
    acciones.appendChild(bTurn);
  }

  // ---------- Ficha ----------
  function renderFicha(u){
    if(!u){ ficha.style.display="none"; ficha.innerHTML=""; return; }
    const pct = Math.max(0, Math.min(100, Math.round((u.hp/u.maxHp)*100)));
    ficha.innerHTML = `
      <div class="card">
        <div class="portrait" style="background-image:url('${u.retrato}')"></div>
        <div class="info">
          <p class="name">${u.nombre}</p>
          <div class="hp">
            <div class="bar"><span style="width:${pct}%"></span></div>
            <div class="value">${u.hp}/${u.maxHp} HP</div>
          </div>
        </div>
      </div>`;
    ficha.style.display="block";
  }

  // ---------- Movimiento ----------
  function calcularCeldasMovibles(u){
    celdasMovibles.clear();
    distSel = Array.from({length:ROWS},()=>Array(COLS).fill(Infinity));
    const q=[]; distSel[u.fila][u.col]=0; q.push([u.fila,u.col]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    while(q.length){
      const [f,c]=q.shift();
      for(const [df,dc] of dirs){
        const nf=f+df,nc=c+dc;
        if(!dentro(nf,nc) || noJugable(nf)) continue;
        const ocupado = enemies.some(e=>e.vivo&&e.fila===nf&&e.col===nc) ||
                        players.some(p=>p.vivo&&p!==u&&p.fila===nf&&p.col===nc);
        if(ocupado) continue;
        const nd = distSel[f][c] + 1;
        if(nd<=u.mp && nd<distSel[nf][nc]){ distSel[nf][nc]=nd; q.push([nf,nc]); }
      }
    }
    for(let f=0;f<ROWS-NON_PLAYABLE_BOTTOM_ROWS;f++) for(let c=0;c<COLS;c++){
      if(!(f===u.fila && c===u.col) && distSel[f][c]<=u.mp) celdasMovibles.add(`${f},${c}`);
    }
  }

  function enemigosEnRango(u){
    return enemies.filter(e=>{
      if(!e.vivo) return false;
      if(!enLineaRecta(u,e)) return false;
      const d = Math.abs(u.fila-e.fila)+Math.abs(u.col-e.col);
      return u.range.includes(d);
    });
  }

  function manejarClick(f,c){
    if (noJugable(f)) return;

    const pj = players.find(p=>p.vivo&&p.fila===f&&p.col===c);
    const en = enemies.find(e=>e.vivo&&e.fila===f&&e.col===c);
    if(pj) renderFicha(pj); else if(en) renderFicha(en);

    if (turno!=="jugador") return;

    if (pj){
      if (pj.acted){ seleccionado=null; celdasMovibles.clear(); distSel=null; dibujarMapa(); acciones.innerHTML=""; return; }
      seleccionado=pj; calcularCeldasMovibles(seleccionado);
      dibujarMapa(); botonesAccionesPara(seleccionado); return;
    }

    if (seleccionado){
      if (celdasMovibles.has(`${f},${c}`)){
        seleccionado.fila=f; seleccionado.col=c; seleccionado.mp=0;
        dibujarMapa(); botonesAccionesPara(seleccionado);
      }
    }
  }

  // ---------- FX ----------
  function aplicarDanyo(obj,cant,fuente){
    obj.hp=Math.max(0,obj.hp-cant);
    if(obj.hp<=0) obj.vivo=false;
    dibujarMapa(); renderFicha(obj);
  }

  // ---------- Combate ----------
  function atacarUnidadA(u,en){
    aplicarDanyo(en,u.damage,'player');
    u.acted=true; u.mp=0;
    seleccionado=null; celdasMovibles.clear(); dibujarMapa(); acciones.innerHTML="";
    if(enemies.every(e=>!e.vivo)){
      if(fase===1){ fase=2; spawnFase(); dibujarMapa();}
      else if(fase===2){ fase=3; overlayWin.style.display="grid";}
    }
  }

  // ---------- IA Enemiga ----------
  function turnoIAEnemigos(){
    enemies.forEach(e=>{
      if(!e.vivo) return;
      const objetivo = players.find(p=>p.vivo);
      if(!objetivo) return;
      if(manhattan(e,objetivo)===1){
        aplicarDanyo(objetivo,e.damage,'enemy');
      }
    });
    players.forEach(p=>{p.acted=false; p.mp=PLAYER_MAX_MP;});
    dibujarMapa(); setTurno("jugador");
  }

  // ---------- Init ----------
  function init(){
    players=[makeKnight(),makeArcher()];
    ajustarTamanoTablero(); spawnFase(); dibujarMapa();
    btnContinuar.onclick=()=>location.reload();
    setupOrientationLock();
    setTurno("jugador");
  }
  init();
})();