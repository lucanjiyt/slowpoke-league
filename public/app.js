/* Slowpoke League — interfaz (parejas, organización y vista stream) */
const {TYPES,NATURES,STATS,PHASES,RARITY_LABEL,KIND_LABEL,CARDS,NEGATIVE,teamPaste,toPaste,pairName,bankById,totalRounds,standings,currentMatches,spriteUrl,cardIconUrl,availableIds,describeChoice} = Logic;

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hhmm = t => new Date(t).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"});
function toast(msg){ const t=document.getElementById("toast"); t.textContent=msg; t.hidden=false; clearTimeout(toast._t); toast._t=setTimeout(()=>t.hidden=true,3500); }
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch{ return null; } },
  set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,v); }catch{} },
};
const STREAM_KEY = new URLSearchParams(location.search).get("stream") || "";
const STARS = {comun:"★",rara:"★★",epica:"★★★",legendaria:"★★★★"};

/* ===================== Estado del cliente ===================== */
const S = {sid:store.get("slowpoke-sid"), you:{role:"public"}, st:null, connected:false, es:null};
const ui = {tab:"control", card:null, p:{}, busy:false, editing:null, confirmReset:false, bankMsg:"", bankEdit:null, bankDel:null, bankQ:""};

/* Tiempo real con Server-Sent Events. Si el túnel o el hosting no los deja pasar,
   la app cambia sola a preguntar al servidor cada segundo y medio. */
let lastRaw="", polling=null, gotEvent=false, sseTimer=null;
function apply(raw){
  if(raw===lastRaw) return; lastRaw=raw;
  const msg=JSON.parse(raw);
  const prevChoice = S.st && S.you.pairId ? S.st.cardChoices?.[S.you.pairId] : null;
  S.st=msg.state; S.you=msg.you; S.connected=true;
  if(S.sid && msg.you.role==="public"){ S.sid=null; store.set("slowpoke-sid",null); toast("Tu sesión ha terminado. Vuelve a entrar con tu código."); connect(); return; }
  if(S.st.phase!=="cards" || (!prevChoice && S.st.cardChoices?.[S.you.pairId])){ ui.card=null; ui.p={}; }
  render();
}
function query(){ const q=new URLSearchParams(); if(S.sid) q.set("sid",S.sid); if(STREAM_KEY) q.set("stream",STREAM_KEY); const t=q.toString(); return t?"?"+t:""; }
async function pollOnce(){
  try{ const r=await fetch("/api/state"+query(),{cache:"no-store"}); if(!r.ok) throw 0; apply(await r.text()); if(!S.connected){ S.connected=true; render(); } }
  catch{ if(S.connected){ S.connected=false; render(); } }
}
function startPolling(){
  if(S.es){ S.es.close(); S.es=null; }
  clearInterval(polling); pollOnce(); polling=setInterval(pollOnce,1500);
}
function connect(){
  lastRaw="";
  if(polling){ startPolling(); return; }
  if(S.es) S.es.close();
  gotEvent=false;
  const es=new EventSource("/api/events"+query());
  S.es=es;
  clearTimeout(sseTimer); sseTimer=setTimeout(()=>{ if(!gotEvent) startPolling(); },6000);
  es.onerror=()=>{ S.connected=false; render(); if(!gotEvent) startPolling(); };
  es.onmessage=ev=>{ gotEvent=true; apply(ev.data); };
}
async function post(url, body){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||"No se pudo completar la acción.");
  return j;
}
async function act(action,data){
  if(ui.busy) return false;
  ui.busy=true; render();
  try{ await post("/api/action",{sid:S.sid,action,data}); if(polling) await pollOnce(); return true; }
  catch(e){ toast(e.message); return false; }
  finally{ ui.busy=false; render(); }
}
const seesAll = () => S.you.role==="admin" || S.you.role==="stream";

