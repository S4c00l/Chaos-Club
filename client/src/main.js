import * as THREE from 'three';
import { Client } from 'colyseus.js';
import './style.css';

// Für Geräte im WLAN hier die lokale IP des Server-PCs eintragen.
// Server-Adresse: per Build-Variable VITE_SERVER_URL setzbar (z. B. wss://dein-server.example.com),
// sonst automatisch: lokal ws://<host>:2567, online wss://<host>.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || (
  location.protocol === 'https:' ? `wss://${location.hostname}` : `ws://${location.hostname}:2567`
);
const MAX_PLAYERS = 16;

const game = document.querySelector('#game');
const joinPanel = document.querySelector('#join-panel');
const nicknameInput = document.querySelector('#nickname');
const connectionLabel = document.querySelector('#connection');
const playersLabel = document.querySelector('#players');
const errorLabel = document.querySelector('#join-error');
const toast = document.querySelector('#toast');
const createButton = document.querySelector('#create-lobby');
const joinButton = document.querySelector('#join-lobby');
const codeInput = document.querySelector('#lobby-code');
const codeDisplay = document.querySelector('#lobby-code-display');
const playerLimit = document.querySelector('#player-limit');
const playerLimitValue = document.querySelector('#player-limit-value');
const roundCount = document.querySelector('#round-count');
const roundCountValue = document.querySelector('#round-count-value');

const roomPanel = document.querySelector('#room-panel');
const matchPanel = document.querySelector('#match-panel');
const roomCode = document.querySelector('#room-code');
const roomPlayerList = document.querySelector('#room-player-list');
const roomCount = document.querySelector('#room-count');
const roomStatus = document.querySelector('#room-status');
const roomError = document.querySelector('#room-error');
const readyButton = document.querySelector('#ready-button');
const startMatchButton = document.querySelector('#start-match');
const gamePicker = document.querySelector('#custom-games');
const randomSettings = document.querySelector('#random-settings');
const selectionRadios = [...document.querySelectorAll('input[name="selection-mode"]')];
const gameCatalog = [
  ['push_arena','Push Arena','Schubse Gegner von der Plattform.'],
  ['lava_rush','Lava Rush','Springe über Plattformen und entkomme der Lava.'],
  ['crazy_run','Crazy Run','Rase durch einen Hindernisparcours.'],
  ['hot_bomb','Hot Bomb','Gib die tickende Bombe weiter.'],
  ['steal_gold','Steal the Gold','Sammle Gold und stiehl es anderen.'],
  ['giant_ball','Giant Ball','Weiche einer riesigen rollenden Kugel aus.'],
  ['sky_fall','Sky Fall','Finde den sicheren Weg durch fallende Plattformen.'],
  ['color_dash','Color Dash','Laufe auf die Farbe, die angesagt wird.'],
  ['king_of_hill','King of the Hill','Halte den Hügel möglichst lange.'],
  ['laser_dodge','Laser Dodge','Weiche rotierenden Laserstrahlen aus.'],
  ['crate_crash','Crate Crash','Überlebe eine Arena voller einstürzender Kisten.'],
  ['ring_race','Ring Race','Fliege oder springe durch Checkpoint-Ringe.'],
  ['ice_slide','Ice Slide','Rutsche über eine glatte Strecke ins Ziel.'],
  ['meteor_madness','Meteor Madness','Weiche Meteoren aus, die auf die Arena krachen.'],
  ['team_tug','Team Tug','Ziehe im Team den Gegner über die Linie.'],
  ['platform_panic','Platform Panic','Bleibe auf den schrumpfenden Plattformen.'],
  ['coin_scramble','Coin Scramble','Sammle in kurzer Zeit die meisten Münzen.'],
  ['wind_tunnel','Wind Tunnel','Kämpfe gegen starke Windstöße.'],
  ['shadow_tag','Shadow Tag','Fange andere, bevor die Zeit abläuft.'],
  ['final_survivor','Final Survivor','Das große letzte Überlebensduell.']
];
let lobbyState = null;
let myReady = false;
let currentIsHost = false;
let currentRoomCode = '';


playerLimit.addEventListener('input', () => playerLimitValue.textContent = playerLimit.value);
roundCount.addEventListener('input', () => roundCountValue.textContent = roundCount.value);

