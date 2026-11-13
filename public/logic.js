/* Slowpoke League — reglas del juego.
   Lo usa el servidor (que es quien decide) y el navegador (para mostrar datos). */
(function (root) {
  const TYPES = {Normal:["Normal","#9a9a7a"],Fire:["Fuego","#e2733a"],Water:["Agua","#4a86d9"],Grass:["Planta","#5aa846"],Electric:["Eléctrico","#d9b52a"],Ice:["Hielo","#5fc0c9"],Fighting:["Lucha","#c03a33"],Poison:["Veneno","#9a4bb0"],Ground:["Tierra","#c69a4a"],Flying:["Volador","#8e9be8"],Psychic:["Psíquico","#e5507a"],Bug:["Bicho","#94a827"],Rock:["Roca","#b09c50"],Ghost:["Fantasma","#6a5a9a"],Dragon:["Dragón","#6a4fe0"],Dark:["Siniestro","#6f5b50"],Steel:["Acero","#8a9aac"],Fairy:["Hada","#e08ec0"],Stellar:["Astral","#7aa0c0"]};
  const NATURES = ["Adamant","Bashful","Bold","Brave","Calm","Careful","Docile","Gentle","Hardy","Hasty","Impish","Jolly","Lax","Lonely","Mild","Modest","Naive","Naughty","Quiet","Quirky","Rash","Relaxed","Sassy","Serious","Timid"];
  const STATS = [["hp","HP"],["atk","Atk"],["def","Def"],["spa","SpA"],["spd","SpD"],["spe","Spe"]];
  const PHASES = {setup:"Preparación",draft:"Draft",ready:"Entre rondas",battle:"Combates",cards:"Cartas",reveal:"Revelación",finished:"Final"};
  const RARITY_LABEL = {comun:"Común",rara:"Rara",epica:"Épica",legendaria:"Legendaria"};
  const KIND_LABEL = {mejora:"Mejora",ventaja:"Ventaja",sabotaje:"Sabotaje",caos:"Caos"};

  /* Catálogo de cartas. Para añadir una carta nueva: añádela aquí y su efecto en applyCard().
     icon: nombre de un objeto de la PokéAPI (por ejemplo "toxic-orb", "leftovers") o "pokemon:NÚMERO".
     params posibles: own, moveSlot, moveName, item, nature, bank, tpair, tslot, tmove */
  const CARDS = {
    fichaje:     {icon:"great-ball", name:"Fichaje", rarity:"rara", kind:"mejora", text:"Cambia uno de tus Pokémon por uno de estos tres del banco.", params:["own","bank"]},
    tutor:       {icon:"tm-normal", name:"Tutor de movimientos", rarity:"comun", kind:"mejora", text:"Enseña un movimiento a uno de tus Pokémon en lugar de otro.", params:["own","moveSlot","moveName"]},
    mercader:    {icon:"amulet-coin", name:"Mercader", rarity:"comun", kind:"mejora", text:"Cambia el objeto de uno de tus Pokémon.", params:["own","item"]},
    mentas:      {icon:"adamant-mint", name:"Menta", rarity:"comun", kind:"mejora", text:"Cambia la naturaleza de uno de tus Pokémon.", params:["own","nature"]},
    proteccion:  {icon:"protective-pads", name:"Protección", rarity:"rara", kind:"ventaja", text:"Anula la próxima carta de sabotaje que os lancen.", params:[]},
    toxiesfera:  {icon:"toxic-orb", name:"Toxiesfera", rarity:"comun", kind:"sabotaje", text:"Equipa una Toxiesfera a un Pokémon rival.", params:["tpair","tslot"]},
    malosgenes:  {icon:"iron-ball", name:"Malos genes", rarity:"comun", kind:"sabotaje", text:"Los IVs de Velocidad de un Pokémon rival pasan a 0.", params:["tpair","tslot"]},
    desentrenado:{icon:"pomeg-berry", name:"Desentrenado", rarity:"rara", kind:"sabotaje", text:"Un Pokémon rival pierde todos sus EVs.", params:["tpair","tslot"]},
    amnesia:     {icon:"pokemon:129", name:"Amnesia", rarity:"rara", kind:"sabotaje", text:"Un movimiento de un Pokémon rival se convierte en Salpicadura.", params:["tpair","tslot","tmove"]},
    ladron:      {icon:"pokemon:52", name:"Ladrón", rarity:"rara", kind:"sabotaje", text:"Roba el objeto de un Pokémon rival y dáselo a uno tuyo.", params:["tpair","tslot","own"]},
    banquillo:   {icon:"smoke-ball", name:"Banquillo", rarity:"epica", kind:"sabotaje", text:"Un Pokémon rival no podrá usarse en el próximo combate.", params:["tpair","tslot"]},
    forzoso:     {icon:"red-card", name:"Fichaje forzoso", rarity:"legendaria", kind:"caos", text:"Intercambia uno de tus Pokémon por uno de otra pareja. Ellos no eligen.", params:["own","tpair","tslot"]},
  };
  const NEGATIVE = new Set(["sabotaje","caos"]);
  /* Probabilidad de cada rareza. Quien pierde el combate tiene mejores cartas. */
  const WEIGHTS = {normal:{comun:55,rara:30,epica:11,legendaria:4}, loser:{comun:35,rara:38,epica:19,legendaria:8}};

  /* ---------- utilidades ---------- */
  const clone = o => JSON.parse(JSON.stringify(o));
  const slug = s => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") || "set";
  const rnd = n => Math.floor(Math.random()*n);
  const shuffle = a => { for(let i=a.length-1;i>0;i--){const j=rnd(i+1);[a[i],a[j]]=[a[j],a[i]];} return a; };
  const code4 = () => "SLOW-" + Array.from({length:4},()=>"ABCDEFGHJKMNPQRSTUVWXYZ23456789"[rnd(31)]).join("");
  class GameError extends Error {}
  const fail = msg => { throw new GameError(msg); };

  /* ---------- formato Showdown ---------- */
  function toPaste(s){
    const L=[];
    L.push(`${s.species}${s.item?` @ ${s.item}`:""}`);
    if(s.ability) L.push(`Ability: ${s.ability}`);
    if(s.level && Number(s.level)!==100) L.push(`Level: ${s.level}`);
    if(s.teraType) L.push(`Tera Type: ${s.teraType}`);
    const ev=STATS.filter(([k])=>Number(s.evs?.[k]||0)>0).map(([k,l])=>`${s.evs[k]} ${l}`);
    if(ev.length) L.push(`EVs: ${ev.join(" / ")}`);
    if(s.nature) L.push(`${s.nature} Nature`);
    const iv=STATS.filter(([k])=>s.ivs && s.ivs[k]!==undefined && Number(s.ivs[k])!==31).map(([k,l])=>`${s.ivs[k]} ${l}`);
    if(iv.length) L.push(`IVs: ${iv.join(" / ")}`);
    (s.moves||[]).filter(Boolean).forEach(m=>L.push(`- ${m}`));
    return L.join("\n");
  }
  const teamPaste = team => (team||[]).map(toPaste).join("\n\n");

  function parsePaste(text){
    const blocks=String(text).replace(/\r/g,"").split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
    const out=[];
    for(const b of blocks){
      const lines=b.split("\n").map(l=>l.trim()).filter(Boolean);
      if(!lines.length) continue;
      let first=lines[0], item="";
      const at=first.lastIndexOf(" @ ");
      if(at>=0){ item=first.slice(at+3).trim(); first=first.slice(0,at).trim(); }
      first=first.replace(/\s*\((M|F)\)\s*$/,"").trim();
      const m=first.match(/^(.*)\(([^()]+)\)\s*$/);
      const species=(m?m[2]:first).trim();
      if(!species) continue;
      const s={species,item,ability:"",nature:"",level:100,teraType:"",evs:{},ivs:{},moves:[]};
      STATS.forEach(([k])=>{s.evs[k]=0;s.ivs[k]=31;});
      const statOf=l=>{const f=STATS.find(([,x])=>x.toLowerCase()===String(l).toLowerCase());return f&&f[0];};
      for(const l of lines.slice(1)){
        if(l.startsWith("- ")) s.moves.push(l.slice(2).replace(/\s*\[.*\]$/,"").trim());
        else if(/^Ability:/i.test(l)) s.ability=l.split(":")[1].trim();
        else if(/^Level:/i.test(l)) s.level=Number(l.split(":")[1])||100;
        else if(/^Tera Type:/i.test(l)) s.teraType=l.split(":")[1].trim();
        else if(/^EVs:/i.test(l)||/^IVs:/i.test(l)){
          const tgt=/^EVs/i.test(l)?s.evs:s.ivs;
          l.slice(4).split("/").forEach(p=>{const [n,st]=p.trim().split(/\s+/);const k=statOf(st||"");if(k)tgt[k]=Number(n)||0;});
        }
        else if(/ Nature$/i.test(l)) s.nature=l.replace(/ Nature$/i,"").trim();
      }
      s.moves=s.moves.slice(0,4);
      out.push(s);
    }
    return out;
  }
  function normalizeSet(raw){
    const s={species:String(raw.species||raw.name||"").trim(),item:raw.item||"",ability:raw.ability||"",nature:raw.nature||"",
      level:Number(raw.level)||100,teraType:raw.teraType||raw.tera||"",types:Array.isArray(raw.types)?raw.types:[],
      evs:{},ivs:{},moves:Array.isArray(raw.moves)?raw.moves.slice(0,4):[]};
    STATS.forEach(([k])=>{s.evs[k]=Number(raw.evs?.[k]||0); s.ivs[k]=raw.ivs?.[k]===undefined?31:Number(raw.ivs[k]);});
    if(raw.id) s.id=slug(raw.id);
    return s;
  }
  /* Acepta JSON (lista o {sets:[...]}) o texto exportado de Showdown */
  function parseBankText(text){
    const t=String(text||"").trim();
    if(!t) return [];
    let list;
    if(t[0]==="{"||t[0]==="["){
      let j; try{ j=JSON.parse(t); }catch(e){ fail("El JSON no es válido: "+e.message); }
      list=(Array.isArray(j)?j:(j.sets||j.pokemon||[])).map(normalizeSet);
    } else list=parsePaste(t).map(normalizeSet);
    return list.filter(s=>s.species);
  }
  function assignIds(list, existing){
    const used=new Set(existing||[]);
    return list.map(s=>{ let base=s.id||slug(s.species), id=base, i=2; while(used.has(id)) id=`${base}-${i++}`; used.add(id); return {...s,id}; });
  }

  /* ---------- Pokédex: nombre de Showdown -> [número, tipos] ---------- */
  function dexKey(name){
    let k=slug(String(name).replace(/['’.:]/g,""));
    k=k.replace(/-f$/,"-female").replace(/-m$/,"-male");
    return k;
  }
  function resolveDex(name, dex){
    if(!dex) return null; const k=dexKey(name);
    if(dex[k]) return dex[k];
    if(dex[k+"-mask"]) return dex[k+"-mask"];
    const pre=Object.keys(dex).find(x=>x.startsWith(k+"-")); return pre?dex[pre]:null;
  }
  /* Rellena número de pokédex y tipos si faltan. Devuelve los sets que no se han encontrado. */
  function enrichSets(sets, dex){
    const missing=[];
    for(const s of sets){
      if(s.dex && (s.types||[]).length) continue;
      const r=resolveDex(s.species, dex);
      if(r){ if(!s.dex) s.dex=r[0]; if(!(s.types||[]).length) s.types=r[1].split("/").filter(Boolean); }
      else missing.push(s);
    }
    return missing;
  }
  const cardIconUrl = icon => !icon ? "" : String(icon).startsWith("pokemon:")
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${String(icon).slice(8)}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/${icon}.png`;
  const spriteUrl = dexNo => dexNo ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNo}.png` : "";

  /* ---------- estado ---------- */
  function initState(pairs, bank){
    pairs = pairs || Array.from({length:8},(_,i)=>({id:`p${i+1}`,name:`Pareja ${i+1}`}));
    const codes={}; pairs.forEach(p=>codes[p.id]=code4());
    return {v:0, phase:"setup", round:0, pairs, codes, sessions:{}, streamKey:code4().slice(5)+code4().slice(5)+code4().slice(5),
      bank: bank || [], teams:{}, draft:{}, schedule:[], results:{}, cardOffers:{}, cardChoices:{},
      shields:{}, benched:{}, log:[]};
  }
  const pairName = (st,id) => (st.pairs.find(p=>p.id===id)||{}).name || id;
  const bankById = (st,id) => (st.bank||[]).find(s=>s.id===id);
  const totalRounds = st => st.pairs.length-1;
  /* secret: pareja que puede verlo mientras dure el draft (el resto lo ve al terminar) */
  function addLog(st, kind, text, secret){ const e={t:Date.now(), r:st.round, kind, text}; if(secret) e.secret=secret; st.log.push(e); if(st.log.length>500) st.log=st.log.slice(-500); }

  function availableIds(st){
    const used=new Set();
    Object.values(st.teams||{}).forEach(t=>t.forEach(s=>used.add(s.bankId)));
    Object.values(st.draft||{}).forEach(d=>(d.offer||[]).forEach(i=>used.add(i)));
    Object.values(st.cardOffers||{}).forEach(arr=>arr.forEach(o=>(o.options||[]).forEach(i=>used.add(i))));
    return (st.bank||[]).map(s=>s.id).filter(id=>!used.has(id));
  }
  const drawN = (st,n) => shuffle(availableIds(st)).slice(0,n);
  function fromBank(st,id){ const b=bankById(st,id); if(!b) return null; const s=clone(b); s.bankId=b.id; delete s.id; s.mods=[]; return s; }

  function standings(st){
    const rows=st.pairs.map(p=>({id:p.id,name:p.name,w:0,l:0})); const m=Object.fromEntries(rows.map(r=>[r.id,r]));
    (st.schedule||[]).forEach((rd,ri)=>{ const res=st.results?.["r"+(ri+1)]||{};
      rd.matches.forEach((mt,mi)=>{ const w=res[mi]; if(!w||!m[w]) return; const l=w===mt.a?mt.b:mt.a; m[w].w++; if(m[l]) m[l].l++; }); });
    return rows.sort((a,b)=>b.w-a.w||a.l-b.l||a.name.localeCompare(b.name));
  }
  function roundRobin(ids){
    const a=shuffle(ids.slice()), n=a.length, rounds=[];
    for(let r=0;r<n-1;r++){
      const matches=[]; for(let i=0;i<n/2;i++) matches.push({a:a[i],b:a[n-1-i]});
      rounds.push({matches}); a.splice(1,0,a.pop());
    }
    return rounds;
  }
  const currentMatches = st => st.schedule?.[st.round-1]?.matches || [];
  function findMon(st,pid,bankId){ const t=st.teams[pid]||[]; const i=t.findIndex(s=>s.bankId===bankId); return i<0?null:{team:t,i,s:t[i]}; }

  /* ---------- cartas ---------- */
  function drawRarity(loser){
    const w=WEIGHTS[loser?"loser":"normal"]; const total=Object.values(w).reduce((a,b)=>a+b,0);
    let x=Math.random()*total; for(const [k,v] of Object.entries(w)){ if((x-=v)<0) return k; } return "comun";
  }
  function dealCards(st){
    const res=st.results["r"+st.round]||{}; const losers=new Set();
    currentMatches(st).forEach((m,i)=>{ const w=res[i]; if(w) losers.add(w===m.a?m.b:m.a); });
    st.cardOffers={}; st.cardChoices={};
    for(const p of st.pairs){
      const offers=[]; st.cardOffers[p.id]=offers; let guard=0;
      while(offers.length<3 && guard++<80){
        const rar=drawRarity(losers.has(p.id));
        const pool=Object.keys(CARDS).filter(k=>CARDS[k].rarity===rar && !offers.some(o=>o.card===k));
        if(!pool.length) continue;
        const card=pool[rnd(pool.length)]; const o={card};
        if(card==="fichaje"){ const opts=drawN(st,3); if(!opts.length) continue; o.options=opts; }
        offers.push(o);
      }
    }
    addLog(st,"carta",`Se reparten las cartas de la ronda ${st.round}.`);
  }
  function applyCard(st, pid, choice){
    const offer=(st.cardOffers[pid]||[])[choice.idx]; if(!offer) return;
    const c=CARDS[offer.card], P=choice.params||{}, me=pairName(st,pid), tag=`R${st.round}`;
    const fizz=why=>addLog(st,"carta",`${me} juega ${c.name}, pero no tiene efecto (${why}).`);
    if(NEGATIVE.has(c.kind)){
      if(!P.tpair || P.tpair===pid || !st.teams[P.tpair]) return fizz("objetivo no válido");
      if((st.shields[P.tpair]||0)>0){ st.shields[P.tpair]--; addLog(st,"sabotaje",`${me} lanza ${c.name} contra ${pairName(st,P.tpair)}, pero su Protección la bloquea.`); return; }
    }
    const own=P.own?findMon(st,pid,P.own):null, tgt=P.tslot&&P.tpair?findMon(st,P.tpair,P.tslot):null;
    const tn=P.tpair?pairName(st,P.tpair):"";
    switch(offer.card){
      case "fichaje":{ if(!own) return fizz("el Pokémon ya no está");
        if(!(offer.options||[]).includes(P.bank)) return fizz("fichaje no válido");
        const n=fromBank(st,P.bank); if(!n) return fizz("no está en el banco"); n.mods.push(`${tag}: fichado`);
        const old=own.s.species; own.team[own.i]=n; addLog(st,"carta",`${me} ficha a ${n.species} y devuelve a ${old} al banco.`); break; }
      case "tutor":{ if(!own) return fizz("el Pokémon ya no está"); const i=Number(P.moveSlot); const mv=String(P.moveName||"").trim(); if(!mv||!(i>=0&&i<4)) return fizz("faltan datos");
        const old=own.s.moves[i]||"—"; own.s.moves[i]=mv; own.s.mods.push(`${tag}: ${mv} por ${old}`); addLog(st,"carta",`${me}: ${own.s.species} aprende ${mv} (olvida ${old}).`); break; }
      case "mercader":{ if(!own) return fizz("el Pokémon ya no está"); const it=String(P.item||"").trim(); if(!it) return fizz("faltan datos");
        own.s.mods.push(`${tag}: objeto ${it}`); addLog(st,"carta",`${me}: ${own.s.species} cambia ${own.s.item||"nada"} por ${it}.`); own.s.item=it; break; }
      case "mentas":{ if(!own||!NATURES.includes(P.nature)) return fizz("faltan datos");
        own.s.mods.push(`${tag}: ${P.nature}`); addLog(st,"carta",`${me}: ${own.s.species} pasa a naturaleza ${P.nature}.`); own.s.nature=P.nature; break; }
      case "proteccion":{ st.shields[pid]=(st.shields[pid]||0)+1; addLog(st,"carta",`${me} activa Protección.`); break; }
      case "toxiesfera":{ if(!tgt) return fizz("el Pokémon ya no está"); tgt.s.item="Toxic Orb"; tgt.s.mods.push(`${tag}: Toxiesfera (${me})`);
        addLog(st,"sabotaje",`${me} equipa una Toxiesfera a ${tgt.s.species} de ${tn}.`); break; }
      case "malosgenes":{ if(!tgt) return fizz("el Pokémon ya no está"); tgt.s.ivs.spe=0; tgt.s.mods.push(`${tag}: 0 IVs Vel (${me})`);
        addLog(st,"sabotaje",`${me} deja a ${tgt.s.species} de ${tn} con 0 IVs de Velocidad.`); break; }
      case "desentrenado":{ if(!tgt) return fizz("el Pokémon ya no está"); STATS.forEach(([k])=>tgt.s.evs[k]=0); tgt.s.mods.push(`${tag}: sin EVs (${me})`);
        addLog(st,"sabotaje",`${me} quita todos los EVs a ${tgt.s.species} de ${tn}.`); break; }
      case "amnesia":{ const i=Number(P.tmove); if(!tgt||!(i>=0&&i<4)) return fizz("faltan datos"); const old=tgt.s.moves[i]||"—"; tgt.s.moves[i]="Splash";
        tgt.s.mods.push(`${tag}: ${old} → Splash (${me})`); addLog(st,"sabotaje",`${me}: ${tgt.s.species} de ${tn} olvida ${old} y aprende Salpicadura.`); break; }
      case "ladron":{ if(!tgt||!own) return fizz("el Pokémon ya no está"); const it=tgt.s.item||""; if(!it) return fizz("el rival no llevaba objeto");
        tgt.s.item=""; tgt.s.mods.push(`${tag}: le roban ${it} (${me})`); own.s.item=it; own.s.mods.push(`${tag}: roba ${it}`);
        addLog(st,"sabotaje",`${me} roba ${it} a ${tgt.s.species} de ${tn} y se lo da a ${own.s.species}.`); break; }
      case "banquillo":{ if(!tgt) return fizz("el Pokémon ya no está"); (st.benched[P.tpair]=st.benched[P.tpair]||[]).push({bankId:tgt.s.bankId,round:st.round+1});
        tgt.s.mods.push(`${tag}: banquillo R${st.round+1} (${me})`); addLog(st,"sabotaje",`${me} manda al banquillo a ${tgt.s.species} de ${tn} para la ronda ${st.round+1}.`); break; }
      case "forzoso":{ if(!tgt||!own) return fizz("el Pokémon ya no está"); const a=own.s, b=tgt.s;
        a.mods.push(`${tag}: cedido a ${tn}`); b.mods.push(`${tag}: robado por ${me}`); own.team[own.i]=b; tgt.team[tgt.i]=a;
        addLog(st,"sabotaje",`${me} cambia su ${a.species} por el ${b.species} de ${tn}.`); break; }
    }
  }
  /* Se resuelven de la última pareja de la clasificación a la primera */
  /* Texto corto de lo que una pareja ha elegido, con los nombres de los Pokémon */
  function describeChoice(st,pid,ch,offer){
    if(!offer) return ""; const c=CARDS[offer.card], P=ch.params||{}, bits=[];
    const sp=(p,id)=>(st.teams[p]||[]).find(s=>s.bankId===id)?.species;
    if(P.tpair) bits.push(`contra ${pairName(st,P.tpair)}${P.tslot?` (${sp(P.tpair,P.tslot)||"?"})`:""}`);
    if(P.own) bits.push(`sobre ${sp(pid,P.own)||"?"}`);
    if(P.bank) bits.push(`ficha a ${bankById(st,P.bank)?.species||"?"}`);
    if(P.moveName) bits.push(`→ ${P.moveName}`); if(P.item) bits.push(`→ ${P.item}`); if(P.nature) bits.push(`→ ${P.nature}`);
    return bits.join(" ");
  }
  /* Se resuelven de la última pareja de la clasificación a la primera.
     Después se pasa a la revelación: todas ven qué ha elegido cada una y qué ha pasado,
     y cada pareja marca que está lista. */
  function resolveCards(st){
    const table=standings(st); const rank=Object.fromEntries(table.map((r,i)=>[r.id,i]));
    const order=Object.keys(st.cardChoices).sort((a,b)=>(rank[b]-rank[a])||(Math.random()-.5));
    addLog(st,"carta","Se resuelven las cartas, de la última pareja a la primera.");
    const entries=[];
    for(const pid of order){
      const ch=st.cardChoices[pid], offer=(st.cardOffers[pid]||[])[ch.idx];
      const desc=describeChoice(st,pid,ch,offer); const before=st.log.length;
      applyCard(st,pid,ch);
      entries.push({pid, card:offer?.card||null, desc, outcome:st.log.slice(before).map(l=>l.text)});
    }
    st.pairs.filter(p=>!st.cardChoices[p.id]).forEach(p=>entries.push({pid:p.id, card:null, desc:"", outcome:["No eligió carta a tiempo."]}));
    st.reveal={round:st.round, entries}; st.ready={};
    st.cardOffers={}; st.cardChoices={};
    st.phase="reveal";
  }

  /* ---------- draft por rondas: todas eligen a la vez; cuando han elegido todas, salen las siguientes opciones ---------- */
  function dealDraftRound(st){
    for(const p of shuffle(st.pairs.slice())){ st.draft[p.id]={offer:drawN(st,2)};
      if(!st.draft[p.id].offer.length) addLog(st,"info",`El banco se ha quedado sin Pokémon para ${pairName(st,p.id)}.`); }
  }
  function advanceDraft(st){
    const r=st.draftRound||1;
    if(!st.pairs.every(p=>(st.teams[p.id]||[]).length>=r)) return;
    if(r>=6){ st.phase="ready"; st.draft={}; addLog(st,"draft","Draft terminado. Todos los equipos están completos."); return; }
    st.draftRound=r+1; dealDraftRound(st);
    addLog(st,"draft",`Todas las parejas han elegido. Empieza la elección ${st.draftRound} de 6.`);
  }

  /* ---------- acciones de participantes ---------- */
  function playerAction(st, pid, action, d){
    d=d||{};
    if(action==="draftPick"){
      const dr=st.draft[pid]; const team=st.teams[pid]=st.teams[pid]||[];
      if(st.phase!=="draft"||!dr||!dr.offer.includes(d.bankId)||team.length>=(st.draftRound||6)) fail("Esta elección ya no es válida.");
      const s=fromBank(st,d.bankId); if(!s) fail("Ese Pokémon ya no está en el banco.");
      const other=dr.offer.find(x=>x!==d.bankId); team.push(s);
      addLog(st,"draft",`${pairName(st,pid)} elige a ${s.species}${other?` y descarta a ${bankById(st,other)?.species||other}`:""} (${team.length}/6).`, pid);
      dr.offer=[];                                   /* el descartado vuelve al banco */
      advanceDraft(st);
      return;
    }
    if(action==="chooseCard"){
      if(st.phase!=="cards"||st.cardChoices[pid]) fail("Ya habéis elegido carta o no es momento de elegir.");
      const idx=Number(d.idx); const o=(st.cardOffers[pid]||[])[idx]; if(!o) fail("Carta no válida.");
      const need=CARDS[o.card].params; const p={};
      for(const k of need){ const v=d.params?.[k]; if(v===undefined||v===null||v==="") fail("Faltan datos de la carta."); p[k]=String(v).slice(0,60); }
      st.cardChoices[pid]={idx, params:p, at:Date.now()};
      addLog(st,"carta",`${pairName(st,pid)} ya ha elegido carta.`);
      if(st.pairs.every(x=>st.cardChoices[x.id])) resolveCards(st);
      return;
    }
    if(action==="ready"){
      if(st.phase!=="reveal") fail("Ahora no hace falta marcar que estáis listos.");
      st.ready=st.ready||{}; if(st.ready[pid]) return;
      st.ready[pid]=true; addLog(st,"info",`${pairName(st,pid)} está lista.`);
      return;
    }
    fail("Acción desconocida.");
  }

  /* ---------- acciones de la organización ---------- */
  function adminAction(st, action, d){
    d=d||{};
    switch(action){
      case "savePairs":{
        const codes={};
        st.pairs.forEach(p=>{ const n=String(d.names?.[p.id]||"").trim().slice(0,40); if(n) p.name=n;
          codes[p.id]=String(d.codes?.[p.id]||"").trim().toUpperCase().slice(0,20)||st.codes[p.id]||code4(); });
        if(new Set(Object.values(codes)).size!==st.pairs.length) fail("Cada pareja necesita un código distinto.");
        st.codes=codes; return;
      }
      case "setPairsN":{
        if(st.phase!=="setup") fail("Solo se puede cambiar antes del draft.");
        const n=Number(d.n); if(![4,6,8,10].includes(n)) fail("Número de parejas no válido.");
        const old=st.pairs; st.pairs=Array.from({length:n},(_,i)=>old[i]||{id:`p${i+1}`,name:`Pareja ${i+1}`});
        st.pairs.forEach(p=>{ if(!st.codes[p.id]) st.codes[p.id]=code4(); });
        Object.keys(st.codes).forEach(k=>{ if(!st.pairs.some(p=>p.id===k)) delete st.codes[k]; });
        Object.keys(st.sessions).forEach(t=>{ const s=st.sessions[t]; if(s.role==="player"&&!st.pairs.some(p=>p.id===s.pairId)) delete st.sessions[t]; });
        return;
      }
      case "kick":{ const s=st.sessions[d.sid]; if(s&&s.role==="player") delete st.sessions[d.sid]; return; }
      case "startDraft":{
        if(st.phase!=="setup") fail("El draft ya ha empezado.");
        if((st.bank||[]).length<st.pairs.length*2) fail("No hay suficientes Pokémon en el banco.");
        st.schedule=roundRobin(st.pairs.map(p=>p.id)); st.teams={}; st.draft={}; st.phase="draft"; st.round=0;
        for(const p of st.pairs) st.teams[p.id]=[];
        st.draftRound=1; dealDraftRound(st);
        addLog(st,"draft","¡Empieza el draft! Cada pareja tiene sus dos primeras opciones."); return;
      }
      case "reroll":{
        const pid=d.pid; if(st.phase!=="draft"||!st.draft[pid]||(st.teams[pid]||[]).length>=st.draftRound) fail("Esa pareja ya ha elegido en esta ronda del draft.");
        st.draft[pid].offer=[]; st.draft[pid].offer=drawN(st,2);
        addLog(st,"info",`La organización vuelve a sortear las opciones de ${pairName(st,pid)}.`); return;
      }
      case "startRound":{
        if(!["ready","reveal"].includes(st.phase)||st.round>=totalRounds(st)) fail("No se puede empezar ronda ahora.");
        if(st.phase==="reveal" && !d.force && !st.pairs.every(p=>st.ready?.[p.id])) fail("Aún hay parejas que no están listas.");
        st.ready={};
        st.round++; st.phase="battle";
        Object.keys(st.benched).forEach(k=>st.benched[k]=st.benched[k].filter(b=>b.round>=st.round));
        addLog(st,"info",`Empieza la ronda ${st.round}: ${currentMatches(st).map(m=>`${pairName(st,m.a)} vs ${pairName(st,m.b)}`).join(", ")}.`); return;
      }
      case "result":{
        if(st.phase!=="battle") fail("No hay combates en curso.");
        const mi=String(d.mi), pid=d.pid, m=currentMatches(st)[mi]; if(!m||(m.a!==pid&&m.b!==pid)) fail("Combate no válido.");
        const k="r"+st.round; st.results[k]=st.results[k]||{};
        if(st.results[k][mi]===pid) delete st.results[k][mi];
        else { st.results[k][mi]=pid; addLog(st,"info",`${pairName(st,pid)} gana a ${pairName(st,m.a===pid?m.b:m.a)}.`); }
        return;
      }
      case "closeRound":{
        if(st.phase!=="battle") fail("No hay ronda que cerrar.");
        const res=st.results["r"+st.round]||{}; if(!currentMatches(st).every((_,i)=>res[i])) fail("Faltan resultados.");
        if(st.round>=totalRounds(st)){ st.phase="finished"; addLog(st,"info",`Fin de la liga. Campeones: ${standings(st)[0].name}.`); }
        else { dealCards(st); st.phase="cards"; }
        return;
      }
      case "resolveNow":{ if(st.phase!=="cards") fail("No hay cartas pendientes."); resolveCards(st); return; }
      case "editSet":{
        const parsed=parsePaste(d.paste||"")[0]; if(!parsed) fail("No se ha podido leer el set.");
        const f=findMon(st,d.pid,d.bankId); if(!f) fail("Ese Pokémon ya no está en el equipo.");
        const n=normalizeSet(parsed); delete n.id;
        f.team[f.i]={...n, types:f.s.types, dex:f.s.dex, bankId:d.bankId, mods:[...(f.s.mods||[]),"Editado por la organización"]};
        addLog(st,"info",`La organización edita a ${n.species} de ${pairName(st,d.pid)}.`); return;
      }
      case "bankAdd":
      case "bankReplace":{
        const list=parseBankText(d.text); if(!list.length) fail("No se ha encontrado ningún Pokémon en el texto.");
        if(action==="bankReplace" && st.phase!=="setup") fail("Solo se puede sustituir el banco antes del draft.");
        const base = action==="bankAdd" ? (st.bank||[]) : [];
        st.bank = base.concat(assignIds(list, base.map(s=>s.id)));
        addLog(st,"info",`Banco actualizado: ${list.length} Pokémon ${action==="bankAdd"?"añadidos":"cargados"} (${st.bank.length} en total).`);
        return;
      }
      /* ---- Modo prueba: la app juega por las parejas que no han hecho su parte ---- */
      case "simDraft":{
        if(st.phase!=="draft") fail("No hay draft en curso.");
        let n=0; const r=st.draftRound;
        for(const p of st.pairs){ if(st.phase!=="draft"||st.draftRound!==r) break; const o=st.draft[p.id]?.offer||[];
          if(o.length && (st.teams[p.id]||[]).length<r){ playerAction(st,p.id,"draftPick",{bankId:o[rnd(o.length)]}); n++; } }
        if(!n) fail("No queda nada que elegir.");
        return;
      }
      case "simResults":{
        if(st.phase!=="battle") fail("No hay combates en curso.");
        const k="r"+st.round; st.results[k]=st.results[k]||{};
        currentMatches(st).forEach((m,i)=>{ if(!st.results[k][i]){ const w=Math.random()<.5?m.a:m.b; st.results[k][i]=w; addLog(st,"info",`${pairName(st,w)} gana a ${pairName(st,w===m.a?m.b:m.a)} (prueba).`); } });
        return;
      }
      case "simReady":{
        if(st.phase!=="reveal") fail("No hay revelación en curso.");
        st.pairs.forEach(p=>{ if(!st.ready?.[p.id]) playerAction(st,p.id,"ready",{}); }); return;
      }
      case "simCards":{
        if(st.phase!=="cards") fail("No hay cartas pendientes.");
        const pending=st.pairs.filter(p=>!st.cardChoices[p.id]);
        if(!pending.length) fail("Todas las parejas han elegido ya.");
        for(const p of pending){ if(st.phase!=="cards") break; const offs=st.cardOffers[p.id]||[]; if(!offs.length) continue;
          const idx=rnd(offs.length), o=offs[idx], P={}, team=st.teams[p.id]||[];
          const rivals=st.pairs.filter(x=>x.id!==p.id&&(st.teams[x.id]||[]).length); const rv=rivals[rnd(rivals.length)];
          const pickOf=a=>a[rnd(a.length)];
          for(const k of CARDS[o.card].params){
            if(k==="own") P.own=pickOf(team).bankId; if(k==="moveSlot") P.moveSlot=String(rnd(4));
            if(k==="moveName") P.moveName=pickOf(["Protect","Substitute","Earthquake","Ice Beam","Thunder Wave"]);
            if(k==="item") P.item=pickOf(["Leftovers","Life Orb","Choice Scarf","Focus Sash"]);
            if(k==="nature") P.nature=pickOf(NATURES); if(k==="bank") P.bank=pickOf(o.options||[""]);
            if(k==="tpair") P.tpair=rv?rv.id:""; if(k==="tslot") P.tslot=rv?pickOf(st.teams[rv.id]).bankId:""; if(k==="tmove") P.tmove=String(rnd(4));
          }
          try{ playerAction(st,p.id,"chooseCard",{idx,params:P}); }catch(e){}
        }
        return;
      }
      case "bankEdit":{
        const b=bankById(st,d.id); if(!b) fail("Ese Pokémon ya no está en el banco.");
        const parsed=parsePaste(d.paste||"")[0]; if(!parsed) fail("No se ha podido leer el set. Usa el formato de Showdown.");
        const n=normalizeSet(parsed); delete n.id;
        if(n.species.toLowerCase()===b.species.toLowerCase()){ n.types=b.types; n.dex=b.dex; }
        if(Array.isArray(d.types)&&d.types.length) n.types=d.types.filter(t=>TYPES[t]).slice(0,2);
        Object.keys(b).forEach(k=>{ if(k!=="id") delete b[k]; }); Object.assign(b,n);
        addLog(st,"info",`Banco: se modifica ${b.species}.`); return;
      }
      case "bankDelete":{
        const i=(st.bank||[]).findIndex(s=>s.id===d.id); if(i<0) fail("Ese Pokémon ya no está en el banco.");
        if(!availableIds(st).includes(d.id)) fail("No se puede eliminar: está en un equipo o se le está ofreciendo a alguna pareja.");
        const [gone]=st.bank.splice(i,1); addLog(st,"info",`Banco: se elimina ${gone.species}.`); return;
      }
      case "reset":{
        const fresh=initState(st.pairs, st.bank); fresh.codes=st.codes; fresh.sessions=st.sessions; fresh.v=st.v; if(st.streamKey) fresh.streamKey=st.streamKey;
        Object.keys(st).forEach(k=>delete st[k]); Object.assign(st,fresh);
        addLog(st,"info","La organización reinicia el evento."); return;
      }
    }
    fail("Acción desconocida.");
  }

  /* Lo que ve cada cual.
     admin: todo.  stream (con su clave): todo menos códigos y sesiones.
     pareja / público: durante el draft no ven lo que eligen los demás, y durante
     las cartas no ven las cartas ni las elecciones del resto, hasta que esa fase termina. */
  function publicView(st, role, pairId){
    const v=clone(st); delete v.codes; delete v.sessions; delete v.streamKey;
    v.players={}; Object.entries(st.sessions||{}).forEach(([sid,s])=>{ if(s.role==="player") (v.players[s.pairId]=v.players[s.pairId]||[]).push({sid:role==="admin"?sid:undefined,name:s.name}); });
    v.progress={}; st.pairs.forEach(p=>v.progress[p.id]=(st.teams?.[p.id]||[]).length);
    if(role==="admin"){ v.codes=st.codes; v.streamKey=st.streamKey; return v; }
    if(role==="stream") return v;
    const mine = id => role==="player" && id===pairId;
    if(st.phase==="draft"){
      Object.keys(v.teams||{}).forEach(pid=>{ if(!mine(pid)) v.teams[pid]=[]; });
      Object.keys(v.draft||{}).forEach(pid=>{ if(!mine(pid)) delete v.draft[pid]; });
      v.log=(v.log||[]).filter(e=>!e.secret||mine(e.secret));
    }
    if(st.phase==="cards"){
      Object.keys(v.cardOffers||{}).forEach(pid=>{ if(!mine(pid)) v.cardOffers[pid]=[]; });
      Object.keys(v.cardChoices||{}).forEach(pid=>{ if(!mine(pid)) v.cardChoices[pid]={hidden:true}; });
    }
    v.log=(v.log||[]).map(e=>{ const x={...e}; delete x.secret; return x; });
    return v;
  }

  const api = {TYPES,NATURES,STATS,PHASES,RARITY_LABEL,KIND_LABEL,CARDS,NEGATIVE,WEIGHTS,GameError,
    clone,slug,code4,dexKey,resolveDex,enrichSets,spriteUrl,cardIconUrl,toPaste,teamPaste,parsePaste,normalizeSet,parseBankText,assignIds,initState,pairName,bankById,totalRounds,
    availableIds,drawN,standings,roundRobin,currentMatches,findMon,dealCards,applyCard,resolveCards,describeChoice,playerAction,adminAction,publicView};
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Logic = api;
})(this);
