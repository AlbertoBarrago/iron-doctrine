/**
 * Network transport port + WebSocket implementation. The rest of the client depends on
 * the `Transport` interface, not on WebSocket directly, so the relay can be swapped for
 * an authoritative-server transport (or a mock in tests) without touching game code.
 */
import {
  decodeServer,
  encode,
  type ClientMessage,
  type ServerMessage,
} from '@iron/shared';

export interface Transport {
  onMessage(handler: (msg: ServerMessage) => void): void;
  send(msg: ClientMessage): void;
  close(): void;
}

export class WebSocketTransport implements Transport {
  private readonly ws: WebSocket;
  private handler: ((msg: ServerMessage) => void) | null = null;
  private readonly outbox: ClientMessage[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      // Flush anything queued before the socket opened.
      for (const msg of this.outbox.splice(0)) this.ws.send(encode(msg));
    };
    this.ws.onmessage = (ev: MessageEvent<string>) => {
      if (this.handler) this.handler(decodeServer(ev.data));
    };
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.handler = handler;
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
    else this.outbox.push(msg);
  }

  close(): void {
    this.ws.close();
  }
}
