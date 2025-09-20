/* build: rescate-1 */
(function(){
  const ROWS = 16, COLS = 9;
  const NON_PLAYABLE_BOTTOM_ROWS = 4;

  const PLAYER_MAX_MP = 5;
  const ENEMY_MAX_MP  = 3;
  const ENEMY_BASE_DAMAGE = 50;

  let turno = "jugador";
  let enemies = [];
  let players = [];
  let aldeano = null;
  let salida = { fila: 0, col: 4 };
  let seleccionado = null;
  let celdasMovibles = new Set();
  let distSel = null;
  let gameMode = "skirmish";   // primer modo
  let fase = 1;
  let nextMode = null;

  // ---------- Diálogos ----------
  const dialogLines = [
    { who:'knight', name:'Caballero', text:'Os doy la bienvenida a Tactic Heroes. Nuestro objetivo es derrotar al ejército rival.' },
    { who:'archer', name:'Arquera',   text:'Selecciona un personaje para ver su rango de movimiento y después elegir dónde colocarlo.' },
    { who:'knight', name:'Caballero', text:'El caballero ataca si está adyacente al enemigo y la arquera a una casilla de distancia.' },
    { who:'archer', name:'Arquera',   text:'Todo listo. ¡Entremos en combate!' }
  ];
  let dlgIndex = 0, typing=false, typeTimer=null, speakPopTimer=null;

  // Unidades
  const makeKnight = () => ({
    id: "K", tipo: "caballero",
    fila: Math.floor(ROWS*0.6), col: Math.floor(COLS*0.25),
    vivo: true, nombre: "Caballero",
    hp: 100, maxHp: 100,
    retrato: "assets/player.PNG", nivel: 1, kills: 0,
    damage: 50, range: [1], acted: false, mp: PLAYER_MAX_MP
  });
  const makeArcher = () => ({
    id: "A", tipo: "arquera",
    fila: Math.floor(ROWS*0.65), col: Math.floor(COLS*0.25),
    vivo: true, nombre: "Arquera",
    hp: 80, maxHp: 80,
    retrato: "assets/archer.PNG", nivel: 1, kills: 0,
    damage: 50, range: [2], acted: false, mp: PLAYER_MAX_MP
  });
  const makeVillager = () => ({
    id: "V", tipo: "aldeano",
    fila: Math.floor(ROWS*0.75), col: Math.floor(COLS*0.18),
    vivo: true, nombre: "Aldeano",
    hp: 60, maxHp: 60,
    retrato: "assets/villager.PNG",
    damage: 0, range: [], acted: false, mp: 3
  });

  // ---------- DOM ----------
  const mapa = document.getElementById("mapa");
  const acciones = document.getElementById("acciones");
  const ficha = document.getElementById("ficha");
  const overlayWin = document.getElementById("overlayWin");
  const overlayLose = document.getElementById("overlayLose");
  const btnContinuar = document.getElementById("btnContinuar");
  const btnReintentar = document.getElementById("btnReintentar");
  const turnBanner = document.getElementById("turnBanner");

  const portada = document.getElementById("portada");
  const btnJugar = document.getElementById("btnJugar");
  const dialog = document.getElementById("dialogScene");
  const dialogNameEl = document.getElementById("dialogName");
  const dialogTextEl = document.getElementById("dialogText");
  const btnDialogNext = document.getElementById("btnDialogNext");
  const charKnight = document.getElementById("charKnight");
  const charArcher = document.getElementById("charArcher");

  // ---------- Banner ----------
  function showTurnBanner(text){
    turnBanner.textContent = text;
    turnBanner.style.display = "block";
    setTimeout(()=>{ turnBanner.style.display = "none"; }, 1300);
  }
  function setTurno(t){
    turno = t;
    showTurnBanner(
      t==="jugador" ? "TU TURNO"
      : t==="enemigo" ? "TURNO ENEMIGO"
      : "FIN DE PARTIDA"
    );
  }

  // ---------- Inicio ----------
  function initSkirmish(){
    players=[makeKnight(),makeArcher()];
    fase=1;
    spawnFase();
    dibujarMapa();
    setTurno("jugador");
  }
  function initRescue(){
    players=[makeKnight(),makeArcher()];
    aldeano=makeVillager();
    randomSalida();
    spawnEnemigos();
    dibujarMapa();
    setTurno("jugador");
  }

  // ---------- Spawn enemigos Skirmish ----------
  function spawnFase(){
    enemies = [];
    const count = (fase === 1) ? 3 : (fase === 2) ? 4 : 0;
    if (count === 0) return;
    const ocupadas = new Set(players.filter(p=>p.vivo).map(p=>`${p.fila},${p.col}`));
    for (let i=0; i<count; i++){
      let f,c;
      do {
        f = Math.floor(Math.random()*(ROWS - NON_PLAYABLE_BOTTOM_ROWS));
        c = Math.floor(Math.random()*COLS);
      } while (ocupadas.has(`${f},${c}`));
      ocupadas.add(`${f},${c}`);
      enemies.push({
        id:`E${Date.now()}-${i}`,
        nombre:`Bandido ${i+1 + (fase===2?3:0)}`,
        fila:f, col:c, vivo:true,
        hp:50, maxHp:50,
        retrato:"assets/enemy.PNG",
        damage:ENEMY_BASE_DAMAGE,
        mp: ENEMY_MAX_MP
      });
    }
    if (turno==="jugador") players.forEach(p=>{ p.acted=false; p.mp=PLAYER_MAX_MP; });
  }

  // ---------- Rescate ----------
  function randomSalida(){
    salida.fila=0;
    salida.col=Math.floor(Math.random()*COLS);
  }
  function spawnEnemigos(){
    enemies=[];
    const count=4;
    const ocupadas=new Set(players.map(p=>`${p.fila},${p.col}`));
    ocupadas.add(`${aldeano.fila},${aldeano.col}`);
    for(let i=0;i<count;i++){
      let f,c;
      do{
        f=Math.floor(Math.random()*(ROWS-NON_PLAYABLE_BOTTOM_ROWS-3));
        c=Math.floor(Math.random()*COLS);
      }while(ocupadas.has(`${f},${c}`) || (f===salida.fila&&c===salida.col));
      ocupadas.add(`${f},${c}`);
      enemies.push({
        id:`E${Date.now()}-${i}`,
        nombre:`Bandido ${i+1}`,
        fila:f,col:c,vivo:true,
        hp:50,maxHp:50,
        retrato:"assets/enemy.PNG",
        damage:ENEMY_BASE_DAMAGE,
        mp:ENEMY_MAX_MP
      });
    }
  }

  // (… aquí seguiría el resto de la lógica que ya tenías: dibujarMapa, combate, IA, overlays …)  
  // ⚠️ IMPORTANTE: todas las referencias de imágenes ya están en `.PNG`.

  // ---------- Init ----------
  function init(){
    if(gameMode==="skirmish"){ initSkirmish(); }
    else if(gameMode==="rescue"){ initRescue(); }

    if (btnContinuar) btnContinuar.onclick=()=>{
      overlayWin.style.display="none";
      if(nextMode==="rescue"){ gameMode="rescue"; nextMode=null; initRescue(); }
      else { location.reload(); }
    };
    if (btnReintentar) btnReintentar.onclick=()=> location.reload();

    if (btnJugar){
      btnJugar.onclick=()=>{
        portada.style.display="none";
        dialog.style.display="block";
        dlgIndex=0; showCurrentDialog();
      };
    }
    if (btnDialogNext) btnDialogNext.onclick=advanceDialog;
  }
  init();
})();