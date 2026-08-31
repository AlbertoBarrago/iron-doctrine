/**
 * WebSocket match host entrypoint. Single-match skeleton: accepts connections,
 * registers players, relays lockstep commands, and drives the tick loop at SIM_HZ.
 * Stateless per process — horizontally scalable behind a WS-aware load balancer.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import {
  SIM_DT_MS,
  PROTOCOL_VERSION,
  decodeClient,
  encode,
  type ServerMessage,
} from '@iron/shared';
import { MatchRelay } from './match.js';

const PORT = Number(process.env.PORT ?? 8080);
const SEED = Number(process.env.MATCH_SEED ?? 123456789);
const MAP_ID = process.env.MATCH_MAP ?? 'canyon_clash';
const MATCH_PASSWORD = process.env.MATCH_PASSWORD ?? '';

const relay = new MatchRelay(SEED, MAP_ID);
const wss = new WebSocketServer({ port: PORT });

const send = (ws: WebSocket, msg: ServerMessage): void => ws.send(encode(msg));

wss.on('connection', (ws) => {
  const player = relay.addPlayer('anonymous', (raw) => ws.send(raw));
  console.warn(`[iron-server] connection: player ${player.id} (${relay.playerCount} connected)`);

  send(ws, {
    t: 'welcome',
    v: PROTOCOL_VERSION,
    playerId: player.id,
    seed: relay.seed,
    mapId: relay.mapId,
  });

  ws.on('message', (data) => {
    let msg: ReturnType<typeof decodeClient>;
    try {
      msg = decodeClient(data.toString());
    } catch {
      return; // ignore malformed frames
    }
    switch (msg.t) {
      case 'join':
        if (msg.v !== PROTOCOL_VERSION) {
          relay.removePlayer(player.id);
          ws.close();
          break;
        }
        if (MATCH_PASSWORD && msg.password !== MATCH_PASSWORD) {
          console.warn(`[iron-server] rejected: player ${player.id} bad password`);
          send(ws, { t: 'rejected', reason: 'bad_password' });
          ws.close();
          return;
        }
        player.name = msg.name;
        console.warn(`[iron-server] joined: player ${player.id} as "${player.name}"`);
        if (!relay.isRunning && relay.playerCount >= 2) {
          console.warn(`[iron-server] match starting (${relay.playerCount} players)`);
          relay.start();
          for (const client of wss.clients) send(client, { t: 'start', startTick: relay.nextTick });
        } else {
          // Match already running: this player missed the initial broadcast, so
          // bootstrap them individually at the next tick instead of one they'd
          // never see (see relay.nextTick).
          send(ws, { t: 'start', startTick: relay.nextTick });
        }
        break;
      case 'command':
        relay.enqueue(player.id, msg.execTick, msg.cmd);
        break;
      case 'stateHash': {
        const mismatchedTick = relay.reportHash(msg.tick, msg.hash);
        if (mismatchedTick !== null) {
          for (const client of wss.clients) send(client, { t: 'desync', tick: mismatchedTick });
        }
        break;
      }
      case 'leave':
        ws.close();
        break;
    }
  });

  ws.on('close', () => {
    relay.removePlayer(player.id);
    console.warn(`[iron-server] disconnected: player ${player.id} (${relay.playerCount} remaining)`);
    for (const client of wss.clients) send(client, { t: 'playerLeft', playerId: player.id });
  });
});

// Fixed-cadence host loop: dispatch one confirmed tick every SIM_DT_MS.
setInterval(() => {
  if (relay.isRunning) relay.advance();
}, SIM_DT_MS);

console.warn(`[iron-server] listening on ws://localhost:${PORT} (map=${MAP_ID}, seed=${SEED})`);
