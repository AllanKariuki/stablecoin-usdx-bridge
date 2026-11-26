package ledger

import (
	"context"
	"math/big"
	"time"
)

// ---------------------------------------------------------------------------
// Treasury rebalances — the house closing (or reopening) a custodial-crypto
// position by trading at a custodian.
//
// A customer conversion puts the house short: the customer's wallet (a
// liability) grows while "crypto at custodian" is untouched, and the FX
// position account absorbs the difference. A rebalance is the treasury
// desk's answer: the platform actually buys or sells the crypto at a
// custodian, and the journal moves it from the FX position into the custody
// account (or back). Until a BUY rebalance is posted, the house is short
// the currency by exactly the customer liability — the net_exposure
// services/rms' GET /treasury/positions reports as negative.
// ---------------------------------------------------------------------------

type TreasuryRebalanceRequest struct {
	Side           string   // "BUY" (treasury bought crypto with fiat) or "SELL"
	Currency       string   // custodial crypto being bought or sold
	Amount         *big.Int // smallest units of Currency
	FiatCurrency   string   // the fiat leg of the trade
	FiatAmount     *big.Int // smallest units of FiatCurrency
	CustodianRef   string   // the custodian's trade reference (the external evidence)
	Note           string
	IdempotencyKey string
	ValueDate      time.Time
	InitiatedBy    string
}

// TreasuryRebalance posts the journal for one treasury desk trade.
//
// BUY (treasury bought crypto with fiat at a custodian):
//
//	crypto leg:  DR  Crypto at custodian (C)  amount
//	             CR  FX position (C)          amount
//	fiat leg:    DR  FX position (F)          fiat_amount
//	             CR  Cash at custodian (F)    fiat_amount
//
// SELL is the mirror. Each currency's leg balances on its own, exactly like
// a conversion's — the two amounts are in different units and are related
// only by the price the desk actually traded at.
func (s *Service) TreasuryRebalance(ctx context.Context, req TreasuryRebalanceRequest) (*Transaction, error) {
	if err := requirePositive(req.Amount); err != nil {
		return nil, err
	}
	if err := requirePositive(req.FiatAmount); err != nil {
		return nil, err
	}
	buy, sell := req.Side == "BUY", req.Side == "SELL"
	if !buy && !sell {
		return nil, postErr("INVALID_REBALANCE_SIDE", "side must be BUY or SELL, got %q", req.Side)
	}

	crypto, err := s.repo.Currency(ctx, req.Currency)
	if err != nil {
		return nil, err
	}
	if !IsCustodialCrypto(crypto.Code) {
		return nil, postErr("NOT_CUSTODIAL_CRYPTO",
			"treasury rebalances custodial crypto only; %s is %s", crypto.Code, crypto.Kind)
	}
	fiat, err := s.repo.Currency(ctx, req.FiatCurrency)
	if err != nil {
		return nil, err
	}
	if fiat.Kind != CurrencyFiat {
		return nil, postErr("NOT_A_FIAT_CURRENCY",
			"the fiat leg must be a fiat currency; %s is %s", fiat.Code, fiat.Kind)
	}

	custody, err := s.systemAccount(ctx, GLCryptoCustody(crypto.Code))
	if err != nil {
		return nil, err
	}
	cryptoPos, err := s.systemAccount(ctx, GLFxPosition(crypto.Code))
	if err != nil {
		return nil, err
	}
	fiatPos, err := s.systemAccount(ctx, GLFxPosition(fiat.Code))
	if err != nil {
		return nil, err
	}
	bank, err := s.systemAccount(ctx, GLTrustBank(fiat.Code))
	if err != nil {
		return nil, err
	}

	var postings []Posting
	// The floors guard the two real ASSET accounts: a BUY pays fiat the trust
	// bank does not hold, and a SELL delivers crypto the custodian does not
	// hold. Either would leave a negative asset balance that no later flow
	// can explain, so the posting engine refuses it the way it refuses an
	// overdrawn wallet.
	var nonNegative []string
	if buy {
		postings = []Posting{
			debit(custody.ID, crypto.Code, req.Amount, "Crypto purchased at custodian"),
			credit(cryptoPos.ID, crypto.Code, req.Amount, "FX position "+crypto.Code),
			debit(fiatPos.ID, fiat.Code, req.FiatAmount, "FX position "+fiat.Code),
			credit(bank.ID, fiat.Code, req.FiatAmount, "Fiat paid from custodian"),
		}
		nonNegative = []string{bank.ID}
	} else {
		// SELL is BUY's exact mirror, fiat leg included: the custodian pays
		// the trade out in fiat, which is cash INTO the trust bank (debit on
		// an asset) and off the fiat FX position (credit).
		postings = []Posting{
			credit(custody.ID, crypto.Code, req.Amount, "Crypto sold at custodian"),
			debit(cryptoPos.ID, crypto.Code, req.Amount, "FX position "+crypto.Code),
			credit(fiatPos.ID, fiat.Code, req.FiatAmount, "FX position "+fiat.Code),
			debit(bank.ID, fiat.Code, req.FiatAmount, "Fiat received at custodian"),
		}
		nonNegative = []string{custody.ID}
	}

	// The entity back-reference names the trade's external evidence. A
	// custodian reference is that; when the caller has none, the idempotency
	// key is the only stable handle the journal has for this trade.
	entityID := req.CustodianRef
	if entityID == "" {
		entityID = req.IdempotencyKey
	}

	return s.repo.Post(ctx, PostRequest{
		Type:           TxTreasuryRebal,
		IdempotencyKey: req.IdempotencyKey,
		ValueDate:      req.ValueDate,
		Description: "Treasury rebalance: " + req.Side + " " +
			FormatDecimal(req.Amount, crypto.Decimals) + " " + crypto.Code + " with " +
			FormatDecimal(req.FiatAmount, fiat.Decimals) + " " + fiat.Code,
		EntityType:          EntityTreasuryRebalance,
		EntityID:            entityID,
		ExternalRef:         req.CustodianRef,
		InitiatedBy:         req.InitiatedBy,
		NonNegativeAccounts: nonNegative,
		Metadata: map[string]any{
			"side":          req.Side,
			"fiat_currency": fiat.Code,
			"fiat_amount":   req.FiatAmount.String(),
			"custodian_ref": req.CustodianRef,
			"note":          req.Note,
		},
		Postings: postings,
	})
}
