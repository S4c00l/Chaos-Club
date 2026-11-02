import http from 'http';
import { Server, Room } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';

const PORT = Number(process.env.PORT || 2567);
const GAME_IDS = [
  'push_arena','lava_rush','crazy_run','hot_bomb','steal_gold','giant_ball',
  'sky_fall','color_dash','king_of_hill','laser_dodge','crate_crash','ring_race',
  'ice_slide','meteor_madness','team_tug','platform_panic','coin_scramble',
  'wind_tunnel','shadow_tag','final_survivor'
];

class PartyRoom extends Room {
  onCreate(options = {}) {
    this.maxClients = Math.max(1, Math.min(16, Number(options.maxPlayers) || 16));
    this.rounds = Math.max(1, Math.min(10, Number(options.rounds) || 5));
    this.players = new Map();
    this.hostSessionId = null;
    this.matchStarted = false;

    this.onMessage('move', (client, data) => {
      const player = this.players.get(client.sessionId);
      if (!player || !data || this.matchStarted === false && !player) return;
      const x = Number(data.x), z = Number(data.z), y = Number(data.y);
      if (![x, z, y].every(Number.isFinite)) return;
      player.x = Math.max(-21, Math.min(21, x));
      player.z = Math.max(-21, Math.min(21, z));
      player.y = Math.max(0, Math.min(8, y));
      player.rotation = Number.isFinite(Number(data.rotation)) ? Number(data.rotation) : 0;
    });

    this.onMessage('ready', (client, data) => {
      const player = this.players.get(client.sessionId);
      if (!player || player.isHost || this.matchStarted) return;
      player.ready = Boolean(data?.ready);
      this.broadcastLobbyState();
    });

    this.onMessage('startMatch', (client, data) => {
      if (client.sessionId !== this.hostSessionId || this.matchStarted) {
        client.send('lobbyError', { message: 'Nur der Host kann die Runde starten.' });
        return;
      }
      const allReady = [...this.players.values()].every(p => p.isHost || p.ready);
      if (!allReady) {
        client.send('lobbyError', { message: 'Noch nicht alle Spieler sind bereit.' });
        return;
      }
      const mode = data?.mode === 'custom' ? 'custom' : 'random';
      const requestedCount = Math.max(1, Math.min(10, Number(data?.count) || this.rounds));
      let games;
      if (mode === 'custom') {
        const chosen = Array.isArray(data?.selectedGames)
          ? [...new Set(data.selectedGames.filter(id => GAME_IDS.includes(id)))]
          : [];
        if (chosen.length === 0) {
          client.send('lobbyError', { message: 'Wähle mindestens ein gültiges Minispiel aus.' });
          return;
        }
        games = chosen.sort(() => Math.random() - 0.5).slice(0, requestedCount);
        // Wenn weniger Spiele gewählt wurden als Runden, wird nicht künstlich dupliziert.
      } else {
        games = [...GAME_IDS].sort(() => Math.random() - 0.5).slice(0, Math.min(requestedCount, GAME_IDS.length));
      }
      this.matchStarted = true;
      this.broadcast('matchStart', { games, mode });
    });

    this.setSimulationInterval(() => {
      this.broadcast('players', Object.fromEntries(this.players.entries()));
    }, 50);
  }

  broadcastLobbyState() {
    this.broadcast('lobbyState', {
      maxPlayers: this.maxClients,
      rounds: this.rounds,
      hostSessionId: this.hostSessionId,
      players: [...this.players.entries()].map(([sessionId, p]) => ({ sessionId, ...p }))
    });
  }

  onJoin(client, options) {
    const name = String(options?.name || 'Spieler').slice(0, 16);
    if (!this.hostSessionId) this.hostSessionId = client.sessionId;
    const index = this.players.size;
    const angle = index * Math.PI * 2 / 16;
    this.players.set(client.sessionId, {
      name,
      x: Math.cos(angle) * 4,
      z: Math.sin(angle) * 4,
      y: 0,
      rotation: 0,
      ready: false,
      isHost: client.sessionId === this.hostSessionId
    });
    this.broadcastLobbyState();
  }

  onLeave(client) {
    this.players.delete(client.sessionId);
    if (client.sessionId === this.hostSessionId) {
      const next = this.players.keys().next();
      this.hostSessionId = next.done ? null : next.value;
      if (this.hostSessionId) this.players.get(this.hostSessionId).isHost = true;
    }
    this.broadcastLobbyState();
  }
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('CHAOS CLUB multiplayer server is running.');
});
const gameServer = new Server({ transport: new WebSocketTransport({ server: httpServer }) });
gameServer.define('party', PartyRoom);
httpServer.listen(PORT, () => console.log(`CHAOS CLUB server listening on port ${PORT}`));
