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

const CARD_DEFS = [
  { name:"방어막", description:"다음 판정 실패로 인한 피해를 한 번 막습니다.", effect:"shield", color:"#477bd1" },
  { name:"행운", description:"다음 생존 판정의 성공 확률이 증가합니다.", effect:"luck", color:"#b28b31" },
  { name:"정찰", description:"현재 가상 위험 수치를 확인합니다.", effect:"scout", color:"#278ca1" },
  { name:"회복", description:"목숨을 1 회복합니다. 최대 3입니다.", effect:"heal", color:"#32885d" },
  { name:"방해", description:"상대 한 명의 다음 턴을 건너뛰게 합니다.", effect:"skip", color:"#8654b5" },
  { name:"보호", description:"다음 판정 실패로 인한 피해를 한 번 막습니다.", effect:"protect", color:"#66667d" }
];

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();
const alive = room => room.players.filter(p => p.alive);
const current = room => room.players[room.currentIndex];

function publicState(room) {
  return {
    code: room.code, hostId: room.hostId, status: room.status,
    cycle: room.cycle, currentPlayerId: room.players[room.currentIndex]?.id,
    danger: room.status === "playing" ? room.danger : null,
    players: room.players.map(p => ({
      id:p.id, name:p.name, hp:p.hp, alive:p.alive,
      shield:p.shield, protected:p.protected, lucky:p.lucky,
      isHost:p.id === room.hostId,
      cardCount:p.cards.length
    })),
    log: room.log.slice(-35), winner: room.winner
  };
}
function sendRoom(room) {
  const state = publicState(room);
  for (const p of room.players) {
    io.to(p.id).emit("roomState", {
      ...state,
      myCards: p.cards.map((c, i) => ({...c, index:i})),
      isMyTurn: room.status === "playing" && current(room)?.id === p.id
    });
  }
}
function addLog(room, message) {
  room.log.push(message);
  if (room.log.length > 80) room.log.shift();
}
function finishIfNeeded(room) {
  const survivors = alive(room);
  if (survivors.length <= 1) {
    room.status = "finished";
    room.winner = survivors[0]?.name || "승자 없음";
    addLog(room, `게임 종료! ${room.winner === "승자 없음" ? room.winner : `최종 승자: ${room.winner}`}`);
    return true;
  }
  return false;
}
function advanceTurn(room) {
  if (finishIfNeeded(room)) return;
  const start = room.currentIndex;
  let next = start;
  for (let i=0; i<room.players.length; i++) {
    next = (next + 1) % room.players.length;
    if (room.players[next].alive) break;
  }
  if (next <= start) {
    room.cycle += 1;
    addLog(room, `사이클 ${room.cycle} 시작! 생존자에게 카드가 지급됩니다.`);
    alive(room).forEach(p => p.cards.push({...pick(CARD_DEFS)}));
    next = room.players.findIndex(p => p.alive);
  }
  room.currentIndex = next;
  room.danger = 20 + Math.floor(Math.random() * 31);
  const p = current(room);
  if (p?.skipNextTurn) {
    p.skipNextTurn = false;
    addLog(room, `${p.name}의 턴이 건너뛰어졌습니다.`);
    advanceTurn(room);
  }
}
function createGame(room) {
  room.status = "playing"; room.cycle = 1; room.currentIndex = 0;
  room.danger = 20 + Math.floor(Math.random() * 31); room.winner = null;
  room.players.forEach(p => {
    p.hp=MAX_HP; p.alive=true; p.shield=false; p.protected=false;
    p.lucky=false; p.skipNextTurn=false; p.cards=[{...pick(CARD_DEFS)}];
  });
  addLog(room, "게임 시작! 모든 플레이어가 무작위 카드 1장을 받았습니다.");
  sendRoom(room);
}
function roomFor(socket) {
  const code = socket.data.roomCode;
  return code ? rooms.get(code) : null;
}