let room;
let mySessionId;
let joined = false;
let isHost = false;
let configuredMaxPlayers = 16;
const remotePlayers = new Map();
const keys = new Set();
const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#8fd3ff', 32, 100);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 180);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
game.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x7890a8, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-12, 24, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

function material(color, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}
function makeArena() {
  const floor = new THREE.Mesh(new THREE.CylinderGeometry(23, 23, 1.2, 64), material('#64748b'));
  floor.position.y = -0.65; floor.receiveShadow = true; scene.add(floor);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 0.08, 64), material('#94a3b8'));
  inner.position.y = 0.02; inner.receiveShadow = true; scene.add(inner);
  const colors = ['#f97316', '#eab308', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899'];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.2), material(colors[i % colors.length]));
    block.position.set(Math.cos(a) * 21.8, 0.5, Math.sin(a) * 21.8);
    block.rotation.y = -a; block.castShadow = true; block.receiveShadow = true; scene.add(block);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI * 2 / 10;
    const obstacle = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 2.2), material(i % 2 ? '#38bdf8' : '#fb7185'));
    obstacle.position.set(Math.cos(a) * 10, 0.65, Math.sin(a) * 10);
    obstacle.rotation.y = a; obstacle.castShadow = true; obstacle.receiveShadow = true; scene.add(obstacle);
  }
  for (let i = 0; i < 5; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2 + i * .5, .12, 8, 48), material(colors[i]));
    ring.position.set(-13 + i * 6.5, 5 + (i % 2) * 2, -16);
    ring.rotation.x = Math.PI / 2.5; scene.add(ring);
  }
}
makeArena();

function makeCharacter(color = '#facc15') {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.85, 5, 10), material(color));
  body.position.y = 1.0; body.castShadow = true; group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 20, 16), material('#f1c7a5'));
  head.position.y = 1.85; head.castShadow = true; group.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.13, 0.12), material('#172554', 0.3));
  visor.position.set(0, 1.91, 0.33); group.add(visor);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.58, 0.22), material('#334155'));
  pack.position.set(0, 1.05, -0.48); pack.castShadow = true; group.add(pack);
  return group;
}
const palette = ['#facc15','#38bdf8','#fb7185','#4ade80','#c084fc','#fb923c','#2dd4bf','#f472b6',
  '#a3e635','#60a5fa','#f87171','#e879f9','#fbbf24','#34d399','#818cf8','#fda4af'];
const localCharacter = makeCharacter(palette[0]);
scene.add(localCharacter);
let localPosition = new THREE.Vector3(0, 0, 4);
let velocityY = 0, grounded = true, yaw = Math.PI, pitch = -0.18;
const cameraDistance = 7.5;
const cameraTarget = new THREE.Vector3();
localCharacter.position.copy(localPosition);

function hashCode(s) {
  let h = 0; for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i) | 0;
  return h;
}
function createRemote(id, data) {
  const mesh = makeCharacter(palette[Math.abs(hashCode(id)) % palette.length]);
  scene.add(mesh);
  remotePlayers.set(id, { mesh, target: new THREE.Vector3(data.x || 0, 0, data.z || 0) });
}
function removeRemote(id) {
  const p = remotePlayers.get(id);
  if (p) { scene.remove(p.mesh); remotePlayers.delete(id); }
}
function updateCamera() {
  cameraTarget.set(localPosition.x, localPosition.y + 1.45, localPosition.z);
  const horizontal = Math.cos(pitch) * cameraDistance;
  camera.position.set(cameraTarget.x + Math.sin(yaw) * horizontal,
    cameraTarget.y + Math.sin(-pitch) * cameraDistance,
    cameraTarget.z + Math.cos(yaw) * horizontal);
  camera.lookAt(cameraTarget);
}
renderer.domElement.addEventListener('click', () => {
  if (joined && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
});
document.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== renderer.domElement) return;
  yaw -= event.movementX * 0.0025;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.002, -0.75, 0.35);
});
document.addEventListener('keydown', (event) => {
  if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
});
document.addEventListener('keyup', (event) => keys.delete(event.code));
document.addEventListener('pointerlockchange', () => {
  toast.textContent = document.pointerLockElement === renderer.domElement ? '' : 'Klicke ins Spiel, um die Kamera zu steuern';
});

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.04);
  if (joined) {
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const direction = new THREE.Vector3();
    if (keys.has('KeyW')) direction.add(forward);
    if (keys.has('KeyS')) direction.sub(forward);
    if (keys.has('KeyD')) direction.add(right);
    if (keys.has('KeyA')) direction.sub(right);
    if (direction.lengthSq() > 0) {
      direction.normalize(); localPosition.addScaledVector(direction, 8 * dt);
      localCharacter.rotation.y = Math.atan2(direction.x, direction.z);
    }
    if (keys.has('Space') && grounded) { velocityY = 8.2; grounded = false; }
    velocityY -= 20 * dt; localPosition.y += velocityY * dt;
    if (localPosition.y <= 0) { localPosition.y = 0; velocityY = 0; grounded = true; }
    const radius = Math.hypot(localPosition.x, localPosition.z);
    if (radius > 20) localPosition.multiplyScalar(20 / radius);
    localCharacter.position.copy(localPosition); updateCamera();
    if (room && room.connection.isOpen) {
      room.send('move', { x: localPosition.x, z: localPosition.z, y: localPosition.y, rotation: localCharacter.rotation.y });
    }
  } else { camera.position.set(0, 9, 17); camera.lookAt(0, 0, 0); }
  for (const p of remotePlayers.values()) p.mesh.position.lerp(p.target, Math.min(1, dt * 12));
  renderer.render(scene, camera);
}
animate();


