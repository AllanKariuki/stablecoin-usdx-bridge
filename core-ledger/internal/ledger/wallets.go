package ledger

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// A wallet and the account behind it are created together or not at all — a
// wallet without its liability account would be a balance with nowhere to
// live, and an orphan account would show up in the trial balance forever.

// EnsureWallet returns the user's wallet for a currency (and chain, for
// on-chain currencies), creating it and its LIABILITY account on first use.
// It is idempotent: two concurrent first-time requests both end up with the
// same wallet rather than two.
func (r *Repository) EnsureWallet(ctx context.Context, userID, currency, chain, address, label string) (*Wallet, error) {
	if userID == "" {
		return nil, postErr("MISSING_USER", "a wallet needs an owner")
	}
	cur, err := r.Currency(ctx, currency)
	if err != nil {
		return nil, err
	}
	if cur.Kind == CurrencyCrypto && chain == "" {
		return nil, postErr("MISSING_CHAIN", "%s is an on-chain currency; a wallet in it must name a chain", currency)
	}
	if cur.Kind == CurrencyFiat && chain != "" {
		return nil, postErr("UNEXPECTED_CHAIN", "%s is a fiat currency; a wallet in it cannot be on chain %s", currency, chain)
	}

	if w, err := r.WalletFor(ctx, userID, currency, chain); err == nil {
		return w, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	parent, err := r.AccountByGLCode(ctx, GLWalletParent(currency))
	if err != nil {
		return nil, err
	}

	w := &Wallet{
		ID:       uuid.New().String(),
		UserID:   userID,
		Currency: currency,
		Chain:    chain,
		Address:  address,
		Status:   WalletActive,
		Label:    label,
	}
	w.AccountID = AccountIDFor(GLWallet(currency, w.ID))

	err = r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(newWalletAccount(w, parent)).Error; err != nil {
			return err
		}
		// DoNothing rather than an error: if another request created this
		// user's wallet for this currency a millisecond ago, the unique index
		// on (user_id, currency, chain) catches it and we return theirs.
		return tx.Clauses(clause.OnConflict{DoNothing: true}).Create(w).Error
	})
	if err != nil {
		return nil, err
	}

	return r.WalletFor(ctx, userID, currency, chain)
}

func (r *Repository) WalletFor(ctx context.Context, userID, currency, chain string) (*Wallet, error) {
	var w Wallet
	err := r.db.WithContext(ctx).
		First(&w, "user_id = ? AND currency = ? AND chain = ?", userID, currency, chain).Error
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (r *Repository) Wallet(ctx context.Context, id string) (*Wallet, error) {
	var w Wallet
	if err := r.db.WithContext(ctx).First(&w, "id = ?", id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, postErr("UNKNOWN_WALLET", "no wallet %s", id)
		}
		return nil, err
	}
	return &w, nil
}

func (r *Repository) WalletsOf(ctx context.Context, userID string) ([]Wallet, error) {
	var ws []Wallet
	err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("currency, chain").Find(&ws).Error
	return ws, err
}

// SetWalletStatus freezes, unfreezes or closes a wallet, carrying the change
// through to its account so the posting engine enforces it. Doing it in one
// database transaction is what stops a wallet from reading FROZEN to the
// customer while its account still accepts postings.
func (r *Repository) SetWalletStatus(ctx context.Context, walletID string, status WalletStatus) error {
	w, err := r.Wallet(ctx, walletID)
	if err != nil {
		return err
	}

	var acctStatus AccountStatus
	switch status {
	case WalletActive:
		acctStatus = AccountActive
	case WalletFrozen:
		acctStatus = AccountFrozen
	case WalletClosed:
		acctStatus = AccountClosed
	default:
		return postErr("INVALID_WALLET_STATUS", "unknown wallet status %q", status)
	}

	if status == WalletClosed {
		// Closing an account that still holds money would strand it: the
		// balance stays in the trial balance but nothing can ever move it out.
		bal, err := r.Balance(ctx, w.AccountID)
		if err != nil {
			return err
		}
		if bal.Sign() != 0 {
			return postErr("WALLET_NOT_EMPTY", "wallet %s still holds a balance of %s; move it out before closing", walletID, bal)
		}
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&Wallet{}).Where("id = ?", walletID).Update("status", status).Error; err != nil {
			return err
		}
		return tx.Model(&Account{}).Where("id = ?", w.AccountID).Update("status", acctStatus).Error
	})
}
