const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));
const PORT = process.env.PORT || 3000;
const MAX_HP = 3;
const rooms = new Map();

// 출현 확률 합계 100%. 방해 카드는 제거했습니다.
const CARD_DEFS = [
  { name:"방어막", description:"다음 공격 피해를 한 번 막습니다.", effect:"shield", color:"#477bd1", weight:10 },
  { name:"행운", description:"다음 판정에서 빗나갈 확률이 15%p 증가합니다.", effect:"luck", color:"#b28b31", weight:20 },
  { name:"정찰", description:"현재 판정 확률을 확인합니다.", effect:"scout", color:"#278ca1", weight:20 },
  { name:"회복", description:"목숨을 1 회복합니다. 최대 3입니다.", effect:"heal", color:"#32885d", weight:5 },
  { name:"보호", description:"다음 공격 피해를 한 번 막습니다. 방어막과 별도 효과입니다.", effect:"protect", color:"#66667d", weight:8 },
  { name:"대천사", description:"치명적인 피해로 체력이 0이 되면 이 카드를 소모하고 체력 3으로 부활합니다. 방어막과 별개 판정입니다.\n\n당신의 등뒤에서 무언가 축복을 내리는 느낌을 받았다...", effect:"archangel", color:"#e0c46c", weight:2 },
  { name:"지옥", description:"사이클이 끝날 때마다 무작위 카드 1장을 잃습니다. 카드가 모두 사라지면 사망합니다.\n\n이 문구를 본자 희망을 버려라.", effect:"hell", color:"#8b2638", weight:1 },
  { name:"반대", description:"상대 한 명을 공격합니다. 50% 빗나감, 50% 명중(피해 1).\n\n내가 굳이 설정대로 따라갈 필요는 없잖아!", effect:"reverse", color:"#a34c9c", weight:5 }
];
const TOTAL_WEIGHT = CARD_DEFS.reduce((n,c)=>n+c.weight,0);
const pickCard = () => {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const card of CARD_DEFS) { roll -= card.weight; if (roll < 0) return {...card}; }
  return {...CARD_DEFS[0]};
};
const roomCode = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const alive = room => room.players.filter(p => p.alive);
const current = room => room.players[room.currentIndex];
const findPlayer = (room,id) => room.players.find(p => p.id === id);