function buildGamePicker() {
  gamePicker.innerHTML = '';
  for (const [id, name, description] of gameCatalog) {
    const label = document.createElement('label');
    label.className = 'game-option';
    label.title = description;
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = id;
    checkbox.checked = true;
    label.append(checkbox, document.createTextNode(name));
    gamePicker.appendChild(label);
  }
}
buildGamePicker();

function selectedMode() {
  return selectionRadios.find(r => r.checked)?.value || 'random';
}
selectionRadios.forEach(radio => radio.addEventListener('change', () => {
  const custom = selectedMode() === 'custom';
  gamePicker.classList.toggle('hidden-panel', !custom);
  randomSettings.classList.toggle('hidden-panel', custom);
}));

function renderLobby(state) {
  lobbyState = state;
  roomPlayerList.innerHTML = '';
  const players = state.players || [];
  roomCount.textContent = `${players.length}/${state.maxPlayers}`;
  for (const player of players) {
    const row = document.createElement('div');
    row.className = 'player-row';
    const name = document.createElement('span');
    name.textContent = `${player.name}${player.isHost ? ' 👑' : ''}${player.sessionId === mySessionId ? ' (Du)' : ''}`;
    const status = document.createElement('span');
    status.className = player.ready ? 'ready' : 'waiting';
    status.textContent = player.ready ? 'BEREIT' : 'WARTET';
    row.append(name, status);
    roomPlayerList.appendChild(row);
  }
  const allReady = players.length > 0 && players.every(p => p.ready || p.isHost);
  roomStatus.textContent = currentIsHost
    ? `Du bist Host · ${players.length} Spieler in der Lobby`
    : (allReady ? 'Alle sind bereit!' : 'Warte, bis der Host die Runde startet.');
  startMatchButton.disabled = !currentIsHost || players.length < 1 || !allReady;
  startMatchButton.style.opacity = startMatchButton.disabled ? '.5' : '1';
  readyButton.disabled = currentIsHost;
  readyButton.textContent = myReady ? 'BEREIT ✓' : 'BEREIT';
  readyButton.style.background = myReady ? '#166534' : '#334155';
  if (!currentIsHost) startMatchButton.title = 'Nur der Host kann starten.';
}

function showMatch(info) {
  roomPanel.classList.add('hidden-panel');
  joinPanel.classList.add('hidden-panel');
  matchPanel.classList.remove('hidden-panel');
  document.exitPointerLock?.();
  const games = info.games || [];
  document.querySelector('#match-title').textContent = 'DIE RUNDE BEGINNT!';
  document.querySelector('#match-description').textContent =
    `${games.length} Minispiele wurden für diese Runde ausgewählt.`;
  const queue = document.querySelector('#match-queue');
  queue.innerHTML = '';
  games.forEach((gameId, index) => {
    const game = gameCatalog.find(g => g[0] === gameId);
    const item = document.createElement('div');
    item.className = 'queue-item';
    const number = document.createElement('span');
    number.textContent = `${index + 1}.`;
    item.append(number, document.createTextNode(game ? game[1] : gameId));
    queue.appendChild(item);
  });
  toast.textContent = 'Match gestartet – Spielmodi werden vorbereitet';
}