/* ===================== Piezas ===================== */
const membersOf = (st,pid) => (st.players?.[pid]||[]);
function sprite(s, size=""){
  const url=spriteUrl(s?.dex);
  return url ? `<img class="spr ${size}" src="${url}" alt="" loading="lazy" data-spr>` : `<span class="spr ${size} none" aria-hidden="true"></span>`;
}
function typeChips(types){ return `<div class="types">${(types||[]).map(t=>{const x=TYPES[t]||[t,"#777"];return `<span class="type" style="--tc:${x[1]}">${esc(x[0])}</span>`;}).join("")}</div>`; }
function monCard(s, opts={}){
  if(!s) return "";
  const ev=STATS.filter(([k])=>Number(s.evs?.[k]||0)>0).map(([k,l])=>`${s.evs[k]} ${l}`).join(" / ")||"—";
  const iv=STATS.filter(([k])=>s.ivs&&Number(s.ivs[k])!==31).map(([k,l])=>`${s.ivs[k]} ${l}`).join(" / ");
  const attrs = opts.act ? ` role="button" tabindex="0" data-act="${opts.act}" data-id="${esc(opts.id)}"` : "";
  return `<article class="mon${opts.act?" pickable":""}${opts.selected?" selected":""}${opts.benched?" out":""}"${attrs}>
    <div class="head">${sprite(s)}<div style="min-width:0"><div class="name">${esc(s.species)}</div>${typeChips(s.types)}</div></div>
    ${opts.benched?`<div class="benched">EN EL BANQUILLO ESTA RONDA</div>`:""}
    <dl><dt>Objeto</dt><dd>${esc(s.item||"Ninguno")}</dd><dt>Habilidad</dt><dd>${esc(s.ability||"—")}</dd>
    <dt>Naturaleza</dt><dd>${esc(s.nature||"—")}</dd>${s.teraType?`<dt>Tera</dt><dd>${esc(s.teraType)}</dd>`:""}
    <dt>EVs</dt><dd>${esc(ev)}</dd>${iv?`<dt>IVs</dt><dd>${esc(iv)}</dd>`:""}</dl>
    <ul>${(s.moves||[]).map(m=>`<li class="${m==="Splash"?"splash":""}">${esc(m)}</li>`).join("")}</ul>
    ${(s.mods||[]).length?`<div class="mods">${s.mods.map(m=>`<span class="mod${/\(/.test(m)?" bad":""}">${esc(m)}</span>`).join("")}</div>`:""}
    ${opts.footer||""}
  </article>`;
}
function benchedFor(st,pid,round){ return (st.benched?.[pid]||[]).filter(b=>b.round===round).map(b=>b.bankId); }
function rosterList(st,pid,size="xs"){
  const team=st.teams?.[pid]||[]; const bench=st.phase==="battle"?benchedFor(st,pid,st.round):[];
  if(!team.length) return `<p class="muted small">Sin Pokémon todavía.</p>`;
  return `<div class="roster">${team.map(s=>`<div class="slot">${sprite(s,size)}<b>${esc(s.species)}</b>${bench.includes(s.bankId)?`<span class="benched">FUERA</span>`:`<span class="small muted">${esc(s.item||"")}</span>`}</div>`).join("")}</div>`;
}
function pips(n){ return `<div class="pips" aria-label="${n} de 6">${Array.from({length:6},(_,i)=>`<i class="${i<n?"on":""}"></i>`).join("")}</div>`; }
function cardTile(o, i, opts={}){
  const c=CARDS[o.card]; if(!c) return "";
  return `<button type="button" class="card${opts.sel?" sel":""}${opts.mini?" mini":""}" data-r="${c.rarity}" ${opts.act?`data-act="${opts.act}" data-i="${i}"`:"disabled"}>
    ${opts.badge?`<span class="chosen-badge">${esc(opts.badge)}</span>`:""}
    <span class="row between"><span class="rar">${RARITY_LABEL[c.rarity]}</span><span class="stars">${STARS[c.rarity]}</span></span>
    <span class="card-head">${c.icon?`<img class="card-ico" src="${cardIconUrl(c.icon)}" alt="" loading="lazy" data-ico>`:""}<span class="card-title"><span class="ct">${esc(c.name)}</span><span class="ck">${KIND_LABEL[c.kind]}</span></span></span>
    ${opts.mini?"":`<p>${esc(c.text)}</p>`}</button>`;
}
/* Carta en pequeño para el stream: icono + nombre, con el color de la rareza */
function cardChip(o, sel){
  const c=CARDS[o.card]; if(!c) return "";
  return `<div class="chip${sel?" sel":""}" data-r="${c.rarity}">${c.icon?`<img class="chip-ico" src="${cardIconUrl(c.icon)}" alt="" loading="lazy" data-ico>`:""}<span>${esc(c.name)}</span><span class="stars">${STARS[c.rarity]}</span></div>`;
}
function standingsTable(st){
  const rows=standings(st);
  return `<div class="scroll"><table class="standings"><thead><tr><th>#</th><th>Pareja</th><th>V</th><th>D</th></tr></thead><tbody>
  ${rows.map((r,i)=>`<tr><td class="pos">${i+1}</td><td class="name">${esc(r.name)}</td><td class="w">${r.w}</td><td class="l">${r.l}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function matchesList(st, admin){
  const ms=currentMatches(st); const res=st.results?.["r"+st.round]||{};
  if(!ms.length) return `<p class="muted">No hay combates en curso.</p>`;
  return ms.map((m,i)=>{
    const w=res[i];
    const side=pid=> admin
      ? `<button class="pick${w===pid?" on":""}" data-act="result" data-m="${i}" data-p="${pid}" ${ui.busy?"disabled":""}>${esc(pairName(st,pid))}</button>`
      : `<span class="${w?(w===pid?"win":"lose"):""}">${esc(pairName(st,pid))}</span>`;
    return `<div class="match"><div class="side">${side(m.a)}</div><span class="vs">VS</span><div class="side r">${side(m.b)}</div></div>`;
  }).join("");
}
function logList(st,n,cls=""){
  const items=(st.log||[]).slice(-n).reverse();
  if(!items.length) return `<p class="muted small">Aún no ha pasado nada.</p>`;
  return `<div class="log ${cls}">${items.map(l=>`<div><time>${hhmm(l.t)}</time><span class="k-${esc(l.kind)}">${esc(l.text)}</span></div>`).join("")}</div>`;
}
function pasteBlock(team,id,label="Para importar en Showdown"){
  return `<div class="row between"><span class="eyebrow">${label}</span><button class="btn sm" data-act="copy" data-target="${id}">Copiar</button></div>
  <textarea id="${id}" rows="10" readonly>${esc(teamPaste(team))}</textarea>`;
}

function header(){
  const st=S.st; const stream=location.hash==="#stream";
  const roundTxt = st && st.round ? ` · R${st.round}/${totalRounds(st)}` : "";
  let tabs="";
  if(S.you.role==="admin" && !stream)
    tabs=[["control","Control"],["equipos","Equipos"],["banco","Banco"],["registro","Registro"]].map(([k,l])=>`<button data-act="tab" data-tab="${k}" aria-current="${ui.tab===k}">${l}</button>`).join("");
  if(!STREAM_KEY) tabs += stream ? `<a href="#">Volver</a>` : `<a href="#stream">Stream</a>`;
  if(S.sid && !stream) tabs += `<button data-act="logout">Salir</button>`;
  return `<header class="top"><div class="wrap"><div class="brand">SLOWPOKE <span>LEAGUE</span></div>
    ${st?`<span class="phase"><i></i>${esc(PHASES[st.phase])}${roundTxt}</span>`:""}
    ${S.connected?"":`<span class="conn">RECONECTANDO…</span>`}
    <nav class="tabs">${tabs}</nav></div></header>`;
}

/* ===================== Vistas ===================== */
function viewLoading(){ return `<main class="wrap"><div class="panel login"><p class="insert">CARGANDO…</p><p class="muted" style="text-align:center">Si tarda mucho, comprueba que el servidor está encendido.</p></div></main>`; }

function viewLogin(){
  return `<main class="wrap"><div class="panel login hot">
    <div class="logo-big">SLOWPOKE<span>LEAGUE</span></div>
    <p class="insert">INSERT COIN</p>
    <p>Escribe el código de tu pareja y tu nombre. Los dos miembros usan el mismo código, cada uno desde su dispositivo.</p>
    <form id="loginForm" style="display:grid;gap:14px">
      <label class="f" for="code">Código<input type="text" id="code" autocomplete="off" placeholder="SLOW-XXXX" required></label>
      <label class="f" for="name">Tu nombre<input type="text" id="name" maxlength="30" autocomplete="nickname" placeholder="Como te conocen en stream"></label>
      <button class="btn primary" type="submit" ${ui.busy?"disabled":""}>${ui.busy?"Entrando…":"▶ Press start"}</button>
    </form>
    <p class="small muted">La organización entra con su contraseña en el campo de código.</p>
  </div>
  ${S.st?`<div class="panel login"><span class="eyebrow">Clasificación</span>${standingsTable(S.st)}</div>`:""}</main>`;
}

/* ---------- Pareja ---------- */
function battlePaste(st,pid,round){ const out=benchedFor(st,pid,round); return (st.teams[pid]||[]).filter(s=>!out.includes(s.bankId)); }
const nextRound = st => st.phase==="battle" ? st.round : st.round+1;

/* Pantalla de combate: VS, los dos equipos enfrentados y el paste */
function combatBlock(st,pid){
  const round=nextRound(st), team=st.teams[pid]||[];
  const m=(st.schedule?.[round-1]?.matches||[]).find(x=>x.a===pid||x.b===pid); const rival=m?(m.a===pid?m.b:m.a):null;
  const out=benchedFor(st,pid,round), rOut=rival?benchedFor(st,rival,round):[];
  const outNames=team.filter(s=>out.includes(s.bankId)).map(s=>s.species);
  const msg = st.phase==="battle"
    ? `<p>Importad este equipo en Showdown en formato <b>Custom Game</b> y retad a vuestro rival. La organización registra el resultado.</p>`
    : `<p class="muted">La ronda empezará cuando la organización la lance.</p>`;
  return `<div class="panel gold">
      <span class="eyebrow">${st.phase==="battle"?`Ronda ${round} · ¡a combatir!`:`Próximo combate · ronda ${round}`}</span>
      ${rival?`<div class="versus"><div class="who me">${esc(pairName(st,pid))}</div><div class="vs">VS</div><div class="who them">${esc(pairName(st,rival))}</div></div>`:`<h2>Descansáis esta ronda</h2>`}
      ${msg}
      ${outNames.length?`<p class="notice warn">No podéis usar a <b>${esc(outNames.join(", "))}</b> en este combate. Ya no está en el paste.</p>`:""}
    </div>
    <div class="faceoff">
      <div class="panel side-me"><span class="eyebrow">Vuestro equipo · ${esc(pairName(st,pid))}</span><div class="mons">${team.map(s=>monCard(s,{benched:out.includes(s.bankId)})).join("")}</div></div>
      ${rival?`<div class="panel side-them"><span class="eyebrow">Equipo rival · ${esc(pairName(st,rival))}</span><div class="mons">${(st.teams[rival]||[]).map(s=>monCard(s,{benched:rOut.includes(s.bankId)})).join("")}</div></div>`:""}
    </div>`;
}
function pastePanel(st,pid,isNew){
  const mine=battlePaste(st,pid,nextRound(st));
  return `<div class="panel hot">${isNew?`<span class="new-tag">¡NUEVO PASTE!</span>`:""}${pasteBlock(mine,"myPaste","Vuestro paste para el combate")}
    <p class="small muted">Lleva aplicados todos los efectos de las cartas. En Showdown: Teambuilder → New Team → Import from text.</p></div>`;
}
/* Resumen de la revelación: qué carta ha elegido cada pareja y qué ha pasado */
function revealGrid(st,big){
  const rv=st.reveal; if(!rv) return "";
  return `<div class="reveal">${rv.entries.map(e=>{ const c=e.card?CARDS[e.card]:null; const ready=st.ready?.[e.pid];
    return `<div class="reveal-item">
      <div class="row between"><h3>${esc(pairName(st,e.pid))}</h3>${st.phase==="reveal"?`<span class="ready-pill${ready?" on":""}">${ready?"LISTA":"…"}</span>`:""}</div>
      ${c?cardTile({card:e.card},0,{mini:!big}):`<div class="card back">SIN CARTA</div>`}
      ${e.desc?`<p class="small">${esc(e.desc)}</p>`:""}
      ${e.outcome.map(t=>`<p class="small outcome">▸ ${esc(t)}</p>`).join("")}
    </div>`; }).join("")}</div>`;
}
function readyBar(st){
  const n=st.pairs.filter(p=>st.ready?.[p.id]).length;
  return `<div class="row">${st.pairs.map(p=>`<span class="ready-pill${st.ready?.[p.id]?" on":""}">${esc(p.name)}</span>`).join("")}</div><span class="small muted">${n}/${st.pairs.length} parejas listas</span>`;
}

function viewPlayer(){
  const st=S.st, pid=S.you.pairId, team=st.teams[pid]||[];
  const mates=[...new Set(membersOf(st,pid).map(m=>m.name))];
  let body="", showTeam=false;
  if(st.phase==="setup") body=`<div class="panel"><h2>Todo listo</h2><p>Ya estáis dentro. El draft empezará cuando la organización lo indique y aquí os aparecerán vuestras primeras opciones.</p><p class="insert" style="text-align:left">ESPERANDO JUGADORES…</p></div>`;
  else if(st.phase==="draft"){
    showTeam=true;
    const dr=st.draft[pid]||{offer:[]}, r=st.draftRound||1;
    const done=st.pairs.filter(p=>(st.progress?.[p.id]||0)>=r).length;
    const waitBar=`<div class="row">${st.pairs.map(p=>`<span class="ready-pill${(st.progress?.[p.id]||0)>=r?" on":""}">${esc(p.name)}</span>`).join("")}</div><span class="small muted">${done}/${st.pairs.length} parejas han elegido en esta ronda</span>`;
    if(team.length>=r) body=`<div class="panel"><span class="eyebrow">Draft · elección ${r} de 6</span><h2>¡Elegido! Esperando al resto</h2>
      <p>Cuando todas las parejas hayan elegido, os saldrán las dos opciones siguientes. Lo que elige cada pareja no se verá hasta que termine el draft.</p>
      <div class="readybox">${waitBar}</div></div>`;
    else body=`<div class="panel hot"><span class="eyebrow">Draft · elección ${r} de 6</span><h2>Elegid uno de estos dos</h2>
      <p class="muted">Todas las parejas eligen a la vez. El que no elijáis vuelve al banco y puede salirle a otra pareja en la siguiente ronda. Nadie más ve vuestras opciones.</p>
      ${dr.offer.length?`<div class="grid2">${dr.offer.map(id=>monCard(bankById(st,id),{footer:`<button class="btn primary" data-act="pick" data-id="${esc(id)}" ${ui.busy?"disabled":""}>Elegir ${esc(bankById(st,id)?.species||"")}</button>`})).join("")}</div>`
      :`<p class="notice warn">No quedan Pokémon disponibles en el banco. Avisad a la organización.</p>`}
      <div class="readybox">${waitBar}</div></div>`;
  }
  else if(st.phase==="cards"){
    showTeam=true;
    const offers=st.cardOffers[pid]||[], chosen=st.cardChoices[pid];
    const nChosen=Object.keys(st.cardChoices||{}).length;
    if(chosen) body=`<div class="panel"><span class="eyebrow">Cartas · ronda ${st.round}</span><h2>Carta elegida: ${esc(CARDS[offers[chosen.idx]?.card]?.name||"")}</h2>
      <p>Esperando al resto de parejas (${nChosen}/${st.pairs.length}). Cuando todas hayan elegido se revelarán las cartas de todos y os aparecerá vuestro paste nuevo.</p></div>`;
    else body=`<div class="panel hot"><span class="eyebrow">Cartas · ronda ${st.round}</span><h2>Elegid una carta</h2>
      <p class="muted">Las demás parejas no ven vuestras cartas ni lo que elegís hasta que se revelen todas.</p>
      <div class="cards">${offers.map((o,i)=>cardTile(o,i,{act:"selCard",sel:ui.card===i})).join("")}</div>
      ${ui.card!==null&&offers[ui.card]?cardForm(st,pid,offers[ui.card]):""}</div>`;
  }
  else if(st.phase==="reveal"){
    const me=st.ready?.[pid];
    body=`<div class="panel hot"><span class="eyebrow">Revelación · cartas de la ronda ${st.reveal?.round||st.round}</span><h2>Esto es lo que ha elegido cada pareja</h2>
      <p class="muted">Se han aplicado de la última pareja de la clasificación a la primera.</p>
      ${revealGrid(st,false)}
      <div class="readybox">${me?`<p><b style="color:var(--green)">¡Listos!</b> Esperando al resto y a que la organización dé paso a la siguiente ronda.</p>`:`<p>Revisad vuestro paste nuevo y, cuando lo tengáis, marcad que estáis listos.</p><button class="btn go" data-act="ready" ${ui.busy?"disabled":""}>▶ ¡Estamos listos!</button>`}
      ${readyBar(st)}</div></div>
      ${st.round<totalRounds(st)?pastePanel(st,pid,true)+combatBlock(st,pid):""}`;
  }
  else if(st.phase==="ready") body = st.round<totalRounds(st) ? `<div class="panel"><h2>Draft terminado</h2><p>Ya podéis ver todos los equipos. La primera ronda empezará cuando la organización la lance.</p></div>`+pastePanel(st,pid,true)+combatBlock(st,pid) : "";
  else if(st.phase==="battle") body=combatBlock(st,pid)+pastePanel(st,pid,false);
  else if(st.phase==="finished"){ showTeam=true; body=`<div class="panel gold"><span class="eyebrow">Fin de la liga</span><h1>Campeones: ${esc(standings(st)[0]?.name||"")}</h1></div>`; }

  return `<main class="wrap">
    <div class="row between"><div style="display:grid;gap:8px"><span class="eyebrow">Tu pareja</span><h1>${esc(pairName(st,pid))}</h1>
    <span class="muted">${esc(mates.join(" y ")||S.you.name)}</span></div>
</div>
    ${body}
    ${showTeam?`<div class="panel"><span class="eyebrow">Vuestro equipo · ${team.length}/6</span>
      ${team.length?`<div class="team6">${team.map(s=>monCard(s)).join("")}</div>`:`<p class="muted">Vuestro equipo aparecerá aquí durante el draft.</p>`}</div>`:""}
    <div class="panel standings-solo"><span class="eyebrow">Clasificación</span>${standingsTable(st)}</div>
    </main>`;
}

function cardReady(offer){ return CARDS[offer.card].params.every(k=>ui.p[k]!==undefined&&ui.p[k]!==""); }
function cardForm(st,pid,offer){
  const c=CARDS[offer.card], P=ui.p, team=st.teams[pid]||[];
  const fields=[];
  const sel=(key,label,options,ph)=>`<label class="f" for="f-${key}">${label}<select id="f-${key}" data-ui="${key}"><option value="">${ph||"Elige…"}</option>${options.map(([v,l])=>`<option value="${esc(v)}"${String(P[key]??"")===String(v)?" selected":""}>${esc(l)}</option>`).join("")}</select></label>`;
  for(const k of c.params){
    if(k==="own") fields.push(sel("own", offer.card==="ladron"?"Tu Pokémon que recibe el objeto":"Tu Pokémon", team.map(s=>[s.bankId,s.species])));
    if(k==="moveSlot"){ const s=team.find(x=>x.bankId===P.own); fields.push(sel("moveSlot","Movimiento que olvida",(s?.moves||[]).map((m,i)=>[i,m]),s?"Elige…":"Elige antes el Pokémon")); }
    if(k==="moveName") fields.push(`<label class="f" for="f-moveName">Movimiento nuevo (en inglés, como en Showdown)<input type="text" id="f-moveName" data-ui="moveName" value="${esc(P.moveName||"")}" placeholder="Earthquake"></label>`);
    if(k==="item") fields.push(`<label class="f" for="f-item">Objeto nuevo (en inglés)<input type="text" id="f-item" data-ui="item" value="${esc(P.item||"")}" placeholder="Leftovers"></label>`);
    if(k==="nature") fields.push(sel("nature","Naturaleza",NATURES.map(n=>[n,n])));
    if(k==="tpair") fields.push(sel("tpair","Pareja objetivo",st.pairs.filter(p=>p.id!==pid).map(p=>[p.id,p.name])));
    if(k==="tslot"){ const t=st.teams[P.tpair]||[]; fields.push(sel("tslot","Pokémon objetivo",t.map(s=>[s.bankId,`${s.species}${s.item?` @ ${s.item}`:""}`]),P.tpair?"Elige…":"Elige antes la pareja")); }
    if(k==="tmove"){ const s=(st.teams[P.tpair]||[]).find(x=>x.bankId===P.tslot); fields.push(sel("tmove","Movimiento que pierde",(s?.moves||[]).map((m,i)=>[i,m]),s?"Elige…":"Elige antes el Pokémon")); }
  }
  const bankPick = c.params.includes("bank")
    ? `<div style="display:grid;gap:8px"><span class="eyebrow">Elige el fichaje</span><div class="grid3">${(offer.options||[]).map(id=>monCard(bankById(st,id),{act:"bankPick",id,selected:P.bank===id})).join("")}</div></div>` : "";
  return `<div class="notice" style="display:grid;gap:14px"><h3>${esc(c.name)}</h3>
    ${fields.length?`<div class="grid3">${fields.join("")}</div>`:""}${bankPick}
    ${NEGATIVE.has(c.kind)?`<p class="small muted">Si la pareja objetivo ha elegido Protección en esta misma ronda, vuestra carta no tendrá efecto.</p>`:""}
    <div class="row"><button class="btn primary" data-act="confirmCard" ${cardReady(offer)&&!ui.busy?"":"disabled"}>${ui.busy?"Enviando…":"Confirmar carta"}</button></div></div>`;
}

/* ---------- Organización ---------- */
function viewAdmin(){
  const st=S.st; let body="";
  if(ui.tab==="control") body=adminControl(st);
  if(ui.tab==="equipos") body=adminTeams(st);
  if(ui.tab==="banco") body=adminBank(st);
  if(ui.tab==="registro") body=`<div class="panel"><span class="eyebrow">Registro completo</span>${logList(st,500)}</div>`;
  return `<main class="wrap">${body}</main>`;
}
const simRow = btn => `<div class="notice test" style="display:grid;gap:10px"><h3>Modo prueba</h3><span class="small muted">La app juega por las parejas que aún no lo han hecho. No lo uses en el evento real.</span><div class="row">${btn}</div></div>`;
function streamLink(st){
  const url=`${location.origin}/?stream=${st.streamKey}#stream`;
  return `<div class="panel"><span class="eyebrow">Vista para OBS</span>
    <p class="small">Añade esta dirección como <b>fuente de navegador</b> en OBS (1920×1080). Con este enlace se ve todo en directo, también lo que elige cada pareja. No se lo pases a los participantes.</p>
    <div class="row"><input type="text" id="streamUrl" readonly value="${esc(url)}" style="flex:1;min-width:0"><button class="btn sm" data-act="copy" data-target="streamUrl">Copiar</button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a></div></div>`;
}
function adminControl(st){
  const dis=ui.busy?"disabled":"";
  const bankN=(st.bank||[]).length, need=st.pairs.length*8;
  let phase="";
  if(st.phase==="setup"){
    phase=`<div class="panel hot"><span class="eyebrow">Paso 1</span><h2>Parejas y códigos</h2>
      <p class="small muted">Pasa a cada pareja solo su código. Entran desde esta misma web con el código y su nombre.</p>
      <div class="scroll"><table><thead><tr><th>Nombre</th><th>Código</th><th>Dentro</th></tr></thead><tbody>
      ${st.pairs.map(p=>`<tr><td><input type="text" id="pname-${p.id}" value="${esc(p.name)}" style="width:100%;min-width:150px"></td>
        <td><input type="text" id="pcode-${p.id}" value="${esc(st.codes?.[p.id]||"")}" style="width:140px;text-transform:uppercase"></td>
        <td class="small">${membersOf(st,p.id).map(m=>`<span class="row" style="gap:6px">${esc(m.name)}<button class="btn sm" data-act="kick" data-sid="${esc(m.sid)}" ${dis}>Quitar</button></span>`).join("")||`<span class="muted">Nadie aún</span>`}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="row"><button class="btn primary" data-act="savePairs" ${dis}>Guardar parejas</button>
      <label class="f" for="npairs" style="grid-auto-flow:column;align-items:center;gap:8px">Número de parejas <select id="npairs">${[4,6,8,10].map(n=>`<option${n===st.pairs.length?" selected":""}>${n}</option>`).join("")}</select></label>
      <button class="btn" data-act="setPairsN" ${dis}>Aplicar</button></div></div>
      <div class="panel"><span class="eyebrow">Paso 2</span><h2>Empezar el draft</h2>
      <p>Banco: <b>${bankN}</b> Pokémon. ${bankN<need?`<span style="color:var(--orange)">Para ${st.pairs.length} parejas conviene tener al menos ${need}.</span>`:"Suficiente para el draft."}</p>
      <p class="small muted">Al empezar se sortea el calendario de ${totalRounds(st)} rondas y cada pareja recibe sus dos primeras opciones.</p>
      <div class="row"><button class="btn go" data-act="startDraft" ${dis} ${bankN<st.pairs.length*2?"disabled":""}>▶ Empezar draft</button></div></div>`;
  }
  if(st.phase==="draft"){
    const r=st.draftRound||1, done=st.pairs.filter(p=>(st.teams[p.id]||[]).length>=r).length;
    phase=`<div class="panel hot"><span class="eyebrow">Draft · elección ${r} de 6 · ${done}/${st.pairs.length} han elegido</span><h2>Lo que le está saliendo a cada pareja</h2>
      <p class="small muted">Todas eligen a la vez. Cuando han elegido todas, salen solas las opciones de la siguiente elección.</p>
      <div class="grid3">${st.pairs.map(p=>{ const t=st.teams[p.id]||[]; const o=st.draft[p.id]?.offer||[]; const picked=t.length>=r;
        return `<div class="mon"><div class="row between"><h3>${esc(p.name)}</h3>${pips(t.length)}</div>
        ${picked?`<span class="small" style="color:var(--green)">Ha elegido a ${esc(t[t.length-1]?.species||"")}</span>`:`<div class="row" style="gap:4px">${o.map(id=>{const b=bankById(st,id);return `<span class="row" style="gap:2px">${sprite(b,"sm")}<span class="small">${esc(b?.species||id)}</span></span>`;}).join(`<span class="muted small">o</span>`)||"—"}</div>`}
        <div class="row" style="gap:0">${t.map(s=>sprite(s,"xs")).join("")}</div>
        ${picked?"":`<button class="btn sm" data-act="reroll" data-p="${p.id}" ${dis}>Volver a sortear</button>`}</div>`; }).join("")}</div>
      ${simRow(`<button class="btn" data-act="simDraft" ${dis}>Elegir al azar por las que faltan</button>`)}</div>`;
  }
  if(st.phase==="reveal"){
    const all=st.pairs.every(p=>st.ready?.[p.id]);
    phase=`<div class="panel hot"><span class="eyebrow">Revelación · ronda ${st.reveal?.round||st.round}</span><h2>Cartas elegidas y lo que ha pasado</h2>
      <p class="small muted">Las parejas ya ven esta pantalla y su paste nuevo. Cuando estén todas listas, da paso a la siguiente ronda.</p>
      ${revealGrid(st,false)}
      <div class="readybox">${readyBar(st)}
      <div class="row"><button class="btn go" data-act="startRound" ${dis} ${all?"":"disabled"}>▶ Empezar ronda ${st.round+1}</button>
      ${all?"":`<button class="btn sm" data-act="forceRound" ${dis}>Dar paso igualmente</button>`}</div></div>
      <div style="display:grid;gap:8px"><span class="eyebrow">Próximos combates</span>${(st.schedule[st.round]?.matches||[]).map(m=>`<div class="match"><div class="side">${esc(pairName(st,m.a))}</div><span class="vs">VS</span><div class="side r">${esc(pairName(st,m.b))}</div></div>`).join("")}</div>
      ${all?"":simRow(`<button class="btn" data-act="simReady" ${dis}>Marcar todas como listas</button>`)}</div>`;
  }
  if(st.phase==="ready" && st.round<totalRounds(st)){
    phase=`<div class="panel gold"><span class="eyebrow">Siguiente paso</span><h2>Lanzar la ronda ${st.round+1}</h2>
      <div style="display:grid;gap:8px">${(st.schedule[st.round]?.matches||[]).map(m=>`<div class="match"><div class="side">${esc(pairName(st,m.a))}</div><span class="vs">VS</span><div class="side r">${esc(pairName(st,m.b))}</div></div>`).join("")}</div>
      <p class="small muted">Las parejas ya ven su paste para este combate.</p>
      <div class="row"><button class="btn go" data-act="startRound" ${dis}>▶ Empezar ronda ${st.round+1}</button></div></div>`;
  }
  if(st.phase==="battle"){
    const res=st.results["r"+st.round]||{}; const all=currentMatches(st).every((_,i)=>res[i]);
    phase=`<div class="panel gold"><span class="eyebrow">Ronda ${st.round} de ${totalRounds(st)}</span><h2>Marca quién gana cada combate</h2>
      <div style="display:grid;gap:10px">${matchesList(st,true)}</div>
      <div class="row"><button class="btn go" data-act="closeRound" ${dis} ${all?"":"disabled"}>${st.round>=totalRounds(st)?"Cerrar la última ronda":"Cerrar ronda y repartir cartas"}</button>
      ${all?"":`<span class="small muted">Faltan resultados.</span>`}</div>
      ${all?"":simRow(`<button class="btn" data-act="simResults" ${dis}>Resultados al azar</button>`)}</div>`;
  }
  if(st.phase==="cards"){
    const n=Object.keys(st.cardChoices).length;
    phase=`<div class="panel hot"><span class="eyebrow">Cartas · ${n}/${st.pairs.length} parejas han elegido</span><h2>Cartas de la ronda ${st.round}</h2>
      <div class="grid3">${st.pairs.map(p=>{ const offs=st.cardOffers[p.id]||[]; const ch=st.cardChoices[p.id];
        return `<div style="display:grid;gap:10px"><h3>${esc(p.name)}</h3><div style="display:grid;gap:10px">${offs.map((o,i)=>cardTile(o,i,{mini:true,sel:ch&&ch.idx===i,badge:ch&&ch.idx===i?"ELEGIDA":""})).join("")}</div>
        ${ch?`<p class="small">${esc(CARDS[offs[ch.idx]?.card]?.name||"")} ${esc(describeChoice(st,p.id,ch,offs[ch.idx]))}</p>`:`<p class="small muted">Eligiendo…</p>`}</div>`; }).join("")}</div>
      <div class="row"><button class="btn" data-act="resolveNow" ${dis}>Resolver ya (quien no haya elegido se queda sin carta)</button></div>
      ${simRow(`<button class="btn" data-act="simCards" ${dis}>Elegir carta al azar por las que faltan</button>`)}</div>`;
  }
  if(st.phase==="finished") phase=`<div class="panel gold"><span class="eyebrow">Liga terminada</span><h1>Campeones: ${esc(standings(st)[0]?.name||"")}</h1></div>`;
  return `${phase}<div class="grid2">
    <div class="panel"><span class="eyebrow">Clasificación</span>${standingsTable(st)}</div>
    <div class="panel"><span class="eyebrow">Lo último</span>${logList(st,12)}</div></div>
    ${streamLink(st)}
    <div class="panel"><span class="eyebrow">Zona peligrosa</span>
      <p class="small">Reiniciar borra equipos, resultados, cartas y registro. Se mantienen las parejas, los códigos, quién está dentro y el banco.</p>
      <div class="row">${ui.confirmReset?`<button class="btn danger" data-act="reset" ${dis}>Sí, reiniciar el evento</button><button class="btn" data-act="cancelReset">Cancelar</button>`:`<button class="btn danger" data-act="askReset" ${dis}>Reiniciar evento</button>`}</div></div>`;
}
function adminTeams(st){
  return `<div class="grid2">${st.pairs.map(p=>{ const t=st.teams[p.id]||[];
    return `<div class="panel"><div class="row between"><h2>${esc(p.name)}</h2><span class="small muted">${esc([...new Set(membersOf(st,p.id).map(m=>m.name))].join(" y ")||"Nadie dentro")}</span></div>
    ${t.length?`<div class="grid3">${t.map(s=>monCard(s,{footer: ui.editing&&ui.editing.p===p.id&&ui.editing.b===s.bankId
      ? `<textarea id="editPaste" rows="9">${esc(toPaste(s))}</textarea><div class="row"><button class="btn sm primary" data-act="saveEdit">Guardar</button><button class="btn sm" data-act="cancelEdit">Cancelar</button></div>`
      : `<button class="btn sm" data-act="edit" data-p="${p.id}" data-b="${esc(s.bankId)}">Editar a mano</button>`})).join("")}</div>${pasteBlock(t,"paste-"+p.id)}`:`<p class="muted">Equipo vacío.</p>`}</div>`; }).join("")}</div>`;
}
function adminBank(st){
  const sets=st.bank||[]; const owner={};
  Object.entries(st.teams||{}).forEach(([pid,t])=>t.forEach(s=>owner[s.bankId]=pairName(st,pid)));
  const free=new Set(availableIds(st));
  const q=ui.bankQ.trim().toLowerCase();
  const shown=sets.filter(s=>!q||s.species.toLowerCase().includes(q)||(s.item||"").toLowerCase().includes(q));
  const row=s=>{
    const status = owner[s.id] ? `<span style="color:var(--pink)">${esc(owner[s.id])}</span>` : free.has(s.id) ? `<span class="muted">Libre</span>` : `<span style="color:var(--orange)">Ofrecido</span>`;
    if(ui.bankEdit===s.id) return `<tr><td colspan="4"><div style="display:grid;gap:10px">
      <span class="eyebrow">Editando ${esc(s.species)}</span>
      <textarea id="bankEditText" rows="9">${esc(toPaste(s))}</textarea>
      <p class="small muted">Formato de Showdown. Si cambias de especie, la imagen y los tipos se actualizan solos. Los equipos que ya tienen este Pokémon no cambian.</p>
      <div class="row"><button class="btn sm primary" data-act="bankSave" data-id="${esc(s.id)}">Guardar</button><button class="btn sm" data-act="bankCancel">Cancelar</button></div></div></td></tr>`;
    return `<tr><td style="width:60px">${sprite(s,"sm")}</td><td><b style="font-weight:400;font-size:21px">${esc(s.species)}</b><br><span class="small muted">${esc(s.item||"")} · ${esc((s.moves||[]).join(", "))}</span></td><td class="small">${status}</td>
      <td style="white-space:nowrap">${ui.bankDel===s.id
        ? `<span class="row" style="gap:6px"><button class="btn sm danger" data-act="bankDelYes" data-id="${esc(s.id)}">Eliminar</button><button class="btn sm" data-act="bankDelNo">No</button></span>`
        : `<span class="row" style="gap:6px"><button class="btn sm" data-act="bankEditOpen" data-id="${esc(s.id)}">Editar</button><button class="btn sm" data-act="bankDelAsk" data-id="${esc(s.id)}" ${free.has(s.id)?"":"disabled title=\"Está en un equipo o se está ofreciendo\""}>Borrar</button></span>`}</td></tr>`;
  };
  return `<div class="grid2">
    <div class="panel hot"><span class="eyebrow">Añadir Pokémon</span><h2>Banco de datos</h2>
      <p class="small">Pega uno o varios sets en formato de <b>Showdown</b> (separados por una línea en blanco) o carga un archivo <b>JSON</b>. La imagen y los tipos se ponen solos a partir del nombre.</p>
      <div class="row"><input type="file" id="bankFile" accept=".json,.txt,application/json,text/plain"></div>
      <textarea id="bankText" rows="10" placeholder="Garchomp @ Rocky Helmet&#10;Ability: Rough Skin&#10;Tera Type: Steel&#10;EVs: 252 HP / 4 Atk / 252 Spe&#10;Jolly Nature&#10;- Earthquake&#10;- Dragon Tail&#10;- Stealth Rock&#10;- Spikes"></textarea>
      <div class="row"><button class="btn primary" data-act="bankAdd">Añadir al banco</button>
      <button class="btn danger" data-act="bankReplace" ${st.phase!=="setup"?"disabled":""}>Sustituir banco entero</button></div>
      ${st.phase!=="setup"?`<span class="small muted">Sustituir el banco entero solo se puede antes del draft.</span>`:""}
      ${ui.bankMsg?`<p class="small" style="color:var(--green)">${esc(ui.bankMsg)}</p>`:""}</div>
    <div class="panel"><div class="row between"><span class="eyebrow">${sets.length} sets · ${free.size} libres</span>
      <input type="text" id="bankQ" data-bankq placeholder="Buscar…" value="${esc(ui.bankQ)}" style="width:180px"></div>
      <div class="scroll" style="max-height:640px"><table><thead><tr><th></th><th>Pokémon</th><th>Estado</th><th></th></tr></thead><tbody>
      ${shown.map(row).join("")||`<tr><td colspan="4" class="muted">${sets.length?"Nada coincide con la búsqueda.":"El banco está vacío. Pega sets de Showdown o carga un JSON."}</td></tr>`}
      </tbody></table></div></div></div>`;
}

/* ---------- Stream ---------- */
function viewStream(){
  const st=S.st, full=seesAll();
  let centre="";
  if(st.phase==="draft") centre=`<div class="panel hot"><span class="eyebrow">Draft en directo · elección ${st.draftRound||1} de 6</span>
    <div style="display:grid">${st.pairs.map(p=>{ const t=st.teams[p.id]||[]; const n=st.progress?.[p.id]??t.length; const o=st.draft?.[p.id]?.offer||[];
      return `<div class="offer-pair"><div class="row between"><h3>${esc(p.name)}</h3>${pips(n)}</div>
      ${!full?"":n<6?`<div class="opts">${o.map(id=>{const b=bankById(st,id);return `${sprite(b,"sm")}<span>${esc(b?.species||"")}</span>`;}).join(`<span class="or">O</span>`)}</div>`:`<span class="small" style="color:var(--green)">Equipo completo</span>`}</div>`; }).join("")}</div>
    ${full?"":`<p class="small muted">Las elecciones se verán al terminar el draft.</p>`}</div>`;
  else if(st.phase==="cards") centre=`<div class="panel hot"><span class="eyebrow">Cartas de la ronda ${st.round}</span>
    <div class="scards">${st.pairs.map(p=>{ const ch=st.cardChoices[p.id]; const offs=st.cardOffers[p.id]||[];
      return `<div class="scards-pair"><div class="row between"><h3>${esc(p.name)}</h3><span class="ready-pill${ch?" on":""}">${ch?"ELEGIDA":"…"}</span></div>
      ${offs.length?offs.map((o,i)=>cardChip(o,ch&&!ch.hidden&&ch.idx===i)).join(""):`<div class="card back">? ? ?</div>`}</div>`; }).join("")}</div></div>`;
  else if(st.phase==="reveal") centre=`<div class="panel hot"><span class="eyebrow">Revelación · cartas de la ronda ${st.reveal?.round||st.round}</span>${revealGrid(st,false)}</div>`;
  else if(st.phase==="battle") centre=`<div class="panel gold"><span class="eyebrow">Ronda ${st.round} de ${totalRounds(st)}</span><div style="display:grid;gap:10px">${matchesList(st,false)}</div></div>`;
  else if(st.phase==="finished") centre=`<div class="panel gold"><span class="eyebrow">Campeones</span><div class="bigtitle">${esc(standings(st)[0]?.name||"")}</div></div>`;
  else centre=`<div class="panel gold"><span class="eyebrow">${esc(PHASES[st.phase])}</span><div class="bigtitle">${st.phase==="setup"?"MUY PRONTO":st.round?`RONDA ${st.round} COMPLETADA`:"DRAFT TERMINADO"}</div>
    ${st.phase==="ready"&&st.schedule[st.round]?`<div style="display:grid;gap:8px"><span class="eyebrow">Próximos combates</span>${st.schedule[st.round].matches.map(m=>`<div class="match"><div class="side">${esc(pairName(st,m.a))}</div><span class="vs">VS</span><div class="side r">${esc(pairName(st,m.b))}</div></div>`).join("")}</div>`:""}</div>`;
  return `<main class="wrap">
    <div class="grid-s">
      <div class="panel"><span class="eyebrow">Clasificación</span>${standingsTable(st)}</div>
      ${centre}
      <div class="panel"><span class="eyebrow">En directo</span>${logList(st,14,"feed")}</div>
    </div>
    <div class="rosters" style="--cols:${st.pairs.length<=4?st.pairs.length:Math.ceil(st.pairs.length/2)}">${st.pairs.map(p=>`<div class="panel"><h3>${esc(p.name)}</h3>${rosterList(st,p.id,"sm")}</div>`).join("")}</div>
  </main>`;
}

/* ===================== Render ===================== */
function render(){
  const app=document.getElementById("app");
  const a=document.activeElement, fid=a&&a.id, ss=a&&"selectionStart" in a&&a.type!=="file"?[a.selectionStart,a.selectionEnd]:null;
  const scrollers={}; app.querySelectorAll(".scroll[style*=max-height],.log").forEach((el,i)=>scrollers[i]=el.scrollTop);
  const keep={}; app.querySelectorAll("input[id],textarea[id]:not([readonly])").forEach(el=>{ if(el.type!=="file" && el.dataset.dirty) keep[el.id]=el.value; });
  const stream=location.hash==="#stream" || !!STREAM_KEY;
  document.body.classList.toggle("stream", stream);
  let view;
  if(!S.st) view=viewLoading();
  else if(stream) view=viewStream();
  else if(S.you.role==="admin") view=viewAdmin();
  else if(S.you.role==="player") view=viewPlayer();
  else view=viewLogin();
  app.innerHTML=header()+view;
  for(const [id,v] of Object.entries(keep)){ const el=document.getElementById(id); if(el && !el.dataset.ui){ el.value=v; el.dataset.dirty="1"; } }
  app.querySelectorAll(".scroll[style*=max-height],.log").forEach((el,i)=>{ if(scrollers[i]) el.scrollTop=scrollers[i]; });
  if(fid){ const el=document.getElementById(fid); if(el){ el.focus({preventScroll:true}); if(ss&&el.setSelectionRange) try{el.setSelectionRange(ss[0],ss[1]);}catch{} } }
}
window.addEventListener("hashchange",render);
/* imagen que no carga → silueta */
document.addEventListener("error",e=>{ const img=e.target; if(img.tagName==="IMG"&&img.dataset.ico!==undefined){ img.remove(); return; } if(img.tagName==="IMG"&&img.dataset.spr!==undefined){ const s=document.createElement("span"); s.className=img.className+" none"; img.replaceWith(s); } },true);

/* ===================== Eventos ===================== */
document.addEventListener("submit",async e=>{
  if(e.target.id!=="loginForm") return;
  e.preventDefault();
  const code=document.getElementById("code").value.trim(), name=document.getElementById("name").value.trim();
  ui.busy=true; render();
  try{ const r=await post("/api/login",{code,name}); S.sid=r.sid; store.set("slowpoke-sid",r.sid); connect(); }
  catch(err){ toast(err.message); }
  finally{ ui.busy=false; render(); }
});
document.addEventListener("change",e=>{
  const k=e.target.dataset?.ui;
  if(k){ ui.p[k]=e.target.value;
    if(k==="tpair"){ delete ui.p.tslot; delete ui.p.tmove; }
    if(k==="tslot") delete ui.p.tmove;
    if(k==="own") delete ui.p.moveSlot;
    render(); return; }
  if(e.target.id==="bankFile"){ const f=e.target.files?.[0]; if(!f) return; const rd=new FileReader();
    rd.onload=()=>{ const ta=document.getElementById("bankText"); ta.value=rd.result; ta.dataset.dirty="1"; ui.bankMsg=`Archivo ${f.name} cargado. Revisa y pulsa Añadir o Sustituir.`; render(); }; rd.readAsText(f); }
});
document.addEventListener("input",e=>{
  if(e.target.id) e.target.dataset.dirty="1";
  if(e.target.dataset?.bankq!==undefined){ ui.bankQ=e.target.value; render(); return; }
  const k=e.target.dataset?.ui;
  if(k){ ui.p[k]=e.target.value; const b=document.querySelector('[data-act="confirmCard"]');
    const o=S.st?.cardOffers?.[S.you.pairId]?.[ui.card]; if(b) b.disabled=!o||!cardReady(o)||ui.busy; }
});
document.addEventListener("keydown",e=>{ if((e.key==="Enter"||e.key===" ")&&e.target.matches?.('[role="button"][data-act]')){ e.preventDefault(); e.target.click(); } });

document.addEventListener("click",async e=>{
  const el=e.target.closest("[data-act]"); if(!el) return;
  const a=el.dataset.act, st=S.st;
  if(a==="tab"){ ui.tab=el.dataset.tab; render(); return; }
  if(a==="copy"){ const ta=document.getElementById(el.dataset.target); if(!ta) return;
    try{ await navigator.clipboard.writeText(ta.value); toast("¡Copiado!"); }catch{ ta.focus(); ta.select(); toast("Pulsa Ctrl+C para copiar"); } return; }
  if(a==="logout"){ const sid=S.sid; S.sid=null; store.set("slowpoke-sid",null); post("/api/logout",{sid}).catch(()=>{}); connect(); render(); return; }
  /* Parejas */
  if(a==="pick"){ act("draftPick",{bankId:el.dataset.id}); return; }
  if(a==="ready"){ act("ready",{}); return; }
  if(a==="selCard"){ const i=Number(el.dataset.i); if(ui.card!==i){ ui.card=i; ui.p={}; } render(); return; }
  if(a==="bankPick"){ ui.p.bank=el.dataset.id; render(); return; }
  if(a==="confirmCard"){ const o=st.cardOffers[S.you.pairId]?.[ui.card]; if(!o) return; const params={};
    CARDS[o.card].params.forEach(k=>params[k]=ui.p[k]); act("chooseCard",{idx:ui.card,params}); return; }
  /* Organización */
  if(S.you.role!=="admin") return;
  if(a==="askReset"){ ui.confirmReset=true; render(); return; }
  if(a==="cancelReset"){ ui.confirmReset=false; render(); return; }
  if(a==="edit"){ ui.editing={p:el.dataset.p,b:el.dataset.b}; render(); return; }
  if(a==="cancelEdit"){ ui.editing=null; render(); return; }
  if(a==="savePairs"){ const names={}, codes={};
    st.pairs.forEach(p=>{ names[p.id]=document.getElementById("pname-"+p.id).value; codes[p.id]=document.getElementById("pcode-"+p.id).value; });
    if(await act("savePairs",{names,codes})){ document.querySelectorAll('[id^="pname-"],[id^="pcode-"]').forEach(x=>delete x.dataset.dirty); toast("Parejas guardadas"); render(); } return; }
  if(a==="setPairsN"){ act("setPairsN",{n:Number(document.getElementById("npairs").value)}); return; }
  if(a==="kick"){ act("kick",{sid:el.dataset.sid}); return; }
  if(["startDraft","startRound","closeRound","resolveNow","simDraft","simResults","simCards","simReady"].includes(a)){ act(a,{}); return; }
  if(a==="forceRound"){ act("startRound",{force:true}); return; }
  if(a==="reroll"){ act("reroll",{pid:el.dataset.p}); return; }
  if(a==="result"){ act("result",{mi:el.dataset.m,pid:el.dataset.p}); return; }
  if(a==="saveEdit"){ const {p,b}=ui.editing; if(await act("editSet",{pid:p,bankId:b,paste:document.getElementById("editPaste").value})){ ui.editing=null; render(); } return; }
  if(a==="reset"){ ui.confirmReset=false; act("reset",{}); return; }
  if(a==="bankAdd"||a==="bankReplace"){ const ta=document.getElementById("bankText");
    if(await act(a,{text:ta.value})){ ta.value=""; delete ta.dataset.dirty; ui.bankMsg="Banco actualizado. Las imágenes aparecen en unos segundos."; render(); } return; }
  if(a==="bankEditOpen"){ ui.bankEdit=el.dataset.id; ui.bankDel=null; render(); return; }
  if(a==="bankCancel"){ ui.bankEdit=null; render(); return; }
  if(a==="bankSave"){ const ta=document.getElementById("bankEditText"); if(await act("bankEdit",{id:el.dataset.id,paste:ta.value})){ ui.bankEdit=null; toast("Pokémon guardado"); render(); } return; }
  if(a==="bankDelAsk"){ ui.bankDel=el.dataset.id; ui.bankEdit=null; render(); return; }
  if(a==="bankDelNo"){ ui.bankDel=null; render(); return; }
  if(a==="bankDelYes"){ if(await act("bankDelete",{id:el.dataset.id})){ ui.bankDel=null; toast("Eliminado del banco"); render(); } return; }
});

render();
connect();
