package api

import (
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/keshi/usdx-bridge/core-ledger/internal/bridge"
	"github.com/keshi/usdx-bridge/core-ledger/internal/ledger"
)

type Handlers struct {
	repo *ledger.Repository
	saga *bridge.Saga
}

func NewHandlers(repo *ledger.Repository, saga *bridge.Saga) *Handlers {
	return &Handlers{repo: repo, saga: saga}
}

func (h *Handlers) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /mint", h.handleMintRequest)
	mux.HandleFunc("GET /transfers/{correlationId}", h.handleGetTransfer)
}

// POST /mint — client's entry point. target_chain decides where funds land;
// source_chain is where they're burned from (empty/absent for a fresh mint
// against trust bank collateral rather than a cross-chain move).
func (h *Handlers) handleMintRequest(w http.ResponseWriter, r *http.Request) {
	var req ledger.MintRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.TargetChain != "ETHEREUM" && req.TargetChain != "SOLANA" {
		http.Error(w, `target_chain must be "ETHEREUM" or "SOLANA"`, http.StatusBadRequest)
		return
	}

	t := &ledger.BridgeTransfer{
		CorrelationID: uuid.New().String(),
		UserAddress:   req.UserAddress,
		Amount:        req.Amount,
		SourceChain:   req.SourceChain,
		TargetChain:   req.TargetChain,
		Status:        ledger.StatusPending,
	}
	if err := h.repo.Insert(t); err != nil {
		http.Error(w, "failed to persist transfer", http.StatusInternalServerError)
		return
	}

	go h.saga.Execute(t.CorrelationID) // async; poll GET /transfers/{id} for status

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	json.NewEncoder(w).Encode(t)
}

func (h *Handlers) handleGetTransfer(w http.ResponseWriter, r *http.Request) {
	correlationID := r.PathValue("correlationId")
	t, err := h.repo.FindByCorrelationID(correlationID)
	if err != nil {
		http.Error(w, "transfer not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(t)
}
