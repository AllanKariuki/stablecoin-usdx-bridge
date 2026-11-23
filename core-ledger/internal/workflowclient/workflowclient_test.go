package workflowclient

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The vectors below are pinned on BOTH sides of the maker-checker boundary:
// this package asserts the Go encoding produces them, and
// services/workflow/test/digest.spec.ts asserts the TypeScript encoding
// produces the same digests. They are the guard against the two encodings
// drifting apart — which would fail every approval at verification time, on
// both sides, at once.
var digestVectors = []struct {
	name    string
	payload map[string]any
	canon   string
	digest  string
}{
	{
		name: "a break-glass payload (all strings)",
		payload: map[string]any{
			"transaction_id": "tx-1", "chain_tx_hash": "0xabc", "reason": "why",
			"correlation_id": "c1", "chain": "ETHEREUM", "source_address": "0x111", "amount": "10.000000",
		},
		canon:  `{"amount":"10.000000","chain":"ETHEREUM","chain_tx_hash":"0xabc","correlation_id":"c1","reason":"why","source_address":"0x111","transaction_id":"tx-1"}`,
		digest: "sha256:2c566c6d693d6cfba74497899130c696a4a0afa7da9e80bd05c3232e8e2a51bf",
	},
	{
		name: "the JSON.stringify escape edge cases",
		payload: map[string]any{
			"z": " <&>\"quote", "a": []any{true, nil, 3, "x"}, "b": map[string]any{"nested": "value"},
		},
		// JSON.stringify leaves <, >, & and U+2028 raw; Go's json.Marshal
		// would escape them, which is exactly the drift these vectors exist
		// to catch.
		canon:  "{\"a\":[true,null,3,\"x\"],\"b\":{\"nested\":\"value\"},\"z\":\" <&>\\\"quote\"}",
		digest: "sha256:aad7fe125f916f637c08582575821acee3a57f6cf4076af4b387f17e7eba1418",
	},
	{
		name: "a full-length hash payload",
		payload: map[string]any{
			"amount": "10.000000", "chain_tx_hash": "0x" + strings.Repeat("a", 64),
			"reason": "operator said so", "correlation_id": "corr", "chain": "SOLANA",
			"source_address": "So1", "transaction_id": "tx-2",
		},
		canon:  `{"amount":"10.000000","chain":"SOLANA","chain_tx_hash":"0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","correlation_id":"corr","reason":"operator said so","source_address":"So1","transaction_id":"tx-2"}`,
		digest: "sha256:3563c449155df5be2efa6e071a750a6d9446c7e6735fd171228d257de26468cb",
	},
}

func TestDigestMatchesTheNodeSide(t *testing.T) {
	for _, v := range digestVectors {
		t.Run(v.name, func(t *testing.T) {
			if got := Canonicalize(v.payload); got != v.canon {
				t.Fatalf("Canonicalize = %s\nwant          %s", got, v.canon)
			}
			if got := Digest(v.payload); got != v.digest {
				t.Fatalf("Digest = %s, want %s", got, v.digest)
			}
		})
	}
}

// The callback signature scheme, pinned against the value
// services/workflow/test/... computes for the same message — the HMAC says
// the callback came from workflow, and the signed message binds the request
// id so a genuine callback cannot be replayed against another request.
func TestVerifyCallback(t *testing.T) {
	const secret = "dev-workflow-callback-secret"
	digest := "sha256:2c566c6d693d6cfba74497899130c696a4a0afa7da9e80bd05c3232e8e2a51bf"
	const wantSignature = "1d1aff0803247f233aea59fb4399c9804373699e95773fb7c61948d5b66f4c30"

	if !VerifyCallback(secret, wantSignature, "req_1", "REDEMPTION", "tx-1", digest, "APPROVED") {
		t.Fatal("the pinned signature must verify")
	}

	for name, tc := range map[string]struct {
		secret    string
		presented string
		requestID string
		subjectID string
		status    string
	}{
		"no secret":             {secret: "", presented: wantSignature, requestID: "req_1", subjectID: "tx-1", status: "APPROVED"},
		"no signature":          {secret: secret, presented: "", requestID: "req_1", subjectID: "tx-1", status: "APPROVED"},
		"wrong signature":       {secret: secret, presented: strings.Repeat("0", 64), requestID: "req_1", subjectID: "tx-1", status: "APPROVED"},
		"another request's sig": {secret: secret, presented: wantSignature, requestID: "req_2", subjectID: "tx-1", status: "APPROVED"},
		"another subject":       {secret: secret, presented: wantSignature, requestID: "req_1", subjectID: "tx-9", status: "APPROVED"},
		"another status":        {secret: secret, presented: wantSignature, requestID: "req_1", subjectID: "tx-1", status: "REJECTED"},
	} {
		t.Run(name, func(t *testing.T) {
			if VerifyCallback(tc.secret, tc.presented, tc.requestID, "REDEMPTION", tc.subjectID, digest, tc.status) {
				t.Fatal("must refuse")
			}
		})
	}
}

