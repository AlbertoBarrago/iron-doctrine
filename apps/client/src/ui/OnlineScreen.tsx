import { useRef, useState } from 'react';
import { NetworkClient } from '../infra/net/NetworkClient.js';
import { WebSocketTransport } from '../infra/net/Transport.js';

type ConnectState = 'form' | 'connecting' | 'waiting' | 'rejected' | 'ready';

interface Welcome {
  playerId: number;
  seed: number;
  mapId: string;
}

const MATCH_SERVER_URL =
  (import.meta.env.VITE_MATCH_SERVER_URL as string | undefined) ?? 'ws://localhost:8080';

/** Minimal online-match connect flow: name + password, then wait for the opponent. */
export function OnlineScreen({
  onBack,
  onReady,
}: {
  onBack: () => void;
  onReady: (client: NetworkClient, playerId: number, seed: number, mapId: string) => void;
}): JSX.Element {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<ConnectState>('form');
  const welcomeRef = useRef<Welcome | null>(null);

  const connect = (): void => {
    setState('connecting');
    const transport = new WebSocketTransport(MATCH_SERVER_URL);
    const client = new NetworkClient(transport, {
      onWelcome: (playerId, seed, mapId) => {
        welcomeRef.current = { playerId, seed, mapId };
        setState('waiting');
      },
      onStart: () => {
        const welcome = welcomeRef.current;
        if (!welcome) return;
        setState('ready');
        onReady(client, welcome.playerId, welcome.seed, welcome.mapId);
      },
      onTick: () => {},
      onRejected: () => {
        setState('rejected');
        transport.close();
      },
    });
    client.join(name.trim() || 'commander', password);
  };

  return (
    <main className="start-screen">
      <section className="main-menu" aria-label="Online match">
        <header className="main-menu__title">
          <span>Field Command presents</span>
          <h1>
            <span>Online</span>
            Match
          </h1>
          <p>Connect to a private session</p>
        </header>

        {state === 'form' && (
          <form
            className="mission-setup"
            onSubmit={(ev) => {
              ev.preventDefault();
              connect();
            }}
          >
            <label>
              Callsign
              <input
                type="text"
                value={name}
                onChange={(ev) => setName(ev.target.value)}
                placeholder="commander"
              />
            </label>
            <label>
              Session password
              <input
                type="password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
              />
            </label>
            <button type="submit">Connect</button>
            <button type="button" onClick={onBack}>
              Back
            </button>
          </form>
        )}

        {state === 'connecting' && <p>Connecting...</p>}
        {state === 'waiting' && <p>Connected. Waiting for the opponent...</p>}
        {state === 'ready' && <p>Opponent joined. Entering the match...</p>}
        {state === 'rejected' && (
          <>
            <p>Wrong password.</p>
            <button type="button" onClick={() => setState('form')}>
              Try again
            </button>
          </>
        )}

        <button type="button" onClick={onBack}>
          Back to menu
        </button>
      </section>
    </main>
  );
}
