package api

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"os"

	"github.com/gofiber/fiber/v2"
)

// callerKey is where the authenticated client identity is stashed on the
// request. A locals key rather than a header, because a header could be set
// by the request itself.
const callerKey = "signer.caller"

// ClientIdentity extracts the CN of the client certificate that completed the
// handshake and puts it on the request.
//
// This is the *only* identity this service trusts. Not a bearer token, not an
// X-User-Id header: those can be replayed by anyone who observes one, and the
// thing being authorised here is mint authority. A client certificate proves
// possession of a private key on every connection.
func ClientIdentity() fiber.Handler {
	return func(c *fiber.Ctx) error {
		if tlsConn := c.Context().TLSConnectionState(); tlsConn != nil {
			if len(tlsConn.PeerCertificates) > 0 {
				c.Locals(callerKey, tlsConn.PeerCertificates[0].Subject.CommonName)
			}
		}
		return c.Next()
	}
}

func CallerFrom(c *fiber.Ctx) string {
	caller, _ := c.Locals(callerKey).(string)
	return caller
}

// ServerTLSConfig builds a config that *requires* a client certificate signed
// by the given CA.
//
// RequireAndVerifyClientCert, not VerifyClientCertIfGiven: the weaker setting
// accepts a connection with no certificate at all and leaves it to the
// application to notice, which is precisely the check somebody forgets. Here
// the handshake fails and no request is ever built.
func ServerTLSConfig(certPath, keyPath, clientCAPath string) (*tls.Config, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return nil, fmt.Errorf("loading the signer's server certificate: %w", err)
	}

	caPEM, err := os.ReadFile(clientCAPath)
	if err != nil {
		return nil, fmt.Errorf("reading the client CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(caPEM) {
		return nil, fmt.Errorf("no certificates found in %s", clientCAPath)
	}

	return &tls.Config{
		Certificates: []tls.Certificate{cert},
		ClientAuth:   tls.RequireAndVerifyClientCert,
		ClientCAs:    pool,
		// 1.3 only. The service has exactly one client, which this repo also
		// owns, so there is no legacy peer to accommodate — and 1.2's cipher
		// negotiation is a surface with no upside here.
		MinVersion: tls.VersionTLS13,
	}, nil
}
