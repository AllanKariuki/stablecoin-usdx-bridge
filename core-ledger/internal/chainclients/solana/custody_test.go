package solana

import (
	"crypto/sha256"
	"encoding/binary"
	"math"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
)

// Anchor matches accounts by position and instructions by an 8-byte
// discriminator, so both are hand-built here against the program's source and
// both fail in ways that don't say what went wrong: a reordered account is
// rejected by whichever constraint happens to notice, and a wrong
// discriminator is "instruction not found". These tests are the thing that
// says it.

func pk(t *testing.T, seedByte byte) solanago.PublicKey {
	t.Helper()
	var key solanago.PublicKey
	for i := range key {
		key[i] = seedByte + byte(i)
	}
	return key
}

func TestApproveBridgeDelegateInstruction(t *testing.T) {
	programID := pk(t, 1)
	owner := pk(t, 40)
	source := pk(t, 80)
	mintAuthority := pk(t, 120)
	const amount = uint64(1234567890)

	ix := approveBridgeDelegateInstruction(programID, owner, source, mintAuthority, amount)

	if got := ix.ProgramID(); !got.Equals(programID) {
		t.Fatalf("program id = %s, want %s", got, programID)
	}

	data, err := ix.Data()
	if err != nil {
		t.Fatalf("encoding instruction data: %v", err)
	}
	if len(data) != 16 {
		t.Fatalf("data is %d bytes, want 8 (discriminator) + 8 (u64 amount)", len(data))
	}

	// Anchor's global instruction discriminator, computed the way Anchor
	// computes it rather than copied from a run.
	want := sha256.Sum256([]byte("global:approve_bridge_delegate"))
	for i := 0; i < 8; i++ {
		if data[i] != want[i] {
			t.Fatalf("discriminator = %x, want %x", data[:8], want[:8])
		}
	}

	// Borsh encodes u64 little-endian; big-endian here would delegate a
	// wildly different allowance and only show up as a failing burn.
	if got := binary.LittleEndian.Uint64(data[8:]); got != amount {
		t.Fatalf("amount = %d, want %d", got, amount)
	}

	// Order mirrors the ApproveBridgeDelegate struct in
	// instructions/approve_bridge_delegate.rs: owner, source, mint_authority,
	// token_program.
	accounts := ix.Accounts()
	expected := []struct {
		key      solanago.PublicKey
		writable bool
		signer   bool
	}{
		{owner, true, true},
		{source, true, false},
		{mintAuthority, false, false},
		{solanago.TokenProgramID, false, false},
	}
	if len(accounts) != len(expected) {
		t.Fatalf("%d accounts, want %d", len(accounts), len(expected))
	}
	for i, want := range expected {
		got := accounts[i]
		if !got.PublicKey.Equals(want.key) {
			t.Fatalf("account %d = %s, want %s", i, got.PublicKey, want.key)
		}
		if got.IsWritable != want.writable {
			t.Fatalf("account %d writable = %v, want %v", i, got.IsWritable, want.writable)
		}
		if got.IsSigner != want.signer {
			t.Fatalf("account %d signer = %v, want %v", i, got.IsSigner, want.signer)
		}
	}
}

// The delegation has to outlast every burn that will ever run against it: a
// finite allowance would need topping up by a process nobody owns, and would
// fail a redemption halfway through when it ran out.
func TestUnlimitedDelegationIsUnlimited(t *testing.T) {
	if unlimitedDelegation != math.MaxUint64 {
		t.Fatalf("delegation = %d, want u64::MAX", unlimitedDelegation)
	}
}

func TestRequireCustodyAddress(t *testing.T) {
	c := &Client{signer: &localSigner{key: fixedKey(t, 1)}}

	if err := c.requireCustodyAddress("burn source", c.CustodyAddress()); err != nil {
		t.Fatalf("the custody address must be accepted: %v", err)
	}

	// A user's own Solana address is exactly the case this guard exists for:
	// the bridge could never burn from it, because only its owner could grant
	// the delegation SPL requires.
	stranger := fixedKey(t, 99).PublicKey().String()
	if err := c.requireCustodyAddress("burn source", stranger); err == nil {
		t.Fatal("an address the platform does not custody must be rejected")
	}
}
