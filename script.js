/* build: mp5 */
(function(){
  // --- Parámetros del tablero ---
  const filas = 8, columnas = 8;
  const PLAYER_MAX_MP = 5;   // 👈 movimiento por turno (casillas)
  const ENEMY_MAX_MP  = 5;
  const ENEMY_BASE_DAMAGE = 50;

  // --- Estado ---
  let turno = "jugador";  // 'jugador' | 'enemigo' | 'fin'
  let fase = 1;           // 1: 3 enemigos, 2: 4 enemigos, 3: completado
  let enemies = [];
  let seleccionado = null;
  let celdasMovibles = new Set();
  let distSel = null;     // matriz de distancias de la unidad seleccionada

  // --- Unidades del jugador ---
  const makeKnight = () => ({
    id: "K",
    tipo: "caballero",
    fila: 4, col: 2, vivo: true,
    nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.png",
    nivel: 1, kills: 0,
    damage: 50,
    range: [1],
    acted: false,
    mp: PLAYER_MAX_MP
  });

  const makeArcher = () => ({
    id: "A",
    tipo: "arquera",
    fila: 5, col: 2, vivo: true,
    nombre: "Arquera",
    hp: 80, maxHp: 80,
    retrato: "assets/archer.png",
    nivel: 1, kills: 0,
    damage: 50,
    range: [2],       // solo a 2 exactas
    acted: false,
    mp: PLAYER_MAX_MP
  });

  let players = [ makeKnight(), makeArcher() ];

  // --- DOM ---
  const mapa = document.getElementById("mapa");
  const acciones = document.getElementById("acciones");
  const turnoLabel = document.getElementById("turno");
  const ficha = document.getElementById("ficha");
  const btnFinTurno = document.getElementById("btnFinTurno");
  const overlayWin = document.getElementById("overlayWin");
  const btnContinuar = document.getElementById("btnContinuar");

  // --- Tamaño: tablero ocupa lo máximo posible manteniendo cuadrado ---
  function ajustarTamanoTablero(){
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const uiH = document.getElementById('ui')?.getBoundingClientRect().height || 0;
    const panelH = document.getElementById('panel')?.getBoundingClientRect().height || 0;

    const disponibleAlto  = Math.max(220, vh - uiH - panelH - 12);
    const disponibleAncho = vw - 12;

    const lado = Math.floor(Math.min(disponibleAncho, disponibleAlto) / 8) * 8;
    const cell = Math.max(40, Math.floor(lado / 8)); // mínimo 40px
    document.documentElement.style.setProperty('--cell', `${cell}px`);
    mapa.style.width  = `${cell * 8}px`;
    mapa.style.height = `${cell * 8}px`;

    // Panel encaja exactamente al tablero (por si redimensiona)
    document.getElementById("panel").style.width = `${cell * 8}px`;
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

  // --- Spawns por fase ---
  function spawnFase(){
    enemies = [];
    const count = (fase === 1) ? 3 : (fase === 2) ? 4 : 0;
    if (count === 0) return;
    const ocupadas = new Set(players.filter(p=>p.vivo).map(p=>key(p.fila,p.col)));
    for (let i=0; i<count; i++){
      let f,c;
      do { f = Math.floor(Math.random()*filas); c = Math.floor(Math.random()*columnas); }
      while (ocupadas.has(key(f,c)));
      ocupadas.add(key(f,c));
      enemies.push({
        id:`E${Date.now()}-${i}`,
        nombre:`Bandido ${i+1}`,
        fila:f, col:c, vivo:true,
        hp:50, maxHp:50,
        retrato:"assets/enemy.png",
        damage:ENEMY_BASE_DAMAGE,
        mp: ENEMY_MAX_MP
      });
    }
    // Resetea MPs de jugadores al inicio de tu turno (para la nueva fase)
    if (turno==="jugador") players.forEach(p=>{ p.acted=false; p.mp=PLAYER_MAX_MP; });
  }

  // --- Render del tablero ---
  function dibujarMapa(){
    mapa.innerHTML = "";
    for (let f=0; f<8; f++){
      for (let c=0; c<8; c++){
        const celda = document.createElement("div");
        celda.className = "celda";
        if (seleccionado && celdasMovibles.has(key(f,c))) celda.classList.add("movible");
        if (seleccionado && seleccionado.fila===f && seleccionado.col===c) celda.classList.add("seleccionada");

        // Jugadores
        players.forEach(p=>{
          if (p.vivo && p.fila===f && p.col===c){
            const img = document.createElement("img");
            img.src = (p.tipo==="caballero") ? "assets/player.png" : "assets/archer.png";
            img.alt = p.nombre;
            img.className = "fichaMiniImg";
            celda.appendChild(img);
          }
        });
        // Enemigos
        enemies.forEach(e=>{
          if (e.vivo && e.fila===f && e.col===c){
            const img = document.createElement("img");
            img.src = "assets/enemy.png";
            img.alt = e.nombre;
            img.className = "fichaMiniImg";
            celda.appendChild(img);
          }
        });

        celda.addEventListener("click", ()=>manejarClick(f,c));
        mapa.appendChild(celda);
      }
    }
  }

  // --- Acciones y panel ---
  function botonesAccionesPara(unidad){
    acciones.innerHTML="";
    if (turno!=="jugador" || !unidad?.vivo) return;

    const infoMp = document.createElement("div");
    infoMp.textContent = `MP: ${unidad.mp}/${PLAYER_MAX_MP}`;
    infoMp.style.marginRight = "8px";
    infoMp.style.alignSelf = "center";
    acciones.appendChild(infoMp);

    const bEnd=document.createElement("button");
    bEnd.textContent="Terminar acción";
    bEnd.onclick=()=>{ unidad.acted=true; seleccionado=null; celdasMovibles.clear(); distSel=null; dibujarMapa(); acciones.innerHTML=""; comprobarCambioATurnoEnemigo(); };
    acciones.appendChild(bEnd);

    enemigosEnRango(unidad).forEach(en=>{
      const b=document.createElement("button");
      b.className="primary";
      b.textContent=`ATACAR ${en.nombre} (-${unidad.damage})`;
      b.onclick=()=>atacarUnidadA(unidad,en);
      acciones.appendChild(b);
    });
  }

  btnFinTurno.onclick = ()=>{
    if (turno!=="jugador") return;
    players.forEach(p=>{ p.acted=true; p.mp=0; });
    seleccionado=null; celdasMovibles.clear(); distSel=null; acciones.innerHTML="";
    setTurno("enemigo");
    setTimeout(turnoIAEnemigos, 150);
  };

  // --- Ficha ---
  function renderFicha(u){
    if(!u){ ficha.style.display="none"; ficha.innerHTML=""; return; }
    const pct = Math.max(0, Math.min(100, Math.round((u.hp/u.maxHp)*100)));
    const grad = (pct>50)?"linear-gradient(90deg,#2ecc71,#27ae60)":(pct>25)?"linear-gradient(90deg,#f1c40f,#e67e22)":"linear-gradient(90deg,#e74c3c,#c0392b)";
    const esJ = players.includes(u);
    const extra = esJ?`<p class="meta">Nivel <b>${u.nivel}</b> · Daño <b>${u.damage}</b> · KOs <b>${u.kills}</b> · MP <b>${u.mp}</b>/${PLAYER_MAX_MP}${u.acted?" · Acción gastada":""}</p>`:"";
    ficha.innerHTML = `
      <div class="card">
        <div class="portrait" style="background-image:url('${u.retrato}')"></div>
        <div class="info">
          <p class="name">${u.nombre}</p>
          ${extra}
          <div class="hp">
            <div class="bar"><span style="width:${pct}%; background:${grad}"></span></div>
            <div class="value">${u.hp}/${u.maxHp} HP</div>
          </div>
        </div>
      </div>`;
    ficha.style.display="block";
  }

  // --- Rango movimiento (BFS coste 1) con MP restante ---
  function calcularCeldasMovibles(u){
    celdasMovibles.clear();
    distSel = Array.from({length:8},()=>Array(8).fill(Infinity));
    const q=[]; distSel[u.fila][u.col]=0; q.push([u.fila,u.col]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    while(q.length){
      const [f,c]=q.shift();
      for(const [df,dc] of dirs){
        const nf=f+df,nc=c+dc;
        if(!dentro(nf,nc)) continue;
        const ocupado = enemies.some(e=>e.vivo&&e.fila===nf&&e.col===nc) ||
                        players.some(p=>p.vivo&&p!==u&&p.fila===nf&&p.col===nc);
        if(ocupado) continue;
        const nd = distSel[f][c] + 1;
        if(nd<=u.mp && nd<distSel[nf][nc]){ distSel[nf][nc]=nd; q.push([nf,nc]); }
      }
    }
    for(let f=0;f<8;f++) for(let c=0;c<8;c++){
      if(!(f===u.fila && c===u.col) && distSel[f][c]<=u.mp) celdasMovibles.add(key(f,c));
    }
  }

  function enemigosEnRango(u){
    return enemies.filter(e=>{
      if(!e.vivo) return false;
      if(!(u.fila===e.fila || u.col===e.col)) return false; // línea recta
      const d = Math.abs(u.fila-e.fila)+Math.abs(u.col-e.col);
      return u.range.includes(d);
    });
  }

  function manejarClick(f,c){
    const pj = players.find(p=>p.vivo&&p.fila===f&&p.col===c);
    const en = enemies.find(e=>e.vivo&&e.fila===f&&e.col===c);
    if(pj) renderFicha(pj); else if(en) renderFicha(en);

    if (turno!=="jugador") return;

    if (pj){
      if (pj.acted){ seleccionado=null; celdasMovibles.clear(); distSel=null; dibujarMapa(); acciones.innerHTML=""; return; }
      seleccionado=pj; if (seleccionado.mp>0) calcularCeldasMovibles(seleccionado); else { celdasMovibles.clear(); distSel=null; }
      dibujarMapa(); botonesAccionesPara(seleccionado); return;
    }

    if (seleccionado){
      if (f===seleccionado.fila && c===seleccionado.col){
        seleccionado=null; celdasMovibles.clear(); distSel=null; dibujarMapa(); acciones.innerHTML=""; return;
      }
      const objetivo = key(f,c);
      const esAlcanzable = celdasMovibles.has(objetivo);
      const ocupado = enemies.some(e=>e.vivo&&e.fila===f&&e.col===c) ||
                      players.some(p=>p.vivo&&p!==seleccionado&&p.fila===f&&p.col===c);
      if (esAlcanzable && !ocupado){
        const coste = distSel[f][c] || 0;     // casillas consumidas
        seleccionado.fila=f; seleccionado.col=c;
        seleccionado.mp = Math.max(0, seleccionado.mp - coste);
        renderFicha(seleccionado);
        if (seleccionado.mp>0){ calcularCeldasMovibles(seleccionado); }
        else { celdasMovibles.clear(); distSel=null; }
        dibujarMapa(); botonesAccionesPara(seleccionado);
      }
    }
  }

  // --- FX de ataque / daño / muerte ---
  function efectoAtaque(objetivo, cantidad, fuente){
    const idx = objetivo.fila * 8 + objetivo.col;
    const celda = mapa.children[idx]; if(!celda) return;
    const flash = (fuente==='enemy')?'flash-enemy':'flash-player';
    celda.classList.add(flash); setTimeout(()=>celda.classList.remove(flash),280);

    const sprite = celda.querySelector('.fichaMiniImg');
    if (sprite){ sprite.classList.add('blink-hit'); setTimeout(()=>sprite.classList.remove('blink-hit'),600); }

    const dmg=document.createElement('div');
    dmg.className='dmg-float ' + (fuente==='enemy'?'dmg-enemy':'dmg-player');
    dmg.textContent=`-${cantidad}`; celda.appendChild(dmg);
    setTimeout(()=>dmg.remove(),650);
  }
  function efectoMuerte(unidad){
    const idx = unidad.fila * 8 + unidad.col;
    const celda = mapa.children[idx]; if(!celda) return;
    const sprite = celda.querySelector('.fichaMiniImg');
    if (sprite){ sprite.classList.add('death-pop'); setTimeout(()=>{ if(sprite.parentNode) sprite.parentNode.removeChild(sprite); }, 360); }
  }

  function aplicarDanyo(obj,cant,fuente){
    obj.hp=Math.max(0,obj.hp-cant);
    efectoAtaque(obj,cant,fuente);
    if(obj.hp<=0){ obj.vivo=false; efectoMuerte(obj); }
  }

  function atacarUnidadA(u, objetivo){
    aplicarDanyo(objetivo, u.damage, 'player');
    renderFicha(objetivo);
    if(!objetivo.vivo){
      u.kills=(u.kills||0)+1;
      // ¿fase despejada?
      if (enemies.every(e=>!e.vivo)) {
        if (fase === 1){
          fase = 2;
          setTimeout(()=>{ spawnFase(); dibujarMapa(); }, 450);
        } else if (fase === 2){
          fase = 3;
          // NIVEL COMPLETADO
          setTurno("fin");
          setTimeout(()=>{ overlayWin.style.display="grid"; }, 350);
        }
      }
    }
    // tras atacar no puedes mover más (finaliza acción)
    u.acted = true;
    u.mp = 0;
    seleccionado = null;
    celdasMovibles.clear(); distSel=null;
    acciones.innerHTML = "";
    dibujarMapa();
    comprobarCambioATurnoEnemigo();
  }

  function comprobarCambioATurnoEnemigo(){
    if (players.every(p => !p.vivo || p.acted)) {
      setTurno("enemigo");
      setTimeout(turnoIAEnemigos, 150);
    }
  }

  // --- IA Enemiga (5 MP) ---
  function turnoIAEnemigos(){
    if (turno !== "enemigo") return;

    const vivosJ = players.filter(p=>p.vivo);
    if (vivosJ.length === 0) { setTurno("fin"); return; }

    for (const en of enemies) {
      if (!en.vivo) continue;
      en.mp = ENEMY_MAX_MP;

      // objetivo más cercano
      let objetivo = vivosJ[0];
      let mejor = manhattan(en, objetivo);
      for (const p of vivosJ){
        const d = manhattan(en, p);
        if (d < mejor){ mejor = d; objetivo = p; }
      }

      // mover hasta 5 pasos hacia objetivo evitando choques
      const step = (a,b)=> a<b?1:(a>b?-1:0);
      while (en.mp > 0){
        if (manhattan(en, objetivo) === 1) break; // ya listo para pegar
        const candidatos = [];
        if (en.fila !== objetivo.fila) candidatos.push([en.fila + step(en.fila, objetivo.fila), en.col]);
        if (en.col  !== objetivo.col ) candidatos.push([en.fila, en.col + step(en.col,  objetivo.col )]);
        // intenta ambos ejes, prioridad por fila
        let moved = false;
        for (const [nf,nc] of candidatos){
          if (!dentro(nf,nc)) continue;
          const ocupado = enemies.some(o=>o!==en && o.vivo && o.fila===nf && o.col===nc) ||
                          players.some(p=>p.vivo && p.fila===nf && p.col===nc);
          if (!ocupado){ en.fila = nf; en.col = nc; en.mp--; moved = true; break; }
        }
        if (!moved) break; // bloqueado
      }

      // atacar si adyacente
      if (manhattan(en, objetivo) === 1) {
        aplicarDanyo(objetivo, en.damage, 'enemy');
      }
    }

    // fin de turno enemigo → vuelve al jugador
    players.forEach(p=>{ if(p.hp<=0) p.vivo=false; p.acted=false; p.mp = PLAYER_MAX_MP; });
    renderFicha(players.find(p=>p.vivo) || null);
    dibujarMapa();

    if (players.every(p=>!p.vivo)) {
      setTurno("fin");
    } else {
      setTurno("jugador");
      acciones.innerHTML = "";
    }
  }

  // --- Inicio ---
  function init(){
    ajustarTamanoTablero();
    // Fase 1
    spawnFase();
    dibujarMapa();
    setTurno("jugador");
    renderFicha(null);

    document.getElementById("btnGuardar").onclick = ()=>{}; // (stub opcional)
    document.getElementById("btnReset").onclick = ()=>{ location.reload(); };
    btnContinuar.onclick = ()=>{ overlayWin.style.display="none"; location.reload(); };
  }
  init();
})();