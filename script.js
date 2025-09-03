/* grid-bg-only build: bg-1 */
(function(){
  // --- Parámetros del tablero ---
  const filas = 8, columnas = 8;
  const rangoJugador = 3;
  const rangoEnemigo = 2;
  const ENEMY_BASE_DAMAGE = 50;
  const STORAGE_KEY = "tactic-heroes-bg1";

  // --- SIN terrenos (todo pasable y coste 1) ---
  const passable = () => true;

  // (Si quieres mantener un editor de terrenos más tarde, aquí volveríamos a usar un tilemap)

  // --- Estado ---
  let turno = "jugador";
  let wave = 1;
  let enemies = [];

  // --- Unidades del jugador ---
  const makeKnight = () => ({
    tipo: "caballero",
    fila: 4, col: 2, vivo: true,
    nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.png",
    nivel: 1, kills: 0,
    damage: 50,
    range: [1],
    acted: false
  });

  const makeArcher = () => ({
    tipo: "arquera",
    fila: 5, col: 2, vivo: true,
    nombre: "Arquera",
    hp: 80, maxHp: 80,
    retrato: "assets/archer.png",
    nivel: 1, kills: 0,
    damage: 50,         // pediste 50
    range: [2],         // solo a 2 casillas exactas
    acted: false
  });

  let players = [ makeKnight(), makeArcher() ];

  // --- DOM ---
  const mapa = document.getElementById("mapa");
  const acciones = document.getElementById("acciones");
  const turnoLabel = document.getElementById("turno");
  const ficha = document.getElementById("ficha");
  const btnFinTurno = document.getElementById("btnFinTurno");

  // --- Tamaño: el tablero ocupa lo máximo posible manteniendo cuadrado ---
  function ajustarTamanoTablero(){
    const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    const ui = document.getElementById('ui');
    const panel = document.getElementById('panel');
    const uiH = ui?.getBoundingClientRect().height || 0;
    const panelH = panel?.getBoundingClientRect().height || 0;

    const disponibleAlto = Math.max(200, vh - uiH - panelH - 12); // 12px margen
    const disponibleAncho = vw - 12;

    const ladoTablero = Math.min(disponibleAncho, disponibleAlto); // cuadrado máximo
    const cell = Math.floor(ladoTablero / 8);
    document.documentElement.style.setProperty('--cell', `${cell}px`);

    // Ajusta el contenedor a exactamente 8*cell para evitar efecto rebote
    mapa.style.width = `${cell * 8}px`;
    mapa.style.height = `${cell * 8}px`;
  }
  window.addEventListener('resize', ajustarTamanoTablero);
  window.addEventListener('orientationchange', ajustarTamanoTablero);

  // --- Guardado/Carga mínimos (posiciones/estadísticas) ---
  function saveProgress() {
    const data = {
      wave,
      players: players.map(p => ({
        tipo: p.tipo, fila: p.fila, col: p.col, vivo: p.vivo,
        hp: p.hp, maxHp: p.maxHp, nivel: p.nivel, kills: p.kills, damage: p.damage
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
      const pk = makeKnight(), pa = makeArcher();
      const srcK = d.players?.find(x=>x.tipo==="caballero") || pk;
      const srcA = d.players?.find(x=>x.tipo==="arquera") || pa;
      players = [ Object.assign(pk, srcK), Object.assign(pa, srcA) ];
      return true;
    } catch { return false; }
  }
  document.getElementById("btnGuardar").onclick = saveProgress;
  document.getElementById("btnReset").onclick = () => { localStorage.removeItem(STORAGE_KEY); location.reload(); };

  // --- Spawner de enemigos (HP y daño 50) ---
  function spawnWave(){
    enemies = [];
    const count = Math.min(2 + wave, 6);
    const ocupadas = new Set(players.filter(p=>p.vivo).map(p=>`${p.fila},${p.col}`));
    for (let i=0; i<count; i++){
      let f,c;
      do { f = Math.floor(Math.random()*8); c = Math.floor(Math.random()*8); }
      while (ocupadas.has(`${f},${c}`));
      ocupadas.add(`${f},${c}`);
      enemies.push({
        id:`E${Date.now()}-${i}`,
        nombre:`Bandido ${i+1}`,
        fila:f, col:c, vivo:true,
        hp:50, maxHp:50,
        retrato:"assets/enemy.png",
        damage:ENEMY_BASE_DAMAGE
      });
    }
    if (turno==="jugador") players.forEach(p=>p.acted=false);
  }

  // --- Render del tablero (celdas invisibles) ---
  function dibujarMapa(){
    mapa.innerHTML = "";
    for (let f=0; f<8; f++){
      for (let c=0; c<8; c++){
        const celda = document.createElement("div");
        celda.className = "celda";
        if (seleccionado && celdasMovibles.has(`${f},${c}`)) celda.classList.add("movible");
        if (seleccionado && seleccionado.fila===f && seleccionado.col===c) celda.classList.add("seleccionada");

        players.forEach(p=>{
          if (p.vivo && p.fila===f && p.col===c){
            const mini=document.createElement("div");
            mini.className="fichaMini " + (p.tipo==="caballero"?"mini-caballero":"mini-arquera");
            celda.appendChild(mini);
          }
        });
        enemies.forEach(e=>{
          if (e.vivo && e.fila===f && e.col===c){
            const mini=document.createElement("div");
            mini.className="fichaMini mini-enemigo";
            celda.appendChild(mini);
          }
        });

        celda.addEventListener("click", ()=>manejarClick(f,c));
        mapa.appendChild(celda);
      }
    }
  }

  // --- Selección y acciones ---
  let seleccionado=null;
  let celdasMovibles=new Set();
  const acciones = document.getElementById("acciones");
  function botonesAccionesPara(unidad){
    acciones.innerHTML="";
    if (turno!=="jugador" || !unidad?.vivo) return;
    const bEnd=document.createElement("button");
    bEnd.textContent="Terminar acción";
    bEnd.onclick=()=>{ unidad.acted=true; seleccionado=null; celdasMovibles.clear(); dibujarMapa(); acciones.innerHTML=""; comprobarCambioATurnoEnemigo(); };
    acciones.appendChild(bEnd);

    enemigosEnRango(unidad).forEach(en=>{
      const b=document.createElement("button");
      b.className="primary";
      b.textContent=`ATACAR ${en.nombre} (-${unidad.damage})`;
      b.onclick=()=>atacarUnidadA(unidad,en);
      acciones.appendChild(b);
    });
  }

  document.getElementById("btnFinTurno").onclick = ()=>{
    if (turno!=="jugador") return;
    players.forEach(p=>p.acted=true);
    seleccionado=null; celdasMovibles.clear(); acciones.innerHTML="";
    setTurno("enemigo");
    setTimeout(turnoIAEnemigos, 200);
  };

  function setTurno(t){
    turno=t;
    document.getElementById("turno").textContent = (t==="jugador"?"TU TURNO": t==="enemigo"?"TURNO ENEMIGO":"FIN DE PARTIDA");
  }

  // --- Ficha ---
  function renderFicha(u){
    const ficha = document.getElementById("ficha");
    if(!u){ ficha.style.display="none"; ficha.innerHTML=""; return; }
    const pct = Math.max(0, Math.min(100, Math.round((u.hp/u.maxHp)*100)));
    const grad = (pct>50)?"linear-gradient(90deg,#2ecc71,#27ae60)":(pct>25)?"linear-gradient(90deg,#f1c40f,#e67e22)":"linear-gradient(90deg,#e74c3c,#c0392b)";
    const esJ = players.includes(u);
    const extra = esJ?`<p class="meta">Nivel <b>${u.nivel}</b> · Daño <b>${u.damage}</b> · KOs <b>${u.kills}</b>${u.acted?" · Acción gastada":""}</p>`:"";
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

  // --- Movimiento (BFS coste 1) ---
  function calcularCeldasMovibles(u){
    celdasMovibles.clear();
    const dist = Array.from({length:8},()=>Array(8).fill(Infinity));
    const q=[]; dist[u.fila][u.col]=0; q.push([u.fila,u.col]);
    const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
    while(q.length){
      const [f,c]=q.shift();
      for(const [df,dc] of dirs){
        const nf=f+df,nc=c+dc;
        if(nf<0||nf>=8||nc<0||nc>=8) continue;
        if(!passable()) continue;
        const ocupado = enemies.some(e=>e.vivo&&e.fila===nf&&e.col===nc) ||
                        players.some(p=>p.vivo&&p!==u&&p.fila===nf&&p.col===nc);
        if(ocupado) continue;
        const nd = dist[f][c] + 1;
        if(nd<=rangoJugador && nd<dist[nf][nc]){ dist[nf][nc]=nd; q.push([nf,nc]); }
      }
    }
    for(let f=0;f<8;f++) for(let c=0;c<8;c++){
      if(!(f===u.fila && c===u.col) && dist[f][c]<=rangoJugador) celdasMovibles.add(`${f},${c}`);
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
      if (pj.acted){ seleccionado=null; celdasMovibles.clear(); dibujarMapa(); acciones.innerHTML=""; return; }
      seleccionado=pj; calcularCeldasMovibles(seleccionado); dibujarMapa(); botonesAccionesPara(seleccionado); return;
    }

    if (seleccionado){
      if (f===seleccionado.fila && c===seleccionado.col){
        seleccionado=null; celdasMovibles.clear(); dibujarMapa(); acciones.innerHTML=""; return;
      }
      const esAlcanzable = celdasMovibles.has(`${f},${c}`);
      const ocupado = enemies.some(e=>e.vivo&&e.fila===f&&e.col===c) ||
                      players.some(p=>p.vivo&&p!==seleccionado&&p.fila===f&&p.col===c);
      if (esAlcanzable && !ocupado){
        seleccionado.fila=f; seleccionado.col=c;
        dibujarMapa(); botonesAccionesPara(seleccionado);
      }
    }
  }

  // --- Combate y FX ---
  function efectoAtaque(objetivo, cantidad, fuente){
    const idx = objetivo.fila * 8 + objetivo.col;
    const celda = mapa.children[idx]; if(!celda) return;
    const flash = (fuente==='enemy')?'flash-enemy':'flash-player';
    celda.classList.add(flash); setTimeout(()=>celda.classList.remove(flash),280);
    const sprite = celda.firstElementChild;
    if (sprite){ sprite.classList.add('blink-hit'); setTimeout(()=>sprite.classList.remove('blink-hit'),1200); }
    const dmg=document.createElement('div');
    dmg.className='dmg-float ' + (fuente==='enemy'?'dmg-enemy':'dmg-player');
    dmg.textContent=`-${cantidad}`; celda.appendChild(dmg);
    setTimeout(()=>dmg.remove(),650);
  }
  function aplicarDanyo(obj,cant,fuente){
    obj.hp=Math.max(0,obj.hp-cant);
    if(obj.hp<=0) obj.vivo=false;
    efectoAtaque(obj,cant,fuente);
  }

  function atacarUnidadA(u, objetivo){
    aplicarDanyo(objetivo, u.damage, 'player');
    renderFicha(objetivo);
    if(!objetivo.vivo){
      u.kills=(u.kills||0)+1;
      if(enemies.every(e=>!e.vivo)){
        wave++; u.acted=true; seleccionado=null; celdasMovibles.clear(); dibujarMapa(); acciones.innerHTML="";
        setTimeout(()=>{ spawnWave(); dibujarMapa(); setTurno('jugador'); players.forEach(p=>p.acted=false); }, 400);
        return;
      }
    }
    u.acted=true; seleccionado=null; celdasMovibles.clear(); acciones.innerHTML=""; dibujarMapa(); comprobarCambioATurnoEnemigo();
  }

  function comprobarCambioATurnoEnemigo(){
    if (players.every(p=>!p.vivo || p.acted)) {
      setTurno('enemigo'); setTimeout(turnoIAEnemigos, 200);
    }
  }

  function turnoIAEnemigos(){
    const vivos = players.filter(p=>p.vivo);
    if(vivos.length===0){ acciones.innerHTML="<div style='color:#ffcccc'>¡Has sido derrotado!</div>"; setTurno('fin'); return; }

    for (const en of enemies){
      if(!en.vivo) continue;
      let objetivo=vivos[0], mejor= Math.abs(en.fila-objetivo.fila)+Math.abs(en.col-objetivo.col);
      for(const p of vivos){ const d=Math.abs(en.fila-p.fila)+Math.abs(en.col-p.col); if(d<mejor){ mejor=d; objetivo=p; } }

      if (mejor===1){
        aplicarDanyo(objetivo, en.damage, 'enemy');
      } else {
        // moverse hacia el objetivo (pasos Manhattan simples, evitando choques)
        const step = (a,b)=> a<b?1:(a>b?-1:0);
        let nf=en.fila, nc=en.col;
        for(let s=0;s<rangoEnemigo;s++){
          const df = step(nf, objetivo.fila), dc = step(nc, objetivo.col);
          const cand = [
            [nf+df, nc], [nf, nc+dc], // prioriza acercar en un eje
          ];
          let moved=false;
          for(const [tf,tc] of cand){
            if(tf<0||tf>=8||tc<0||tc>=8) continue;
            const ocupado = enemies.some(o=>o!==en && o.vivo && o.fila===tf && o.col===tc) ||
                            players.some(p=>p.vivo && p.fila===tf && p.col===tc);
            if(!ocupado){ nf=tf; nc=tc; moved=true; break; }
          }
          if(!moved) break;
        }
        en.fila=nf; en.col=nc;

        if (Math.abs(en.fila-objetivo.fila)+Math.abs(en.col-objetivo.col)===1){
          aplicarDanyo(objetivo, en.damage, 'enemy');
        }
      }
    }

    players.forEach(p=>p.acted=false);
    players.forEach(p=>{ if(p.hp<=0) p.vivo=false; });
    renderFicha(players.find(p=>p.vivo) || null);
    dibujarMapa();

    if (players.every(p=>!p.vivo)) { acciones.innerHTML="<div style='color:#ffcccc'>¡Has sido derrotado!</div>"; setTurno('fin'); }
    else { setTurno('jugador'); acciones.innerHTML=""; }
  }

  function setTurno(t){ turno=t; document.getElementById("turno").textContent = (t==="jugador"?"TU TURNO":t==="enemigo"?"TURNO ENEMIGO":"FIN DE PARTIDA"); }

  // --- Init ---
  function init(){
    ajustarTamanoTablero();
    const had = loadProgress(); if(!had) saveProgress();
    players.forEach(p=>p.acted=false);
    spawnWave();
    dibujarMapa();
    setTurno("jugador");
    renderFicha(null);
  }
  init();
})();