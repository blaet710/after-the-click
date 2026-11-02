const bgm = document.getElementById("bgm");
let audioUnlocked = false;
function unlockAudio(){if(audioUnlocked)return;if(bgm){bgm.volume=0.35;const p=bgm.play();if(p&&p.then)p.then(()=>audioUnlocked=true).catch(()=>{});else audioUnlocked=true;}else audioUnlocked=true;}
document.addEventListener("pointerdown",unlockAudio,true);
document.addEventListener("click",unlockAudio,true);
document.addEventListener("keydown",unlockAudio,true);
const sfxFiles={click:"/assets/click.wav",card:"/assets/card.wav",impact:"/assets/impact.wav",blank:"/assets/blank.wav"};
function playSfx(name,volume=.75){const src=sfxFiles[name];if(!src)return;const a=new Audio(src);a.volume=volume;a.play().catch(()=>{});}
const socket=io();const $=id=>document.getElementById(id);
let state=null,selectedCard=null,currentScreen="home",busy=false,previousLog=[],chatItems=[];
function show(id){["home","lobby","game"].forEach(x=>$(x).classList.toggle("hidden",x!==id));currentScreen=id;}
function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600);}
function name(){return $("playerName").value.trim();}
function error(msg){$("homeError").textContent=msg;}
function request(event,data){return new Promise(resolve=>{if(!socket.connected){resolve({error:"서버 연결이 끊어졌습니다. 새로고침 후 다시 접속해 주세요."});return;}let done=false;const timer=setTimeout(()=>{if(!done){done=true;resolve({error:"서버 응답이 없습니다. 잠시 후 다시 시도해 주세요."});}},10000);socket.emit(event,data||{},response=>{if(done)return;done=true;clearTimeout(timer);resolve(response||{error:"서버에서 응답을 받지 못했습니다."});});});}
$("createBtn").onclick=async()=>{playSfx("click",.5);error("");const n=name();if(!n)return error("이름을 입력해 주세요.");const r=await request("createRoom",{name:n});if(r?.error)return error(r.error);show("lobby");};
$("joinBtn").onclick=async()=>{playSfx("click",.5);error("");const n=name(),c=$("roomCode").value.trim();if(!n||!c)return error("이름과 방 코드를 입력해 주세요.");const r=await request("joinRoom",{name:n,code:c});if(r?.error)return error(r.error);show("lobby");};
$("roomCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase());
$("copyCode").onclick=()=>{if(state?.code)navigator.clipboard?.writeText(state.code).then(()=>toast("방 코드를 복사했습니다."),()=>toast("코드: "+state.code));};
$("startBtn").onclick=async()=>{playSfx("click",.5);const r=await request("startGame");if(r?.error)toast(r.error);};
$("leaveBtn").onclick=()=>{playSfx("click",.5);socket.emit("leaveRoom");state=null;selectedCard=null;chatItems=[];show("home");};
$("turnBtn").onclick=async()=>{if(busy)return;playSfx("click",.45);busy=true;$("turnBtn").disabled=true;showCinematic();try{await new Promise(r=>setTimeout(r,1000));const result=await request("takeTurn");if(result?.error)toast(result.error);}catch(e){toast("턴 처리 중 오류가 발생했습니다.");}finally{hideCinematic();busy=false;if(state)renderGame();}};
$("useCard").onclick=async()=>{if(selectedCard===null)return;playSfx("card");const card=state?.myCards?.[selectedCard];if(!card)return;let targetId=null;if(card.effect==="reverse")targetId=$("targetSelect").value;const r=await request("useCard",{index:selectedCard,targetId});if(r?.error)toast(r.error);else{selectedCard=null;toast("카드를 사용했습니다.");}};
$("chatForm").addEventListener("submit",async e=>{e.preventDefault();const message=$("chatInput").value.trim();if(!message)return;const r=await request("chatMessage",{message});if(r?.error)toast(r.error);else $("chatInput").value="";});
function showCinematic(){$("cinematic").classList.remove("hidden");const lines=["주변이 조용해진다…","결과를 확인합니다"];let i=0;$("cinematicText").textContent=lines[0];const timer=setInterval(()=>{i++;if(i<lines.length)$("cinematicText").textContent=lines[i];else clearInterval(timer);},650);$("cinematic").dataset.timer=timer;}
function hideCinematic(){clearInterval(Number($("cinematic").dataset.timer));$("cinematic").classList.add("hidden");}
socket.on("roomState",s=>{state=s;chatItems=Array.isArray(s.chat)?s.chat:chatItems;if(s.status==="lobby")renderLobby();else renderGame();});
socket.on("chatMessage",item=>{chatItems.push(item);if(chatItems.length>60)chatItems.shift();renderChat();});
socket.on("disconnect",()=>{if(currentScreen!=="home")toast("서버 연결이 끊어졌습니다. 새로고침 후 다시 접속해 주세요.");});
function renderLobby(){show("lobby");$("codeText").textContent=state.code;$("playerCount").textContent=`${state.players.length} / 6`;$("lobbyPlayers").innerHTML=state.players.map(p=>`<div class="lobby-player"><span>${escapeHtml(p.name)}</span>${p.isHost?'<b class="host-tag">HOST</b>':'<span class="muted">PLAYER</span>'}</div>`).join("");const host=state.hostId===socket.id;$("startBtn").classList.toggle("hidden",!host);$("startBtn").disabled=state.players.length<2;$("lobbyHint").textContent=host?"최소 2명이 모이면 게임을 시작할 수 있습니다.":"방장이 게임을 시작할 때까지 기다려 주세요.";}
function renderGame(){show("game");$("cycle").textContent=`CYCLE ${String(state.cycle).padStart(2,"0")}`;const me=state.players.find(p=>p.id===socket.id),turn=state.players.find(p=>p.id===state.currentPlayerId);$("turnName").textContent=turn?.name||"게임 종료";$("stageName").textContent=turn?.name||"WAITING";$("turnBadge").textContent=state.status==="finished"?"FINISHED":state.isMyTurn?"YOUR TURN":"WAITING";$("stageMessage").textContent=state.status==="finished"?`최종 승자: ${state.winner}`:state.isMyTurn?"당신의 차례입니다. 카드를 사용하거나 턴을 진행하세요.":`현재 ${turn?.name||""}님의 차례를 기다리는 중입니다.`;
  const odds=me?.lucky?{miss:65,hit:30,critical:5}:state.odds||{miss:50,hit:45,critical:5};$("riskDisplay").textContent=`현재 판정 확률 · 빗나감 ${odds.miss}% / 명중 ${odds.hit}% (피해 1) / 치명타 ${odds.critical}% (피해 2)${me?.lucky?" · 행운 적용 중":""}`;
  $("players").innerHTML=state.players.map(p=>`<div class="player ${p.id===state.currentPlayerId?"active":""} ${!p.alive?"dead":""}"><b>${escapeHtml(p.name)} ${p.isHost?"★":""}</b><small>${p.alive?`♥ ${p.hp}/3 · 카드 ${p.cardCount}장${p.shield?" · 방어막":""}${p.protected?" · 보호":""}`:"탈락"}</small></div>`).join("");
  $("hand").innerHTML=state.myCards?.length?state.myCards.map((c,i)=>`<button class="hand-card ${selectedCard===i?"selected":""}" data-index="${i}" style="background:${c.color}"><span>✦</span><b>${escapeHtml(c.name)}</b><small>출현 ${c.probability}%</small></button>`).join(""):'<span class="muted">보유한 카드가 없습니다.</span>';
  document.querySelectorAll(".hand-card").forEach(b=>b.onclick=()=>{selectedCard=Number(b.dataset.index);renderGame();});
  const card=state.myCards?.[selectedCard];$("previewName").textContent=card?.name||"UNKNOWN";$("previewDesc").textContent=card?`${card.description}\n\n패 출현 확률: ${card.probability}%`:"카드를 선택해 설명을 확인하세요.";
  $("useCard").disabled=!state.isMyTurn||!card||state.status!=="playing";$("turnBtn").disabled=!state.isMyTurn||state.status!=="playing"||busy;$("actionHint").textContent=state.isMyTurn?"당신의 턴입니다.":"다른 플레이어의 턴입니다.";
  $("targetWrap").classList.toggle("hidden",card?.effect!=="reverse");if(card?.effect==="reverse")$("targetSelect").innerHTML=state.players.filter(p=>p.alive&&p.id!==socket.id).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("log").innerHTML=state.log.map(x=>`<div class="log-line">${escapeHtml(x)}</div>`).join("");const logs=state.log||[];if(previousLog.length&&logs.length>previousLog.length){for(const line of logs.slice(previousLog.length)){if(/피해|치명타|탈락/.test(line))playSfx("impact");else if(/빗나갔|막았습니다/.test(line))playSfx("blank");else if(/카드를 사용|카드를 획득/.test(line))playSfx("card");}}previousLog=logs.slice();$("log").scrollTop=$("log").scrollHeight;renderChat();if(state.status==="finished"){$("turnBtn").disabled=true;$("useCard").disabled=true;}}
function renderChat(){const el=$("chatMessages");if(!el)return;el.innerHTML=chatItems.map(m=>`<div class="chat-line"><b>${escapeHtml(m.name)}</b><span>${escapeHtml(m.message)}</span></div>`).join("");el.scrollTop=el.scrollHeight;}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
