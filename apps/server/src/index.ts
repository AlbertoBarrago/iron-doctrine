/**
 * WebSocket match host entrypoint. Single-match skeleton: accepts connections,
 * registers players, relays lockstep commands, and drives the tick loop at SIM_HZ.
 * Stateless per process — horizontally scalable behind a WS-aware load balancer.
 */
import { WebSocketServer, type WebSocket } from 'ws';
import {
  SIM_DT_MS,
  PROTOCOL_VERSION,
  asTick,
  decodeClient,
  encode,
  type ServerMessage,
} from '@iron/shared';
import { MatchRelay } from './match.js';

const PORT = Number(process.env.PORT ?? 8080);
const SEED = Number(process.env.MATCH_SEED ?? 123456789);
const MAP_ID = process.env.MATCH_MAP ?? 'canyon_clash';

const relay = new MatchRelay(SEED, MAP_ID);
const wss = new WebSocketServer({ port: PORT });

const send = (ws: WebSocket, msg: ServerMessage): void => ws.send(encode(msg));

wss.on('connection', (ws) => {
  const player = relay.addPlayer('anonymous', (raw) => ws.send(raw));

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
        player.name = msg.name;
        if (!relay.isRunning) {
          relay.start();
          for (const client of wss.clients) send(client, { t: 'start', startTick: asTick(0) });
        }
        break;
      case 'command':
        relay.enqueue(player.id, msg.execTick, msg.cmd);
        break;
      case 'leave':
        ws.close();
        break;
    }
  });

  ws.on('close', () => relay.removePlayer(player.id));
});

// Fixed-cadence host loop: dispatch one confirmed tick every SIM_DT_MS.
setInterval(() => {
  if (relay.isRunning) relay.advance();
}, SIM_DT_MS);

console.warn(`[iron-server] listening on ws://localhost:${PORT} (map=${MAP_ID}, seed=${SEED})`);
