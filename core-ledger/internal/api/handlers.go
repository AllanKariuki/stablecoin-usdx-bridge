package api

import (
	"core-ledger/internal/bridge"
	"core-ledger/internal/ledger"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
)

type Handlers struct {
	repo *ledger.Repository
	saga *bridge.Saga
}

func NewHandlers(repo *ledger.Repository, saga *bridge.Saga) *Handlers {
	return &Handlers{repo: repo, saga: saga}
}

func (h *Handlers) Register(app *fiber.App) {
	app.Post("/mint", h.handleMintRequest)
	app.Get("/transfers/:correlationId", h.handleGetTransfer)
}

// POST /mint — client's entry point. target_chain decides where funds land;
// source_chain is where they're burned from (empty/absent for a fresh mint
// against trust bank collateral rather than a cross-chain move).
func (h *Handlers) handleMintRequest(c *fiber.Ctx) error {
	var req ledger.MintRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "invalid request body"})
	}
	if req.TargetChain != "ETHEREUM" && req.TargetChain != "SOLANA" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": `target_chain must be "ETHEREUM" or "SOLANA"`})
	}
	if req.SourceChain != "" && req.SourceChain != "ETHEREUM" && req.SourceChain != "SOLANA" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": `source_chain must be "ETHEREUM", "SOLANA", or omitted`})
	}
	if req.SourceChain == req.TargetChain && req.SourceChain != "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{"error": "source_chain and target_chain must differ"})
	}

	t := &ledger.BridgeTransfer{
		CorrelationID: uuid.New().String(),
		UserAddress:   req.UserAddress,
		Amount:        req.Amount.SmallestUnit,
		SourceChain:   req.SourceChain,
		TargetChain:   req.TargetChain,
		Status:        ledger.StatusPending,
	}
	if err := h.repo.Insert(t); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"error": "failed to persist transfer"})
	}

	go h.saga.Execute(t.CorrelationID) // async; poll GET /transfers/{id} for status

	return c.Status(fiber.StatusAccepted).JSON(t)
}

func (h *Handlers) handleGetTransfer(c *fiber.Ctx) error {
	correlationID := c.Params("correlationId")
	t, err := h.repo.FindByCorrelationID(correlationID)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"error": "transfer not found"})
	}
	return c.JSON(t)
}
