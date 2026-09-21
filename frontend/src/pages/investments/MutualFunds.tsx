import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

export default function InvestmentsMutualFunds() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mutual Funds</h1>
        <p className="text-muted-foreground mt-2">
          Explore and invest in mutual funds
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mutual Funds</CardTitle>
          <CardDescription>Browse and manage mutual fund investments</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Explore various mutual funds, compare performance, and build a diversified portfolio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
