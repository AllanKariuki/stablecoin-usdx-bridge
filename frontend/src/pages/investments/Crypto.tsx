import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';

export default function InvestmentsCrypto() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cryptocurrency</h1>
        <p className="text-muted-foreground mt-2">
          Invest in digital assets
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Crypto Investments</CardTitle>
          <CardDescription>Manage your cryptocurrency portfolio</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Trade cryptocurrencies, track market prices, and manage your digital asset portfolio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
