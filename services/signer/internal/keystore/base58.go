package keystore

import "github.com/mr-tron/base58"

// base58Decode is a thin alias so the test file does not import the library
// under a second name, and so a future swap of base58 implementation happens
// in one place.
func base58Decode(encoded string) ([]byte, error) { return base58.Decode(encoded) }