func TestPropose(t *testing.T) {
	var got struct {
		Path    string
		UserID  string
		Body    map[string]any
		RawBody string
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		got.Path = r.URL.Path
		got.UserID = r.Header.Get("X-User-Id")
		got.RawBody = string(raw)
		_ = json.Unmarshal(raw, &got.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"req_9","status":"PENDING","payloadDigest":"sha256:deadbeef"}`))
	}))
	defer server.Close()

	client := New(server.URL, "http://core-ledger:8081", &http.Client{}, slog.Default())
	proposal, err := client.Propose(context.Background(), ProposeInput{
		Action:      "redemption.break_glass",
		SubjectType: "REDEMPTION",
		SubjectID:   "tx-1",
		Payload: map[string]any{
			"transaction_id": "tx-1", "chain_tx_hash": "0xabc", "reason": "why",
			"correlation_id": "c1", "chain": "ETHEREUM", "source_address": "0x111", "amount": "10.000000",
		},
		Summary:     map[string]any{"transaction_id": "tx-1"},
		RequestedBy: "treasury@damp.local",
		Reason:      "why",
	})
	if err != nil {
		t.Fatalf("Propose: %v", err)
	}
	if proposal.ID != "req_9" || proposal.Status != "PENDING" {
		t.Fatalf("proposal = %+v", proposal)
	}
	if got.Path != "/approval-requests" {
		t.Fatalf("path = %s", got.Path)
	}
	if got.UserID != "treasury@damp.local" {
		t.Fatalf("X-User-Id = %q", got.UserID)
	}
	if got.Body["action"] != "redemption.break_glass" || got.Body["subjectType"] != "REDEMPTION" || got.Body["subjectId"] != "tx-1" {
		t.Fatalf("body = %v", got.Body)
	}
	if got.Body["callbackUrl"] != "http://core-ledger:8081/internal/approvals/callback" {
		t.Fatalf("callbackUrl = %v", got.Body["callbackUrl"])
	}
	if !strings.Contains(got.RawBody, `"requestedBy":"treasury@damp.local"`) {
		t.Fatalf("body should name the requester: %s", got.RawBody)
	}
}

func TestProposeRefusesWhenUnconfigured(t *testing.T) {
	client := New("", "http://core-ledger:8081", &http.Client{}, slog.Default())
	if _, err := client.Propose(context.Background(), ProposeInput{}); err == nil {
		t.Fatal("a client with no WORKFLOW_URL must refuse, not wave through")
	}

	client = New("http://workflow:3006", "", &http.Client{}, slog.Default())
	if _, err := client.Propose(context.Background(), ProposeInput{}); err == nil {
		t.Fatal("a client with no self URL has nowhere to receive the decision and must refuse")
	}
}

func TestProposeSurfacesWorkflowRefusals(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"message":"no approval policy is defined"}`))
	}))
	defer server.Close()

	client := New(server.URL, "http://core-ledger:8081", &http.Client{}, slog.Default())
	_, err := client.Propose(context.Background(), ProposeInput{SubjectID: "tx-1"})
	if err == nil || !strings.Contains(err.Error(), "400") {
		t.Fatalf("err = %v, want the workflow refusal surfaced", err)
	}
}
