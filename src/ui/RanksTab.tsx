import { useMemo, useState } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { Flex, Surface } from '@dynatrace/strato-components/layouts';
import { Text, Strong } from '@dynatrace/strato-components/typography';
import { Modal } from '@dynatrace/strato-components/overlays';
import { DataTable, type DataTableColumnDef } from '@dynatrace/strato-components/tables';
import { BotBadge, pct } from './common';
import { botById, emptyRecord, resetRecords, useStore } from '../game/store';

interface Row {
  rank: number;
  id: string;
  name: string;
  elo: number;
  winRate: number;
  wins: number;
  losses: number;
  played: number;
  diff: number;
}

export function RanksTab() {
  const bots = useStore((s) => s.bots);
  const records = useStore((s) => s.records);
  const history = useStore((s) => s.history);
  const [confirm, setConfirm] = useState(false);

  const rows: Row[] = useMemo(() => {
    const list = bots.map((b) => {
      const r = records[b.id] ?? emptyRecord();
      return {
        rank: 0,
        id: b.id,
        name: b.name,
        elo: Math.round(r.elo),
        winRate: pct(r.wins, r.played),
        wins: r.wins,
        losses: r.losses,
        played: r.played,
        diff: r.gf - r.ga,
      };
    });
    list.sort((a, b) => b.elo - a.elo || b.winRate - a.winRate);
    list.forEach((r, i) => (r.rank = i + 1));
    return list;
  }, [bots, records]);

  const columns: DataTableColumnDef<Row>[] = useMemo(
    () => [
      { id: 'rank', header: '#', accessor: 'rank', width: 36, alignment: 'center' },
      {
        id: 'name',
        header: 'Bot',
        accessor: 'name',
        width: '2fr',
        minWidth: 110,
        cell: ({ rowData }) => {
          const b = botById(rowData.id);
          return <DataTable.DefaultCell>{b ? <BotBadge bot={b} size={16} /> : rowData.name}</DataTable.DefaultCell>;
        },
      },
      { id: 'elo', header: 'Elo', accessor: 'elo', width: 54, alignment: 'right' },
      {
        id: 'winRate',
        header: 'Win %',
        accessor: 'winRate',
        width: 62,
        alignment: 'right',
        cell: ({ value, rowData }) => <DataTable.DefaultCell>{rowData.played ? `${value}%` : '–'}</DataTable.DefaultCell>,
      },
      {
        id: 'wl',
        header: 'W-L',
        accessor: (r: Row) => r.wins - r.losses,
        width: 58,
        alignment: 'right',
        cell: ({ rowData }) => (
          <DataTable.DefaultCell>
            {rowData.wins}-{rowData.losses}
          </DataTable.DefaultCell>
        ),
      },
      {
        id: 'diff',
        header: '+/-',
        accessor: 'diff',
        width: 48,
        alignment: 'right',
        cell: ({ value }) => <DataTable.DefaultCell>{value > 0 ? `+${value}` : value}</DataTable.DefaultCell>,
      },
    ],
    [],
  );

  const top = rows[0];
  const topBot = top && top.played ? botById(top.id) : undefined;

  return (
    <Flex flexDirection="column" gap={12}>
      {topBot && (
        <Surface className="leader-card" style={{ borderColor: topBot.look.color }}>
          <Flex alignItems="center" gap={12}>
            <span className="crown">👑</span>
            <Flex flexDirection="column" gap={2} style={{ minWidth: 0 }}>
              <BotBadge bot={topBot} size={22} bold />
              <Text className="small muted">
                Elo {top.elo} · {top.winRate}% wins · {top.played} games
              </Text>
            </Flex>
          </Flex>
        </Surface>
      )}
      <div className="table-wrap">
        <DataTable data={rows} columns={columns} sortable fullWidth variant={{ rowDensity: 'condensed', rowSeparation: 'zebraStripes' }} />
      </div>
      <Flex justifyContent="space-between" alignItems="center">
        <Text className="small muted">
          <Strong>{history.length}</Strong> matches logged · Elo starts at 1000
        </Text>
        <Button color="critical" size="condensed" onClick={() => setConfirm(true)} disabled={!history.length && !Object.keys(records).length}>
          Reset
        </Button>
      </Flex>
      {history.length > 0 && (
        <Surface>
          <Flex flexDirection="column" gap={6}>
            <Text className="small muted">Recent</Text>
            {history.slice(0, 8).map((h, i) => {
              const a = botById(h.a);
              const b = botById(h.b);
              if (!a || !b) return null;
              return (
                <div key={i} className="recent-row">
                  <span className={h.winner === 'a' ? 'win-name' : 'lose-name'}>
                    <BotBadge bot={a} size={14} />
                  </span>
                  <span className="recent-score">
                    {h.scoreA}–{h.scoreB}
                    {h.overtime ? ' OT' : ''}
                  </span>
                  <span className={h.winner === 'b' ? 'win-name' : 'lose-name'}>
                    <BotBadge bot={b} size={14} />
                  </span>
                </div>
              );
            })}
          </Flex>
        </Surface>
      )}
      <Modal
        title="Reset leaderboard?"
        show={confirm}
        size="small"
        onDismiss={() => setConfirm(false)}
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              color="critical"
              variant="emphasized"
              onClick={() => {
                resetRecords();
                setConfirm(false);
              }}
            >
              Reset
            </Button>
          </Flex>
        }
      >
        <Text>All records and Elo scores go back to zero.</Text>
      </Modal>
    </Flex>
  );
}
