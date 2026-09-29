import { Body, Controller, Get, Header, NotFoundException, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express-serve-static-core';
import { CurrentUser } from '../auth/current-user.decorator';
import { Permissions } from '../auth/permissions.decorator';
import { toCsv } from '../exports/csv';
import { SupersetService } from '../superset/superset.service';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly superset: SupersetService,
  ) {}

  @Get('reports')
  async definitions() {
    return { reports: await this.reports.definitions() };
  }

  @Get('reports/runs')
  async runs(@Query('limit') limit?: string) {
    const runs = await this.reports.runs(limit ? Number(limit) : undefined);
    // The result is omitted from the list: a trial balance's rows in a list
    // of fifty runs is megabytes nobody asked for.
    return {
      runs: runs.map((r) => ({
        id: r.id,
        kind: r.kind,
        status: r.status,
        rowCount: r.rowCount,
        requestedBy: r.requestedBy,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt?.toISOString() ?? null,
        error: r.error || null,
      })),
    };
  }

  @Get('reports/runs/:runId')
  async run(@Param('runId') runId: string) {
    const run = await this.reports.findRun(runId);
    if (!run) throw new NotFoundException('no such report run');
    return {
      ...run,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  @Post('reports/:definitionId/run')
  async runReport(
    @CurrentUser() partyId: string,
    @Param('definitionId') definitionId: string,
    @Body() body: Record<string, unknown>,
  ) {
    const run = await this.reports.run(definitionId, body ?? {}, partyId);
    return {
      ...run,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    };
  }

  /**
   * Downloads a completed run as CSV.
   *
   * It exports the **stored** result, never a fresh query. A download that
   * re-ran the report would hand somebody a file that disagrees with the run
   * id printed on it, which defeats the point of the run being a record.
   *
   * The result hash goes in a header so a file can be proved to match the run
   * it claims to come from.
   */
  @Get('reports/runs/:runId/export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@Param('runId') runId: string, @Res() res: Response) {
    const run = await this.reports.findRun(runId);
    if (!run) throw new NotFoundException('no such report run');
    if (run.status !== 'COMPLETE' || !run.result) {
      throw new NotFoundException(`this run is ${run.status}; only a completed run can be exported`);
    }

    const csv = toCsv(run.result.columns, run.result.rows);
    res.setHeader('Content-Disposition', `attachment; filename="${run.kind.toLowerCase()}_${run.id}.csv"`);
    res.setHeader('X-Report-Result-Hash', run.resultHash);
    res.setHeader('X-Report-Run-Id', run.id);
    res.send(csv);
  }

  /**
   * A guest token for an embedded Superset dashboard.
   *
   * This route is the fix for a real hole: the frontend was calling
   * Superset's guest-token endpoint *from the browser*, and that endpoint
   * requires a Superset admin bearer token. Minting happens here, where the
   * admin credential lives.
   *
   * The permissions used for row-level security are the ones auth-proxy
   * resolved and forwarded, not anything the request body claims.
   */
  @Post('reports/dashboards/:dashboardId/guest-token')
  async guestToken(
    @CurrentUser() partyId: string,
    @Permissions() permissions: string[],
    @Param('dashboardId') dashboardId: string,
  ) {
    // `permissions` comes from the X-Permissions header auth-proxy set and
    // Traefik stripped from the inbound request — never from a body field,
    // which would be the caller telling us what they are allowed to see.
    return this.superset.guestToken({ dashboardId, partyId, permissions });
  }
}
