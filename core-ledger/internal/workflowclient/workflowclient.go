// Package workflowclient is core-ledger's maker-checker client for H4.
//
// It proposes break-glass redemption confirmations to services/workflow and
// verifies the signed decisions workflow posts back. Both halves are
// deliberate reimplementations of what services/kyc and services/compliance
// do in TypeScript, not shared code: the whole value of the scheme is that
// this service verifies an approval *independently*. If it asked workflow to
// compute the digest (or the signature) it was checking against, a
// compromised workflow service could answer with whatever made its forged
// approval verify — see services/kyc/src/workflow/workflow.client.ts for the
// same reasoning on their side.
//
// The cost is that the two encodings must agree, and a drift between them
// would make every approval fail verification at once. Both sides carry
// tests asserting the encoding against recorded vectors.
package workflowclient

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"
)

// ProposedRequest is the part of workflow's POST /approval-requests response
// the caller keeps.
type ProposedRequest struct {
	ID            string `json:"id"`
	Status        string `json:"status"`
	PayloadDigest string `json:"payloadDigest"`
}

// ProposeInput is everything workflow needs to open an approval request.
type ProposeInput struct {
	Action      string
	SubjectType string
	SubjectID   string
	Payload     map[string]any
	Summary     map[string]any
	RequestedBy string
	Reason      string
}

// Client proposes approvals to services/workflow. http must carry the
// platform's service-account token (internal/serviceauth, svc-core-ledger
// with workflow.propose) — the client never attaches a bearer of its own.
type Client struct {
	baseURL string
	selfURL string
	http    *http.Client
	logger  *slog.Logger
}

func New(baseURL, selfURL string, http *http.Client, logger *slog.Logger) *Client {
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		selfURL: strings.TrimRight(selfURL, "/"),
		http:    http,
		logger:  logger,
	}
}

// Propose opens an approval request. A non-2xx answer — including workflow
// refusing an action with no policy — is an error, never a wave-through.
func (c *Client) Propose(ctx context.Context, in ProposeInput) (*ProposedRequest, error) {
	if c.baseURL == "" {
		return nil, fmt.Errorf("WORKFLOW_URL is unset: nothing can be approved in this environment")
	}
	if c.selfURL == "" {
		return nil, fmt.Errorf("CORE_LEDGER_SELF_URL is unset: workflow would have nowhere to deliver its decision")
	}

	body, err := json.Marshal(map[string]any{
		"action":      in.Action,
		"subjectType": in.SubjectType,
		"subjectId":   in.SubjectID,
		"payload":     in.Payload,
		"summary":     in.Summary,
		"requestedBy": in.RequestedBy,
		"reason":      in.Reason,
		// Where the decision comes back. workflow retries until it lands.
		"callbackUrl": c.selfURL + "/internal/approvals/callback",
	})
	if err != nil {
		return nil, fmt.Errorf("encoding approval request: %w", err)
	}

	// A hung workflow must not park a request handler: the decision, if one
	// is ever needed, comes back on the callback regardless.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/approval-requests", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	// The operator's gateway identity, forwarded for the audit trail and for
	// workflow's excludeInitiator check. It authorizes nothing on workflow's
	// side — the bearer token authenticates the call.
	req.Header.Set("X-User-Id", in.RequestedBy)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("workflow unreachable: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("workflow returned %s opening an approval for %s: %s",
			resp.Status, in.SubjectID, strings.TrimSpace(string(respBody)))
	}

	var out ProposedRequest
	if err := json.Unmarshal(respBody, &out); err != nil {
		return nil, fmt.Errorf("decoding workflow's answer: %w", err)
	}
	return &out, nil
}

// Digest mirrors services/workflow/src/requests/digest.ts exactly: sha256
// over the canonical JSON encoding, prefixed "sha256:". It is what this
// service stores at propose time and re-computes when the decision comes
// back — an approval whose digest does not match the proposal as it stands
// is not an approval.
func Digest(payload map[string]any) string {
	sum := sha256.Sum256([]byte(Canonicalize(payload)))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Canonicalize is the canonical JSON encoding digest.ts defines: object keys
// sorted by Unicode code point recursively, no whitespace, strings encoded
// the way JavaScript's JSON.stringify encodes them.
func Canonicalize(v any) string {
	return canonicalize(v)
}

func canonicalize(v any) string {
	switch x := v.(type) {
	case nil:
		return "null"
	case string:
		return jsQuote(x)
	case bool:
		if x {
			return "true"
		}
		return "false"
	case int:
		return fmt.Sprintf("%d", x)
	case int64:
		return fmt.Sprintf("%d", x)
	case float64:
		// No amount crosses a service boundary as a number — every payload
		// value here is a decimal string — so a float reaching a digest means
		// the payload author already has a bigger problem (digest.ts says the
		// same).
		return fmt.Sprintf("%v", x)
	case []any:
		parts := make([]string, len(x))
		for i, item := range x {
			parts[i] = canonicalize(item)
		}
		return "[" + strings.Join(parts, ",") + "]"
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys))
		for _, k := range keys {
			parts = append(parts, jsQuote(k)+":"+canonicalize(x[k]))
		}
		return "{" + strings.Join(parts, ",") + "}"
	default:
		return jsQuote(fmt.Sprint(v))
	}
}

// jsQuote encodes a string the way JSON.stringify does: only ", \ and
// control characters are escaped (with the \b \t \n \f \r shortcuts), and
// everything else — including <, >, & and U+2028 — stays raw. Go's
// json.Marshal is stricter (it escapes <, >, & as <-style sequences),
// and the two encodings must agree byte for byte with the Node side.
func jsQuote(s string) string {
	var b strings.Builder
	b.WriteByte('"')
	for _, r := range s {
		switch r {
		case '"':
			b.WriteString(`\"`)
		case '\\':
			b.WriteString(`\\`)
		case '\b':
			b.WriteString(`\b`)
		case '\t':
			b.WriteString(`\t`)
		case '\n':
			b.WriteString(`\n`)
		case '\f':
			b.WriteString(`\f`)
		case '\r':
			b.WriteString(`\r`)
		default:
			if r < 0x20 {
				b.WriteString(fmt.Sprintf(`\u%04x`, r))
			} else {
				b.WriteRune(r)
			}
		}
	}
	b.WriteByte('"')
	return b.String()
}

// SignatureHeader is the header workflow signs its callbacks with — the same
// constant duplicated in workflow, kyc and compliance on purpose.
const SignatureHeader = "x-workflow-signature"

// VerifyCallback checks workflow's HMAC over a decision callback. The signed
// message binds the request id, subject and payload digest, so a genuine
// callback cannot be replayed against another request — and the HMAC is what
// says the callback came from workflow at all, because the digest alone
// cannot (anyone who can read the subject can recompute it).
func VerifyCallback(secret, presented, requestID, subjectType, subjectID, payloadDigest, status string) bool {
	if secret == "" || presented == "" {
		return false
	}
	msg := strings.Join([]string{requestID, subjectType, subjectID, payloadDigest, status}, "\n")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(msg))
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(presented))
}

// CallbackPath is where workflow delivers decisions; it is also where the
// callbackUrl points, so both sides agree without sharing more config.
func CallbackPath() string { return "/internal/approvals/callback" }