function publicState(room) {
  return {
    code:room.code, hostId:room.hostId, status:room.status, cycle:room.cycle,
    currentPlayerId:current(room)?.id,
    danger:50,
    odds:{miss:50,hit:45,critical:5},
    players:room.players.map(p=>({id:p.id,name:p.name,hp:p.hp,alive:p.alive,shield:p.shield,protected:p.protected,lucky:p.lucky,isHost:p.id===room.hostId,cardCount:p.cards.length})),
    log:room.log.slice(-35), chat:room.chat.slice(-40), winner:room.winner
  };
}
function sendRoom(room) {
  const state=publicState(room);
  for(const p of room.players) io.to(p.id).emit("roomState",{...state,myCards:p.cards.map((c,i)=>({...c,index:i,probability:c.weight})),isMyTurn:room.status==="playing"&&current(room)?.id===p.id});
}
function addLog(room,message){room.log.push(message);if(room.log.length>100)room.log.shift();}
function finishIfNeeded(room){const survivors=alive(room);if(survivors.length<=1){room.status="finished";room.winner=survivors[0]?.name||"승자 없음";addLog(room,`게임 종료! ${room.winner==="승자 없음"?room.winner:`최종 승자: ${room.winner}`}`);return true;}return false;}
function applyCycleStart(room){
  room.cycle += 1;
  addLog(room,`사이클 ${room.cycle} 시작! 생존자에게 카드가 지급됩니다.`);
  // 지옥 카드 보유자는 사이클마다 먼저 카드 1장을 잃습니다.
  for(const p of alive(room)){
    if(p.hellCurse || p.cards.some(c=>c.effect==="hell")){
      p.hellCurse=true;
      if(p.cards.length){const lostIndex=p.cards.findIndex(c=>c.effect!=="hell");if(lostIndex>=0){const lost=p.cards.splice(lostIndex,1)[0];addLog(room,`${p.name}님의 지옥 효과로 [${lost.name}] 카드가 사라졌습니다.`);}else{p.cards.splice(0,1);addLog(room,`${p.name}님의 지옥 카드가 사라졌습니다.`);}}
      if(p.cards.length===0){p.alive=false;p.hp=0;addLog(room,`${p.name}님은 지옥의 저주로 카드가 모두 사라져 사망했습니다.`);}
    }
  }
  for(const p of alive(room)){const c=pickCard();p.cards.push(c);if(c.effect==="hell")p.hellCurse=true;addLog(room,`${p.name}님이 [${c.name}] 카드를 획득했습니다.`);}
}
function advanceTurn(room){
  if(finishIfNeeded(room))return;
  const n=room.players.length;let next=-1;let wrapped=false;
  for(let step=1;step<=n;step++){
    const idx=(room.currentIndex+step)%n;
    if(idx<=room.currentIndex)wrapped=true;
    if(room.players[idx]?.alive){next=idx;break;}
  }
  if(next<0){finishIfNeeded(room);return;}
  if(wrapped){applyCycleStart(room);if(finishIfNeeded(room))return; if(!room.players[next]?.alive){ for(let step=1;step<=n;step++){const idx=(room.currentIndex+step)%n;if(room.players[idx]?.alive){next=idx;break;}} }}
  room.currentIndex=next;
}
function createGame(room){
  room.status="playing";room.cycle=1;room.currentIndex=0;room.winner=null;
  room.players.forEach(p=>{p.hp=MAX_HP;p.alive=true;p.shield=false;p.protected=false;p.lucky=false;p.hellCurse=false;p.cards=[pickCard()];if(p.cards[0].effect==="hell")p.hellCurse=true;});
  addLog(room,"게임 시작! 모든 플레이어가 확률에 따라 카드 1장을 받았습니다.");sendRoom(room);
}
function roomFor(socket){return socket.data.roomCode?rooms.get(socket.data.roomCode):null;}
function safeAck(cb,result){if(typeof cb==="function")cb(result);}
function damagePlayer(room,target,amount,source){
  if(!target?.alive)return;
  if(target.shield){target.shield=false;addLog(room,`${target.name}님의 방어막이 피해를 막았습니다!`);return;}
  if(target.protected){target.protected=false;addLog(room,`${target.name}님의 보호 효과가 피해를 막았습니다!`);return;}
  target.hp-=amount;addLog(room,`${source||target.name} 공격! ${target.name}님이 ${amount===2?"치명타 피해 2":"피해 1"}를 받았습니다.`);
  if(target.hp<=0){
    const angelIndex=target.cards.findIndex(c=>c.effect==="archangel");
    if(angelIndex>=0){target.cards.splice(angelIndex,1);target.hp=MAX_HP;target.alive=true;addLog(room,`${target.name}님이 대천사의 축복으로 체력 3으로 부활했습니다!`);}
    else{target.hp=0;target.alive=false;addLog(room,`${target.name}님 탈락!`);}
  }
}

