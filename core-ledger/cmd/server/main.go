package main

import (
	"log"
	"net/http"
	"os"

	"github.com/keshi/usdx-bridge/core-ledger/internal/api"
	"github.com/keshi/usdx-bridge/core-ledger/internal/bridge"
	"github.com/keshi/usdx-bridge/core-ledger/internal/chainclients/ethereum"
	"github.com/keshi/usdx-bridge/core-ledger/internal/chainclients/solana"
	"github.com/keshi/usdx-bridge/core-ledger/internal/ledger"
	"github.com/keshi/usdx-bridge/core-ledger/internal/reconciliation"
)

func main() {
	repo, err := ledger.NewRepository(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("connecting to postgres: %v", err)
	}

	ethClient := ethereum.NewClient(os.Getenv("ETH_RPC_URL"), os.Getenv("USDX_PROXY_ADDRESS"))
	solClient := solana.NewClient(os.Getenv("SOLANA_RPC_URL"), os.Getenv("USDX_PROGRAM_ID"))

	router := bridge.NewRouter(ethClient, solClient)
	saga := bridge.NewSaga(repo, router)

	go reconciliation.NewJob(repo, ethClient, solClient).RunForever()

	handlers := api.NewHandlers(repo, saga)
	mux := http.NewServeMux()
	handlers.Register(mux)

	addr := ":8080"
	log.Printf("core-ledger listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
