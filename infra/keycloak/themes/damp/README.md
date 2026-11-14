# DAMP Keycloak theme

This is the login theme for realm `damp` (`loginTheme: damp` in the realm template). docker-compose mounts it at
`/opt/keycloak/themes/damp`. `start-dev` turns off theme caching, so an edit shows on the next page reload.

- `login/theme.properties`: the parent is `base` (unstyled), not `keycloak` (PatternFly). It maps every `kc*Class` to a
  `damp-*` class, so the pages this theme doesn't override (OTP, password reset and update, update profile, TOTP setup,
  select authenticator, error and info) still render in the DAMP layout.
- `login/template.ftl`: a split layout with the navy brand panel and the form. It keeps base's `registrationLayout`
  macro and nested sections.
- `login/login.ftl`, `login/register.ftl`: the two pages built specifically for this theme. Register renders its fields
  from the realm's user profile, so new attributes appear without a template change.
- `login/resources/css/damp.css`: the whole look. Its tokens are copied from
  `frontend/shared/src/styles/theme.css`, so change both together.
- `login/messages/messages_en.properties`: copy overrides and the brand panel text.

Self-registration creates retail **customers** only (the realm's default role includes `customer`). Staff and business
accounts are provisioned separately (see the `_comment_registration` note in the realm template).

To preview it locally, run `docker compose up keycloak` and open the portal's sign-in. You can also open
`http://localhost:8080/realms/damp/protocol/openid-connect/auth?client_id=damp-portal&redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback&response_type=code&scope=openid`.
