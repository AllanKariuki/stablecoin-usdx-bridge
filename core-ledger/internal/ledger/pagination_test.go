package ledger

import (
	"testing"
	"time"
)

// TestIntegrationListTransactionsPage_KeysetPaginationHasNoGapsOrOverlap
// drives ListTransactionsPage exactly the way the API handler does — page,
// take the last row's (created_at, id) as the next cursor, page again — and
// checks the two pages are disjoint and together cover everything this test
// created, in the documented newest-first order. A shared, never-truncated
// test database (see testRepo's doc comment) means this can't assert an
// absolute total count, only that pagination itself doesn't drop or repeat
// rows.
func TestIntegrationListTransactionsPage_KeysetPaginationHasNoGapsOrOverlap(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	user := uniqueUser(t)

	w, err := repo.EnsureWallet(ctx, user, "USD", "", "", "Main")
	if err != nil {
		t.Fatalf("EnsureWallet: %v", err)
	}

	const depositCount = 5
	var created []string
	for i := 0; i < depositCount; i++ {
		tx, err := svc.Deposit(ctx, DepositRequest{
			WalletID: w.ID, Amount: n(10_00), IdempotencyKey: key(t, "dep"+string(rune('a'+i))), BankRef: "BANK",
		})
		if err != nil {
			t.Fatalf("Deposit %d: %v", i, err)
		}
		created = append(created, tx.ID)
	}

	firstPage, err := repo.ListTransactionsPage(ctx, user, time.Time{}, "", 3)
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if len(firstPage) != 3 {
		t.Fatalf("expected 3 rows in the first page, got %d", len(firstPage))
	}

	last := firstPage[len(firstPage)-1]
	secondPage, err := repo.ListTransactionsPage(ctx, user, last.CreatedAt, last.ID, 10)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}

	seen := map[string]bool{}
	for _, tx := range firstPage {
		seen[tx.ID] = true
	}
	for _, tx := range secondPage {
		if seen[tx.ID] {
			t.Fatalf("transaction %s appeared in both pages — keyset cursor overlapped", tx.ID)
		}
		seen[tx.ID] = true
	}
	for _, id := range created {
		if !seen[id] {
			t.Fatalf("transaction %s from this test never appeared across either page", id)
		}
	}

	// Newest-first: each row's created_at must be >= the next row's.
	all := append(append([]Transaction{}, firstPage...), secondPage...)
	for i := 1; i < len(all); i++ {
		if all[i-1].CreatedAt.Before(all[i].CreatedAt) {
			t.Fatalf("row %d (created_at %v) is older than row %d (created_at %v) — not newest-first",
				i-1, all[i-1].CreatedAt, i, all[i].CreatedAt)
		}
	}
}

func TestIntegrationListTransactionsPage_FiltersByUserID(t *testing.T) {
	repo, svc, ctx := testRepo(t)
	userA := uniqueUser(t)
	userB := uniqueUser(t)

	walletA, err := repo.EnsureWallet(ctx, userA, "USD", "", "", "A")
	if err != nil {
		t.Fatalf("EnsureWallet A: %v", err)
	}
	walletB, err := repo.EnsureWallet(ctx, userB, "USD", "", "", "B")
	if err != nil {
		t.Fatalf("EnsureWallet B: %v", err)
	}

	txA, err := svc.Deposit(ctx, DepositRequest{WalletID: walletA.ID, Amount: n(10_00), IdempotencyKey: key(t, "a")})
	if err != nil {
		t.Fatalf("Deposit A: %v", err)
	}
	if _, err := svc.Deposit(ctx, DepositRequest{WalletID: walletB.ID, Amount: n(10_00), IdempotencyKey: key(t, "b")}); err != nil {
		t.Fatalf("Deposit B: %v", err)
	}

	page, err := repo.ListTransactionsPage(ctx, userA, time.Time{}, "", 50)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(page) != 1 || page[0].ID != txA.ID {
		t.Fatalf("expected exactly userA's one transaction (%s), got %d rows", txA.ID, len(page))
	}
}

func TestIntegrationListAccountsPage_KeysetPaginationHasNoGapsOrOverlap(t *testing.T) {
	repo, _, ctx := testRepo(t)

	firstPage, err := repo.ListAccountsPage(ctx, "", 3)
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if len(firstPage) != 3 {
		t.Fatalf("expected 3 rows (the seeded chart of accounts has far more than 3), got %d", len(firstPage))
	}

	last := firstPage[len(firstPage)-1]
	secondPage, err := repo.ListAccountsPage(ctx, last.GLCode, 3)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}

	seen := map[string]bool{}
	for _, a := range firstPage {
		seen[a.GLCode] = true
	}
	for _, a := range secondPage {
		if seen[a.GLCode] {
			t.Fatalf("gl_code %s appeared in both pages — keyset cursor overlapped", a.GLCode)
		}
		seen[a.GLCode] = true
	}

	// Ascending gl_code order, strictly increasing across the page boundary.
	all := append(append([]Account{}, firstPage...), secondPage...)
	for i := 1; i < len(all); i++ {
		if all[i-1].GLCode >= all[i].GLCode {
			t.Fatalf("gl_code not strictly ascending: %q then %q", all[i-1].GLCode, all[i].GLCode)
		}
	}
}
