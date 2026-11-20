import { useEffect, useState } from 'react';
import { Tabs, Tab } from '@dynatrace/strato-components/navigation';
import { Button } from '@dynatrace/strato-components/buttons';
import { PlayTab } from './ui/PlayTab';
import { BotsTab } from './ui/BotsTab';
import { RanksTab } from './ui/RanksTab';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { setPrefs, useStore } from './game/store';
import { setMuted, unlockAudio } from './game/audio';

export function App() {
  const muted = useStore((s) => s.prefs.muted);
  const [tab, setTab] = useState(0);

  useEffect(() => setMuted(muted), [muted]);
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-ball">⚽</span>
          <span>
            Foos<b>Bots</b>
          </span>
        </div>
        <Button onClick={() => setPrefs({ muted: !muted })} aria-label={muted ? 'Unmute' : 'Mute'} size="condensed">
          {muted ? '🔇' : '🔊'}
        </Button>
      </header>
      <main className="app-main">
        <Tabs selectedIndex={tab} onChange={setTab}>
          <Tab title="Play" keepMounted>
            <div className="tab-pad">
              <ErrorBoundary label="PlayTab">
                <PlayTab />
              </ErrorBoundary>
            </div>
          </Tab>
          <Tab title="Bots">
            <div className="tab-pad">
              <ErrorBoundary label="BotsTab">
                <BotsTab />
              </ErrorBoundary>
            </div>
          </Tab>
          <Tab title="Ranks">
            <div className="tab-pad">
              <ErrorBoundary label="RanksTab">
                <RanksTab />
              </ErrorBoundary>
            </div>
          </Tab>
        </Tabs>
      </main>
    </div>
  );
}
