package main

import (
	"context"
	"log"
	"os"
	"strconv"

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

	log.Println("connected to postgres database")

	// Seeding the currencies and the chart of accounts is idempotent, so it
	// runs on every boot rather than in a one-off script that a new
	// environment can forget.
	if err := repo.Bootstrap(context.Background(), ledger.DefaultCurrencies()); err != nil {
		log.Fatalf("seeding the chart of accounts: %v", err)
	}

	log.Println("chart of accounts ready")

	ledgerSvc := ledger.NewService(repo, ledger.FeeSchedule{
		IssuanceBps:   bpsFromEnv("FEE_ISSUANCE_BPS", 0),
		RedemptionBps: bpsFromEnv("FEE_REDEMPTION_BPS", 0),
		TransferBps:   bpsFromEnv("FEE_TRANSFER_BPS", 0),
		WithdrawalBps: bpsFromEnv("FEE_WITHDRAWAL_BPS", 0),
	})

	ethClient, err := ethereum.NewClient(
		os.Getenv("ETH_RPC_URL"),
		os.Getenv("USDX_PROXY_ADDRESS"),
		os.Getenv("ETH_RELAYER_PRIVATE_KEY"),
	)
	if err != nil {
		log.Fatalf("connecting to ethereum: %v", err)
	}

	log.Println("connected to ethereum network")

	solClient, err := solana.NewClient(
		os.Getenv("SOLANA_RPC_URL"),
		os.Getenv("USDX_PROGRAM_ID"),
		os.Getenv("USDX_MINT_ADDRESS"),
		os.Getenv("SOLANA_RELAYER_KEYPAIR_PATH"),
	)
	if err != nil {
		log.Fatalf("connecting to solana: %v", err)
	}

	log.Println("connected to solana network")

	router := bridge.NewRouter(ethClient, solClient)
	saga := bridge.NewSaga(repo, ledgerSvc, router)

	go reconciliation.NewJob(repo, ethClient, solClient).RunForever()

	app := fiber.New()
	api.NewHandlers(repo, ledgerSvc, saga).Register(app)

	addr := ":8080"
	log.Printf("core-ledger listening on %s", addr)
	log.Fatal(app.Listen(addr))
}

// bpsFromEnv reads a fee in basis points, defaulting to zero so a missing
// config variable can never invent a charge the customer didn't agree to.
func bpsFromEnv(key string, fallback int32) int32 {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || v < 0 || v > 10000 {
		log.Fatalf("%s must be a whole number of basis points between 0 and 10000, got %q", key, raw)
	}
	return int32(v)
}
