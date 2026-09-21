import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

export default function InvestmentsBonds() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Bonds</h1>
        <p className="text-muted-foreground mt-2">
          Invest in fixed income securities
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bond Investments</CardTitle>
          <CardDescription>Explore and manage bond holdings</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Browse available bonds, view yields, and manage your fixed income portfolio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
