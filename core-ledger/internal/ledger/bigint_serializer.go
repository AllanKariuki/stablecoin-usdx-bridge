package ledger

import (
	"context"
	"fmt"
	"math/big"
	"reflect"

	"gorm.io/gorm/schema"
)

func init() {
	schema.RegisterSerializer("bigint", BigIntSerializer{})
}

// BigIntSerializer round-trips a *big.Int through a NUMERIC(38,0) column as
// its base-10 string form — amounts routinely exceed int64 range at scale,
// and math/big.Int itself doesn't implement sql.Scanner/driver.Valuer.
type BigIntSerializer struct{}

func (BigIntSerializer) Scan(ctx context.Context, field *schema.Field, dst reflect.Value, dbValue interface{}) error {
	if dbValue == nil {
		return nil
	}
	var s string
	switch v := dbValue.(type) {
	case string:
		s = v
	case []byte:
		s = string(v)
	default:
		return fmt.Errorf("bigint serializer: unsupported db value type %T", dbValue)
	}
	n, ok := new(big.Int).SetString(s, 10)
	if !ok {
		return fmt.Errorf("bigint serializer: invalid numeric value %q", s)
	}
	field.ReflectValueOf(ctx, dst).Set(reflect.ValueOf(n))
	return nil
}

func (BigIntSerializer) Value(ctx context.Context, field *schema.Field, dst reflect.Value, fieldValue interface{}) (interface{}, error) {
	n, ok := fieldValue.(*big.Int)
	if !ok || n == nil {
		return nil, nil
	}
	return n.String(), nil
}
