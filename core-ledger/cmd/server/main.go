package main

import (
	"log"
	"os"

	"core-ledger/internal/api"
	"core-ledger/internal/bridge"
	"core-ledger/internal/chainclients/ethereum"
	"core-ledger/internal/chainclients/solana"
	"core-ledger/internal/ledger"
	"core-ledger/internal/reconciliation"

	"github.com/gofiber/fiber/v2"
)

func main() {
	repo, err := ledger.NewRepository(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("connecting to postgres: %v", err)
	}

	ethClient, err := ethereum.NewClient(
		os.Getenv("ETH_RPC_URL"),
		os.Getenv("USDX_PROXY_ADDRESS"),
		os.Getenv("ETH_RELAYER_PRIVATE_KEY"),
	)
	if err != nil {
		log.Fatalf("connecting to ethereum: %v", err)
	}

	solClient, err := solana.NewClient(
		os.Getenv("SOLANA_RPC_URL"),
		os.Getenv("USDX_PROGRAM_ID"),
		os.Getenv("USDX_MINT_ADDRESS"),
		os.Getenv("SOLANA_RELAYER_KEYPAIR_PATH"),
	)
	if err != nil {
		log.Fatalf("connecting to solana: %v", err)
	}

	router := bridge.NewRouter(ethClient, solClient)
	saga := bridge.NewSaga(repo, router)

	go reconciliation.NewJob(repo, ethClient, solClient).RunForever()

	app := fiber.New()
	api.NewHandlers(repo, saga).Register(app)

	addr := ":8080"
	log.Printf("core-ledger listening on %s", addr)
	log.Fatal(app.Listen(addr))
}
