package platform

import (
	"context"
	"sync/atomic"

	"github.com/gofiber/fiber/v2"
)

// Checker reports whether a dependency (database, chain RPC, cache) is
// currently usable. It should be fast and side-effect-free — /readyz may be
// polled every few seconds by a load balancer.
type Checker func(ctx context.Context) error

// Health owns the liveness/readiness state shared between the HTTP routes
// and the graceful-shutdown sequence: Shutdown flips ready false so the
// *next* readiness poll starts failing before the process stops accepting
// connections, giving the load balancer time to stop routing here.
type Health struct {
	service, version, commit string

	ready  atomic.Bool
	checks map[string]Checker
}

func NewHealth(service, version, commit string) *Health {
	h := &Health{service: service, version: version, commit: commit, checks: map[string]Checker{}}
	h.ready.Store(true)
	return h
}

// AddCheck registers a named dependency check, evaluated on every /readyz
// call. Liveness never runs these — a slow dependency should make this
// instance stop receiving traffic, not make an orchestrator think the
// process itself is dead and restart it.
func (h *Health) AddCheck(name string, fn Checker) {
	h.checks[name] = fn
}

// SetReady flips the flag /readyz reports. Used by the shutdown sequence;
// exported so a service can also flip it false for a self-inflicted
// maintenance-mode drain if it ever needs one.
func (h *Health) SetReady(ready bool) {
	h.ready.Store(ready)
}

// Register mounts /healthz, /readyz, and /version. Not /metrics — that
// belongs to whichever Metrics instance the service's Chain call created,
// registered separately so a service that opts out of the metrics
// middleware doesn't get a dangling endpoint.
func (h *Health) Register(app *fiber.App) {
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	app.Get("/readyz", func(c *fiber.Ctx) error {
		checks := fiber.Map{}
		ready := h.ready.Load()

		for name, fn := range h.checks {
			if err := fn(c.Context()); err != nil {
				ready = false
				checks[name] = fiber.Map{"ok": false, "error": err.Error()}
			} else {
				checks[name] = fiber.Map{"ok": true}
			}
		}

		status := fiber.StatusOK
		state := "ok"
		if !ready {
			status = fiber.StatusServiceUnavailable
			state = "degraded"
		}
		return c.Status(status).JSON(fiber.Map{"status": state, "checks": checks})
	})

	app.Get("/version", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": h.service,
			"version": h.version,
			"commit":  h.commit,
		})
	})
}
