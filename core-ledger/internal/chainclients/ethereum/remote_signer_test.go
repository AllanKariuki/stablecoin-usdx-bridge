package ethereum

import (
	"context"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// The saga recognises a signer refusal with errors.As, which only works if
// nothing between the HTTP response and the saga flattens the error to a
// string. go-ethereum's bind is the layer worth doubting — it is third-party
// and sits in the middle — so the refusal is driven through the real
// TransactOpts.Signer hook rather than assumed to pass through it.
func TestARefusalSurvivesTheBindSigningHook(t *testing.T) {
	relayer := common.HexToAddress("0x00000000000000000000000000000000000000AA")
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/keys" {
			_, _ = w.Write([]byte(`{"keys":[{"id":"eth-relayer","public_key":"` + relayer.Hex() + `"}]}`))
			return
		}
		w.WriteHeader(http.StatusConflict)
		_, _ = w.Write([]byte(`{"error":"re-signed 5 times","code":"RESIGN_LIMIT_REACHED"}`))
	}))
	defer srv.Close()

	client, err := signerclient.New(srv.URL, "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	signer, err := NewRemoteSigner(context.Background(), client, "eth-relayer")
	if err != nil {
		t.Fatalf("NewRemoteSigner: %v", err)
	}

	opts := transactorFor(bindContext(signer, "bridgeMint", "corr-1", big.NewInt(10), relayer.Hex()), big.NewInt(11155111))
	tx := types.NewTx(&types.DynamicFeeTx{ChainID: big.NewInt(11155111), Gas: 21_000, To: &relayer})

	_, err = opts.Signer(relayer, tx)
	var capped *signerclient.ResignLimitError
	if !errors.As(err, &capped) {
		t.Fatalf("err = %T %v; the typed refusal did not survive the signing hook", err, err)
	}
}