io.on("connection", socket => {
  socket.on("createRoom", ({name}, cb) => {
    name = String(name || "").trim().slice(0,18);
    if (!name) return cb?.({error:"이름을 입력해 주세요."});
    let roomCode; do { roomCode = code(); } while (rooms.has(roomCode));
    const player = {id:socket.id,name,hp:MAX_HP,alive:true,cards:[],shield:false,protected:false,lucky:false,skipNextTurn:false};
    const room = {code:roomCode,hostId:socket.id,status:"lobby",cycle:1,currentIndex:0,danger:30,players:[player],log:["방이 생성되었습니다."],winner:null};
    rooms.set(roomCode, room); socket.join(roomCode); socket.data.roomCode=roomCode;
    sendRoom(room); cb?.({ok:true,code:roomCode});
  });

  socket.on("joinRoom", ({code:roomCode,name}, cb) => {
    roomCode = String(roomCode || "").trim().toUpperCase();
    name = String(name || "").trim().slice(0,18);
    const room = rooms.get(roomCode);
    if (!name) return cb?.({error:"이름을 입력해 주세요."});
    if (!room) return cb?.({error:"방 코드를 찾을 수 없습니다."});
    if (room.status !== "lobby") return cb?.({error:"이미 게임이 시작된 방입니다."});
    if (room.players.length >= 6) return cb?.({error:"방이 가득 찼습니다. (최대 6명)"});
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase())) return cb?.({error:"이미 사용 중인 이름입니다."});
    room.players.push({id:socket.id,name,hp:MAX_HP,alive:true,cards:[],shield:false,protected:false,lucky:false,skipNextTurn:false});
    socket.join(roomCode); socket.data.roomCode=roomCode;
    addLog(room, `${name}님이 입장했습니다.`);
    sendRoom(room); cb?.({ok:true,code:roomCode});
  });

  socket.on("startGame", cb => {
    const room = roomFor(socket);
    if (!room) return cb?.({error:"방에 먼저 입장해 주세요."});
    if (socket.id !== room.hostId) return cb?.({error:"방장만 게임을 시작할 수 있습니다."});
    if (room.players.length < 2) return cb?.({error:"최소 2명이 필요합니다."});
    if (room.status !== "lobby") return cb?.({error:"게임이 이미 시작되었습니다."});
    createGame(room); cb?.({ok:true});
  });

  socket.on("useCard", ({index,targetId}, cb) => {
    const room = roomFor(socket);
    if (!room || room.status !== "playing") return cb?.({error:"진행 중인 게임이 없습니다."});
    const p = room.players.find(x => x.id === socket.id);
    if (!p || current(room)?.id !== p.id) return cb?.({error:"자기 턴에만 카드를 사용할 수 있습니다."});
    const card = p.cards[index];
    if (!card) return cb?.({error:"카드를 찾을 수 없습니다."});
    const target = room.players.find(x => x.id === targetId && x.alive && x.id !== p.id);
    if (card.effect === "heal" && p.hp >= MAX_HP) return cb?.({error:"목숨이 이미 최대입니다."});
    if (card.effect === "shield" && p.shield) return cb?.({error:"방어막이 이미 활성화되어 있습니다."});
    if (card.effect === "protect" && p.protected) return cb?.({error:"보호 효과가 이미 활성화되어 있습니다."});
    if (card.effect === "skip" && !target) return cb?.({error:"방해할 상대를 선택해 주세요."});
    p.cards.splice(index,1);
    if (card.effect === "shield") p.shield=true;
    if (card.effect === "luck") p.lucky=true;
    if (card.effect === "heal") p.hp=Math.min(MAX_HP,p.hp+1);
    if (card.effect === "protect") p.protected=true;
    if (card.effect === "skip") { target.skipNextTurn=true; addLog(room, `${p.name}님이 ${target.name}님의 다음 턴을 건너뛰게 했습니다.`); }
    if (card.effect === "scout") addLog(room, `${p.name}님이 정찰 카드를 사용했습니다. 현재 가상 위험 수치: ${room.danger}%`);
    else addLog(room, `${p.name}님이 [${card.name}] 카드를 사용했습니다.`);
    sendRoom(room); cb?.({ok:true});
  });

  socket.on("takeTurn", cb => {
    const room = roomFor(socket);
    if (!room || room.status !== "playing") return cb?.({error:"진행 중인 게임이 없습니다."});
    const p = room.players.find(x => x.id === socket.id);
    if (!p || current(room)?.id !== p.id) return cb?.({error:"현재 턴인 플레이어만 진행할 수 있습니다."});
    let message;
    if (p.skipNextTurn) {
      p.skipNextTurn=false; message=`${p.name}님의 턴이 건너뛰어졌습니다.`;
    } else {
      let chance=room.danger;
      if (p.lucky) { chance=Math.max(5,chance-15); p.lucky=false; }
      const failed = Math.floor(Math.random()*100)+1 <= chance;
      if (failed) {
        if (p.shield) { p.shield=false; message="방어막이 피해를 막았습니다!"; }
        else if (p.protected) { p.protected=false; message="보호 효과가 피해를 막았습니다!"; }
        else {
          p.hp-=1; message=`${p.name}님은 판정에 실패했습니다.`;
          if (p.hp<=0) { p.alive=false; message+=` ${p.name}님 탈락!`; }
        }
      } else message=`${p.name}님은 판정을 통과했습니다!`;
    }
    addLog(room,message);
    if (!finishIfNeeded(room)) advanceTurn(room);
    sendRoom(room); cb?.({ok:true,result:message});
  });

  socket.on("leaveRoom", () => {
    const room = roomFor(socket);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(room.code); socket.data.roomCode=null;
    if (!room.players.length) rooms.delete(room.code);
    else {
      if (room.hostId === socket.id) room.hostId=room.players[0].id;
      room.players.forEach((p,i) => { if (p.id===socket.id) room.currentIndex=i; });
      if (room.status === "playing") {
        room.currentIndex = Math.min(room.currentIndex, room.players.length-1);
        finishIfNeeded(room);
      }
      addLog(room,"플레이어가 방을 나갔습니다."); sendRoom(room);
    }
  });

  socket.on("disconnect", () => {
    const room = roomFor(socket);
    if (!room) return;
    room.players = room.players.filter(p => p.id !== socket.id);
    if (!room.players.length) rooms.delete(room.code);
    else {
      if (room.hostId === socket.id) room.hostId=room.players[0].id;
      room.currentIndex=Math.min(room.currentIndex,room.players.length-1);
      addLog(room,"플레이어 연결이 종료되었습니다.");
      if (room.status==="playing") finishIfNeeded(room);
      sendRoom(room);
    }
  });
});

server.listen(PORT, () => console.log(`AFTER THE CLICK server listening on ${PORT}`));