async function connectToRoom(mode) {
  createButton.disabled = joinButton.disabled = true;
  createButton.textContent = mode === 'create' ? 'ERSTELLE LOBBY …' : 'TRETE BEI …';
  errorLabel.textContent = '';
  try {
    const client = new Client(SERVER_URL);
    const name = nicknameInput.value.trim().slice(0, 16) || 'Spieler';
    if (mode === 'create') {
      const limit = Number(playerLimit.value);
      room = await client.create('party', {
        name,
        maxPlayers: limit === 0 ? 1 : limit,
        rounds: Number(roundCount.value)
      });
      currentIsHost = true;
    } else {
      const code = codeInput.value.trim();
      if (!code) throw new Error('Bitte gib eine Lobby-ID ein.');
      room = await client.joinById(code, { name });
      currentIsHost = false;
    }
    mySessionId = room.sessionId;
    currentRoomCode = room.roomId;
    roomCode.textContent = currentRoomCode;
    joined = true;
    connectionLabel.textContent = '● Verbunden';
    connectionLabel.style.color = '#86efac';
    joinPanel.classList.add('hidden-panel');
    roomPanel.classList.remove('hidden-panel');
    roomError.textContent = '';
    room.onMessage('lobbyState', (state) => renderLobby(state));
    room.onMessage('matchStart', (info) => showMatch(info));
    room.onMessage('lobbyError', (info) => { roomError.textContent = info.message || 'Aktion nicht möglich.'; });
    room.onMessage('players', (players) => {
      const ids = Object.keys(players);
      playersLabel.textContent = `Spieler: ${ids.length} / ${lobbyState?.maxPlayers || 16}`;
      for (const id of ids) {
        if (id === mySessionId) continue;
        if (!remotePlayers.has(id)) createRemote(id, players[id]);
        const p = remotePlayers.get(id);
        p.target.set(players[id].x || 0, 0, players[id].z || 0);
        p.mesh.rotation.y = players[id].rotation || 0;
      }
      for (const id of [...remotePlayers.keys()]) if (!players[id]) removeRemote(id);
    });
    room.onLeave(() => {
      connectionLabel.textContent = 'Getrennt';
      joined = false;
      roomPanel.classList.add('hidden-panel');
      matchPanel.classList.add('hidden-panel');
      joinPanel.classList.remove('hidden-panel');
      errorLabel.textContent = 'Verbindung zur Lobby wurde getrennt.';
    });
  } catch (error) {
    console.error(error);
    errorLabel.textContent = error.message || 'Verbindung fehlgeschlagen. Läuft der Multiplayer-Server?';
  } finally {
    createButton.disabled = joinButton.disabled = false;
    createButton.textContent = 'LOBBY ERSTELLEN';
    joinButton.textContent = 'LOBBY BEITRETEN';
  }
}
createButton.addEventListener('click', () => connectToRoom('create'));
joinButton.addEventListener('click', () => connectToRoom('join'));

readyButton.addEventListener('click', () => {
  if (!room) return;
  myReady = !myReady;
  room.send('ready', { ready: myReady });
});
startMatchButton.addEventListener('click', () => {
  if (!room || !currentIsHost) return;
  const mode = selectedMode();
  const count = Math.max(1, Math.min(10, Number(roundCount.value) || 5));
  let selectedGames;
  if (mode === 'custom') {
    selectedGames = [...gamePicker.querySelectorAll('input:checked')].map(input => input.value);
    if (selectedGames.length === 0) {
      roomError.textContent = 'Wähle mindestens ein Minispiel aus.';
      return;
    }
  } else {
    selectedGames = [];
  }
  roomError.textContent = '';
  room.send('startMatch', { mode, count, selectedGames });
});
document.querySelector('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(currentRoomCode);
    document.querySelector('#copy-code').textContent = 'KOPIERT ✓';
  } catch {
    roomError.textContent = `Lobby-Code: ${currentRoomCode}`;
  }
});
document.querySelector('#leave-room').addEventListener('click', async () => {
  if (room) await room.leave();
});
document.querySelector('#back-to-lobby').addEventListener('click', () => {
  matchPanel.classList.add('hidden-panel');
  roomPanel.classList.remove('hidden-panel');
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
