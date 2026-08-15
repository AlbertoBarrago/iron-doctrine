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
  /** Called once the socket drops, whether by error or a clean close from either side. */
  onDisconnect(handler: () => void): void;
  send(msg: ClientMessage): void;
  close(): void;
}

export class WebSocketTransport implements Transport {
  private readonly ws: WebSocket;
  private handler: ((msg: ServerMessage) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
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
    this.ws.onclose = () => this.disconnect();
    this.ws.onerror = () => this.disconnect();
  }

  onMessage(handler: (msg: ServerMessage) => void): void {
    this.handler = handler;
  }

  onDisconnect(handler: () => void): void {
    this.disconnectHandler = handler;
  }

  send(msg: ClientMessage): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(encode(msg));
    else this.outbox.push(msg);
  }

  close(): void {
    this.ws.close();
    this.disconnect();
  }

  private disconnect(): void {
    this.outbox.length = 0;
    this.handler = null;
    const handler = this.disconnectHandler;
    this.disconnectHandler = null;
    handler?.();
  }
}
