package platform

import (
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"
)

// LoadConfig populates target (a pointer to a struct) from environment
// variables named by each field's `env` tag. A field tagged
// `required:"true"` that has no value and no `default` is collected as a
// missing var rather than returned on first failure — a service with five
// bad env vars should see all five in one error, not fail five times in a
// row across five redeploys.
//
// Supported field types: string, bool, int, int32, int64, float64,
// time.Duration, and []string (comma-separated).
func LoadConfig(target any) error {
	v := reflect.ValueOf(target)
	if v.Kind() != reflect.Ptr || v.Elem().Kind() != reflect.Struct {
		return fmt.Errorf("platform: LoadConfig requires a pointer to a struct, got %T", target)
	}
	v = v.Elem()
	t := v.Type()

	var problems []string
	for i := 0; i < t.NumField(); i++ {
		field := t.Field(i)
		if !field.IsExported() {
			continue
		}
		envKey := field.Tag.Get("env")
		if envKey == "" {
			continue
		}

		raw, present := os.LookupEnv(envKey)
		required := field.Tag.Get("required") == "true"
		def, hasDefault := field.Tag.Lookup("default")

		if !present || raw == "" {
			if hasDefault {
				raw = def
			} else if required {
				problems = append(problems, fmt.Sprintf("%s: missing required environment variable", envKey))
				continue
			} else {
				continue
			}
		}

		if err := setField(v.Field(i), raw); err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", envKey, err))
		}
	}

	if len(problems) > 0 {
		return &ConfigError{Problems: problems}
	}
	return nil
}

// ConfigError aggregates every invalid or missing environment variable found
// during a single LoadConfig call, so a fresh clone with a blank .env fails
// once with a complete list rather than a hunt-one-fix-one loop.
type ConfigError struct {
	Problems []string
}

func (e *ConfigError) Error() string {
	return fmt.Sprintf("invalid configuration (%d problem(s)):\n  - %s",
		len(e.Problems), strings.Join(e.Problems, "\n  - "))
}

func setField(field reflect.Value, raw string) error {
	switch field.Interface().(type) {
	case time.Duration:
		d, err := time.ParseDuration(raw)
		if err != nil {
			return fmt.Errorf("must be a duration (e.g. \"5s\"), got %q", raw)
		}
		field.Set(reflect.ValueOf(d))
		return nil
	case []string:
		parts := strings.Split(raw, ",")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		field.Set(reflect.ValueOf(parts))
		return nil
	}

	switch field.Kind() {
	case reflect.String:
		field.SetString(raw)
	case reflect.Bool:
		b, err := strconv.ParseBool(raw)
		if err != nil {
			return fmt.Errorf("must be a boolean, got %q", raw)
		}
		field.SetBool(b)
	case reflect.Int, reflect.Int32, reflect.Int64:
		n, err := strconv.ParseInt(raw, 10, 64)
		if err != nil {
			return fmt.Errorf("must be an integer, got %q", raw)
		}
		field.SetInt(n)
	case reflect.Float64, reflect.Float32:
		f, err := strconv.ParseFloat(raw, 64)
		if err != nil {
			return fmt.Errorf("must be a number, got %q", raw)
		}
		field.SetFloat(f)
	default:
		return fmt.Errorf("unsupported config field type %s", field.Kind())
	}
	return nil
}