io.on("connection",socket=>{
  socket.on("createRoom",(data={},cb)=>{
    const reply=r=>safeAck(cb,r);const name=String(data?.name||"").trim().slice(0,18);if(!name)return reply({error:"이름을 입력해 주세요."});
    let c;do{c=roomCode();}while(rooms.has(c));
    const player={id:socket.id,name,hp:MAX_HP,alive:true,cards:[],shield:false,protected:false,lucky:false};
    const room={code:c,hostId:socket.id,status:"lobby",cycle:1,currentIndex:0,players:[player],log:["방이 생성되었습니다."],chat:[],winner:null};
    rooms.set(c,room);socket.join(c);socket.data.roomCode=c;sendRoom(room);reply({ok:true,code:c});
  });
  socket.on("joinRoom",(data={},cb)=>{
    const reply=r=>safeAck(cb,r);const c=String(data?.code||"").trim().toUpperCase();const name=String(data?.name||"").trim().slice(0,18);const room=rooms.get(c);
    if(!name)return reply({error:"이름을 입력해 주세요."});if(!room)return reply({error:"방 코드를 찾을 수 없습니다."});if(room.status!=="lobby")return reply({error:"이미 게임이 시작된 방입니다."});if(room.players.length>=6)return reply({error:"방이 가득 찼습니다. (최대 6명)"});if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return reply({error:"이미 사용 중인 이름입니다."});
    room.players.push({id:socket.id,name,hp:MAX_HP,alive:true,cards:[],shield:false,protected:false,lucky:false});socket.join(c);socket.data.roomCode=c;addLog(room,`${name}님이 입장했습니다.`);sendRoom(room);reply({ok:true,code:c});
  });
  socket.on("startGame",(data,cb)=>{
    const callback=typeof data==="function"?data:cb;const room=roomFor(socket);if(!room)return safeAck(callback,{error:"방에 먼저 입장해 주세요."});if(socket.id!==room.hostId)return safeAck(callback,{error:"방장만 게임을 시작할 수 있습니다."});if(room.players.length<2)return safeAck(callback,{error:"최소 2명이 필요합니다."});if(room.status!=="lobby")return safeAck(callback,{error:"게임이 이미 시작되었습니다."});createGame(room);safeAck(callback,{ok:true});
  });
  socket.on("useCard",(data={},cb)=>{
    const room=roomFor(socket);const p=room&&findPlayer(room,socket.id);const reply=r=>safeAck(cb,r);
    if(!room||room.status!=="playing")return reply({error:"진행 중인 게임이 없습니다."});if(!p||current(room)?.id!==p.id)return reply({error:"자기 턴에만 카드를 사용할 수 있습니다."});
    const index=Number(data?.index);const card=p.cards[index];if(!card)return reply({error:"카드를 찾을 수 없습니다."});
    if(card.effect==="heal"&&p.hp>=MAX_HP)return reply({error:"목숨이 이미 최대입니다."});if(card.effect==="shield"&&p.shield)return reply({error:"방어막이 이미 활성화되어 있습니다."});if(card.effect==="protect"&&p.protected)return reply({error:"보호 효과가 이미 활성화되어 있습니다."});
    const target=findPlayer(room,data?.targetId);if(card.effect==="reverse"&&(!target||!target.alive||target.id===p.id))return reply({error:"공격할 상대를 선택해 주세요."});
    p.cards.splice(index,1);
    if(card.effect==="shield")p.shield=true;
    else if(card.effect==="luck")p.lucky=true;
    else if(card.effect==="heal")p.hp=Math.min(MAX_HP,p.hp+1);
    else if(card.effect==="protect")p.protected=true;
    else if(card.effect==="scout")addLog(room,`${p.name}님 정찰: 빗나감 50% · 명중 45% · 치명타 5%`);
    else if(card.effect==="reverse"){
      const roll=Math.random()*100;
      if(roll<50)addLog(room,`${p.name}님의 반대 공격이 빗나갔습니다!`);
      else damagePlayer(room,target,1,`${p.name}님의 반대`);
    }
    if(!["scout","reverse"].includes(card.effect))addLog(room,`${p.name}님이 [${card.name}] 카드를 사용했습니다.`);
    finishIfNeeded(room);sendRoom(room);reply({ok:true});
  });
  socket.on("takeTurn",(data,cb)=>{
    const callback=typeof data==="function"?data:cb;const room=roomFor(socket);const reply=r=>safeAck(callback,r);
    if(!room||room.status!=="playing")return reply({error:"진행 중인 게임이 없습니다."});const p=findPlayer(room,socket.id);if(!p||current(room)?.id!==p.id)return reply({error:"현재 턴인 플레이어만 진행할 수 있습니다."});
    const roll=Math.random()*100;let missChance=p.lucky?65:50;let hitChance=p.lucky?30:45;let critChance=5;p.lucky=false;
    if(roll<missChance)addLog(room,`${p.name}님 공격이 빗나갔습니다. (빗나감 ${missChance}%)`);
    else if(roll<missChance+hitChance)damagePlayer(room,p,1,`${p.name}님 판정`);
    else damagePlayer(room,p,2,`${p.name}님 판정 치명타`);
    if(!finishIfNeeded(room))advanceTurn(room);sendRoom(room);reply({ok:true});
  });
  socket.on("chatMessage",(data,cb)=>{
    const room=roomFor(socket);const p=room&&findPlayer(room,socket.id);const message=String(data?.message||"").trim().slice(0,200);
    if(!room||!p)return safeAck(cb,{error:"채팅할 방이 없습니다."});if(!message)return safeAck(cb,{error:"메시지를 입력해 주세요."});
    const item={name:p.name,message,at:Date.now()};room.chat.push(item);if(room.chat.length>60)room.chat.shift();io.to(room.code).emit("chatMessage",item);safeAck(cb,{ok:true});
  });
  socket.on("leaveRoom",()=>{const room=roomFor(socket);if(!room)return;room.players=room.players.filter(p=>p.id!==socket.id);socket.leave(room.code);socket.data.roomCode=null;if(!room.players.length)rooms.delete(room.code);else{if(room.hostId===socket.id)room.hostId=room.players[0].id;room.currentIndex=Math.min(room.currentIndex,room.players.length-1);if(room.status==="playing")finishIfNeeded(room);addLog(room,"플레이어가 방을 나갔습니다.");sendRoom(room);}});
  socket.on("disconnect",()=>{const room=roomFor(socket);if(!room)return;room.players=room.players.filter(p=>p.id!==socket.id);if(!room.players.length)rooms.delete(room.code);else{if(room.hostId===socket.id)room.hostId=room.players[0].id;room.currentIndex=Math.min(room.currentIndex,room.players.length-1);addLog(room,"플레이어 연결이 종료되었습니다.");if(room.status==="playing")finishIfNeeded(room);sendRoom(room);}});
});
server.listen(PORT,()=>console.log(`AFTER THE CLICK server listening on ${PORT}`));
