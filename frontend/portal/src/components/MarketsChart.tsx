import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Table2 } from 'lucide-react';
import { apiErrorMessage, ratesApi, type HistoryRange, type RateHistory } from '@damp/web-shared/api';
import { formatDateTime, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Card, CardHeader, DataTable, EmptyState, ErrorState, Skeleton } from '@damp/web-shared/ui';
import { change24hFor, formatPct, formatUsd, pctChange, type RateMap } from '../lib/portfolio';

/**
 * The multi-series markets chart. Fixed colours per asset (never by rank),
 * one y-axis in percent indexed from each series' own first point — the
 * percent itself is computed from the API's decimal strings with BigInts
 * and converted to a Number only where recharts plots it.
 */
const ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', color: '#D97706' },
  { symbol: 'ETH', name: 'Ethereum', color: '#6D4ED8' },
  { symbol: 'SOL', name: 'Solana', color: '#0E9F8E' },
] as const;

const RANGES: HistoryRange[] = ['1H', '1D', '1W', '1M', '1Y', 'ALL'];

type AssetSymbol = (typeof ASSETS)[number]['symbol'];

interface Row
  extends Record<AssetSymbol, number | null>,
    Record<`pc_${AssetSymbol}`, string | null>,
    Record<`p_${AssetSymbol}`, string | null> {
  t: string;
  ts: number;
}

const emptyRow = (t: string, ts: number): Row => ({
  t,
  ts,
  BTC: null,
  ETH: null,
  SOL: null,
  pc_BTC: null,
  pc_ETH: null,
  pc_SOL: null,
  p_BTC: null,
  p_ETH: null,
  p_SOL: null,
});

/** Union timeline of the three series, each indexed from its own first point. */
function buildRows(history: RateHistory | undefined): Row[] {
  if (!history) return [];
  const byTime = new Map<string, Row>();
  for (const s of history.series) {
    const first = s.points[0]?.price;
    if (!first || s.points.length < 2) continue;
    const symbol = s.symbol as AssetSymbol;
    for (const p of s.points) {
      const row = byTime.get(p.t) ?? emptyRow(p.t, new Date(p.t).getTime());
      const pct = pctChange(first, p.price, 4);
      row[symbol] = Number(pct); // Number only for plotting.
      row[`pc_${symbol}`] = pctChange(first, p.price, 2);
      row[`p_${symbol}`] = p.price;
      byTime.set(p.t, row);
    }
  }
  return [...byTime.values()].sort((a, b) => a.ts - b.ts);
}

const TIME_TICKS: Record<HistoryRange, Intl.DateTimeFormatOptions> = {
  '1H': { hour: '2-digit', minute: '2-digit' },
  '1D': { hour: '2-digit', minute: '2-digit' },
  '1W': { weekday: 'short' },
  '1M': { month: 'short', day: 'numeric' },
  '1Y': { month: 'short' },
  ALL: { month: 'short', year: '2-digit' },
};

/** Crosshair tooltip: every asset's % and price at the hovered time, a coloured swatch carries identity. */
function ChartTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: Row }> }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  return (
    <div className="min-w-44 rounded-control border border-line bg-surface px-3 py-2.5 shadow-pop">
      <p className="mb-1.5 text-xs font-semibold text-muted">{formatDateTime(row.t)}</p>
      {ASSETS.map((a) => {
        const pct = row[a.symbol];
        if (pct === null) return null;
        const up = pct >= 0;
        return (
          <div key={a.symbol} className="flex items-center justify-between gap-5 py-0.5">
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <span className="size-2.5 rounded-full" style={{ background: a.color }} aria-hidden />
              {a.symbol}
            </span>
            <span className="flex items-center gap-2 font-mono text-[12px] tabular-nums">
              <span className={up ? 'text-cyan-ink' : 'text-warn-ink'}>
                {up ? '+' : '−'}
                {row[`pc_${a.symbol}`]}%
              </span>
              <span className="text-muted">{row[`p_${a.symbol}`] ? formatUsd(row[`p_${a.symbol}`] as string) : '—'}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ChangeBadge({ pct }: { pct: string | null }) {
  if (pct === null) return <Badge tone="neutral">—</Badge>;
  const up = !pct.startsWith('-');
  return (
    <Badge tone="neutral" className={up ? 'text-cyan-ink' : 'text-warn-ink'}>
      {up ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      {formatPct(pct)}
      <span className="sr-only">{up ? '(up)' : '(down)'}</span>
    </Badge>
  );
}

export default function MarketsChart({ rates }: { rates: RateMap }) {
  const [range, setRange] = useState<HistoryRange>('1M');
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const history = useAsync(() => ratesApi.history(['BTC', 'ETH', 'SOL'], range, 'USD'), [range]);
  const rows = useMemo(() => buildRows(history.data), [history.data]);

  const lastPrice = (symbol: AssetSymbol) => {
    const board = rates.get(symbol)?.rate;
    if (board) return board;
    const series = history.data?.series.find((s) => s.symbol === symbol);
    return series?.points[series.points.length - 1]?.price ?? null;
  };

  const tableRows = useMemo(() => {
    const stride = Math.max(1, Math.ceil(rows.length / 60));
    return rows.filter((_, i) => i % stride === 0);
  }, [rows]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Markets"
        description="BTC, ETH and SOL against the dollar, from the first point of the range."
        actions={
          <Button variant="ghost" size="sm" icon={<Table2 className="size-4" aria-hidden />} aria-pressed={view === 'table'} onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}>
            {view === 'chart' ? 'View as table' : 'View as chart'}
          </Button>
        }
      />
      <div role="group" aria-label="Chart range" className="mb-4 flex flex-wrap gap-1">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={range === r}
            onClick={() => setRange(r)}
            className={
              range === r
                ? 'min-h-9 cursor-pointer rounded-[9px] bg-navy px-3 text-[13px] font-semibold text-white'
                : 'min-h-9 cursor-pointer rounded-[9px] px-3 text-[13px] font-semibold text-neutral-ink hover:bg-neutral-tint'
            }
          >
            {r}
          </button>
        ))}
      </div>

      {history.loading && !history.data ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading markets">
          <Skeleton className="h-56 w-full" />
          <div className="flex gap-8">
            {ASSETS.map((a) => (
              <Skeleton key={a.symbol} className="h-6 w-28" />
            ))}
          </div>
        </div>
      ) : history.error ? (
        <ErrorState message={apiErrorMessage(history.error)} onRetry={history.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No price history yet" className="flex-1">
          Markets fill in as prices are recorded. Check back in a few minutes.
        </EmptyState>
      ) : view === 'table' ? (
        <DataTable
          caption="BTC, ETH and SOL percent change and price over time"
          rows={tableRows}
          rowKey={(r) => r.t}
          columns={[
            { key: 'time', header: 'Time', render: (r) => <span className="whitespace-nowrap text-muted">{formatDateTime(r.t)}</span> },
            ...ASSETS.map((a) => [
              { key: `${a.symbol}pct`, header: `${a.symbol} %`, align: 'right' as const, render: (r: Row) => <span className="font-mono text-[12.5px] tabular-nums">{r[`pc_${a.symbol}`] ?? '—'}%</span> },
              { key: `${a.symbol}price`, header: `${a.symbol} price`, align: 'right' as const, hideOnMobile: true, render: (r: Row) => <span className="font-mono text-[12.5px] text-muted">{r[`p_${a.symbol}`] ? formatUsd(r[`p_${a.symbol}`] as string) : '—'}</span> },
            ]).flat(),
          ]}
        />
      ) : (
        <>
          <div className="h-60 sm:h-72" role="img" aria-label={`Percent change of BTC, ETH and SOL over ${range}`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 18, right: 28, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="#E2E8F2" vertical={false} />
                <XAxis
                  dataKey="ts"
                  type="number"
                  scale="time"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(ts) => new Intl.DateTimeFormat(undefined, TIME_TICKS[range]).format(new Date(ts))}
                  tick={{ fill: '#56627A', fontSize: 11 }}
                  axisLine={{ stroke: '#C9D3E3' }}
                  tickLine={false}
                  minTickGap={32}
                />
                <YAxis
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fill: '#56627A', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 600, paddingTop: 8 }} />
                {ASSETS.map((a) => {
                  // The label callback gets the data row index; the line ends
                  // at its own last non-null row.
                  const lastIdx = rows.reduce((acc, r, i) => (r[a.symbol] !== null ? i : acc), -1);
                  return (
                    <Line
                      key={a.symbol}
                      type="monotone"
                      dataKey={a.symbol}
                      name={a.symbol}
                      stroke={a.color}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                      connectNulls
                      isAnimationActive={false}
                      label={(props: { index?: number; x?: string | number; y?: string | number }) => {
                        const x = Number(props.x);
                        const y = Number(props.y);
                        return props.index === lastIdx && Number.isFinite(x) && Number.isFinite(y) ? (
                          <text x={x + 8} y={y + 4} fill={a.color} fontSize={11} fontWeight={700}>
                            {a.symbol}
                          </text>
                        ) : (
                          <g />
                        );
                      }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-4 m-0 flex list-none flex-col gap-1 p-0">
            {ASSETS.map((a) => {
              const price = lastPrice(a.symbol);
              const change = change24hFor(a.symbol, rates) ?? history.data?.series.find((s) => s.symbol === a.symbol)?.change_pct ?? null;
              return (
                <li key={a.symbol} className="flex items-center justify-between gap-3 rounded-[10px] px-2 py-1.5 hover:bg-canvas">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="h-5 w-1 shrink-0 rounded-full" style={{ background: a.color }} aria-hidden />
                    <span className="text-sm font-bold text-ink">{a.symbol}</span>
                    <span className="hidden truncate text-xs text-muted sm:block">{a.name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-sm font-semibold tabular-nums text-navy">{price ? formatUsd(price) : '—'}</span>
                    <ChangeBadge pct={change} />
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
