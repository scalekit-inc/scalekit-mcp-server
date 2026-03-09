---
name: implementing-fsa-logout
description: Implements a complete logout flow for Scalekit FSA integrations by clearing application session cookies and redirecting the browser to Scalekit’s /oidc/logout endpoint to invalidate the Scalekit session. Use when adding or fixing logout in Node.js, Python, Go, or Java web apps that use Scalekit OIDC.
---

# Implementing logout (Scalekit FSA)

## Goal
Implement a single `/logout` endpoint that:
- Clears the application session layer (your cookies/tokens).
- Invalidates the Scalekit session layer by redirecting the browser to Scalekit’s OIDC logout endpoint.
- Returns the user to a safe, allowlisted post-logout redirect URL.

## Key constraints (must follow)
- The Scalekit logout call MUST be a browser redirect (top-level navigation), not a `fetch`/XHR from frontend and not a server-to-server API call.
- The ID token (often `idToken`) MUST be read BEFORE clearing cookies, because it is used as `id_token_hint`.
- The `post_logout_redirect_uri` MUST be allowlisted in Scalekit Dashboard (Post Logout URLs).

## Inputs to collect from the user/project
Ask for (or infer from the codebase):
- Tech stack: Express/Fastify/Next.js (Node), Flask/Django (Python), Gin/Fiber (Go), Spring Boot (Java), etc.
- Where tokens are stored: cookie names (default examples: `accessToken`, `refreshToken`, `idToken`) and cookie attributes (Path, Domain, SameSite).
- The post-logout landing URL (example: `http://localhost:3000/login` or your production login page).
- Scalekit configuration: base URL / environment, and whether the project uses a Scalekit SDK helper like `getLogoutUrl(...)`.

## Recommended implementation (workflow)
1. Locate the current auth/session code:
- Find where access/refresh/ID tokens are set.
- Note cookie names, paths, domains, and SameSite settings (you must match these when clearing).

2. Add a GET `/logout` route:
- Extract `idToken` (or equivalent) from cookies/session storage.
- Compute `postLogoutRedirectUri`.
- Build the Scalekit logout URL pointing at `/oidc/logout`, preferably using the Scalekit SDK helper if present.
- Clear session cookies (access/refresh/id), preserving the correct Path/Domain so deletion actually works.
- Redirect (302) the browser to the Scalekit logout URL.

3. Configure Scalekit Dashboard allowlist:
- Register `postLogoutRedirectUri` under: Redirects → Post Logout URL.

4. Verify and iterate:
- In DevTools → Network, clicking logout should show a **document** navigation to Scalekit (not XHR/fetch).
- Confirm the request includes the Scalekit session cookie automatically.
- After redirecting back, logging in should not silently reuse the application cookies you intended to clear.

## Reference behavior (pseudocode)
- Read `id_token_hint` from cookie/session.
- `logoutUrl = scalekit.getLogoutUrl(id_token_hint, post_logout_redirect_uri)`
- Clear cookies (access/refresh/id).
- `302 -> logoutUrl`

## Implementation templates

### Node.js (Express)
```js
app.get('/logout', (req, res) => {
  const idTokenHint = req.cookies?.idToken; // read BEFORE clearing
  const postLogoutRedirectUri = process.env.POST_LOGOUT_REDIRECT_URI ?? 'http://localhost:3000/login';

  // Prefer SDK helper if available in your project
  const logoutUrl = scalekit.getLogoutUrl(idTokenHint, postLogoutRedirectUri);

  // Clear cookies (match Path/Domain/SameSite used when setting them)
  res.clearCookie('accessToken', { path: '/' });
  res.clearCookie('refreshToken', { path: '/' });
  res.clearCookie('idToken', { path: '/' });

  return res.redirect(logoutUrl);
});
```

### Python (Flask)
```py
from flask import request, redirect, make_response

@app.get("/logout")
def logout():
    id_token = request.cookies.get("idToken")  # read BEFORE clearing
    post_logout_redirect_uri = os.getenv("POST_LOGOUT_REDIRECT_URI", "http://localhost:3000/login")

    logout_url = scalekit_client.get_logout_url(
        id_token_hint=id_token,
        post_logout_redirect_uri=post_logout_redirect_uri
    )

    resp = make_response(redirect(logout_url))
    resp.set_cookie("accessToken", "", max_age=0, path="/")
    resp.set_cookie("refreshToken", "", max_age=0, path="/")
    resp.set_cookie("idToken", "", max_age=0, path="/")
    return resp
```

### Go (Gin)
```go
func LogoutHandler(c *gin.Context) {
  idToken, _ := c.Cookie("idToken") // read BEFORE clearing
  postLogoutRedirectURI := os.Getenv("POST_LOGOUT_REDIRECT_URI")
  if postLogoutRedirectURI == "" {
    postLogoutRedirectURI = "http://localhost:3000/login"
  }

  logoutURL, err := scalekit.GetLogoutUrl(scalekit.LogoutUrlOptions{
    IdTokenHint: idToken,
    PostLogoutRedirectUri: postLogoutRedirectURI,
  })
  if err != nil {
    c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
    return
  }

  // Clear cookies (match original attributes)
  c.SetCookie("accessToken", "", -1, "/", "", true, true)
  c.SetCookie("refreshToken", "", -1, "/", "", true, true)
  c.SetCookie("idToken", "", -1, "/", "", true, true)

  c.Redirect(http.StatusFound, logoutURL.String())
}
```

### Java (Spring Boot)
```java
@GetMapping("/logout")
public void logout(HttpServletRequest request, HttpServletResponse response) throws IOException {
  String idToken = null;
  if (request.getCookies() != null) {
    for (Cookie c : request.getCookies()) {
      if ("idToken".equals(c.getName())) {
        idToken = c.getValue();
        break;
      }
    }
  }

  String postLogoutRedirectUri = System.getenv().getOrDefault(
    "POST_LOGOUT_REDIRECT_URI",
    "http://localhost:3000/login"
  );

  URL logoutUrl = scalekitClient.authentication().getLogoutUrl(
    idToken,
    postLogoutRedirectUri
  );

  // Clear cookies (ensure Path/Domain match your app cookies)
  Cookie access = new Cookie("accessToken", "");
  access.setMaxAge(0);
  access.setPath("/");
  access.setHttpOnly(true);
  access.setSecure(true);
  response.addCookie(access);

  Cookie refresh = new Cookie("refreshToken", "");
  refresh.setMaxAge(0);
  refresh.setPath("/");
  refresh.setHttpOnly(true);
  refresh.setSecure(true);
  response.addCookie(refresh);

  Cookie id = new Cookie("idToken", "");
  id.setMaxAge(0);
  id.setPath("/");
  id.setHttpOnly(true);
  id.setSecure(true);
  response.addCookie(id);

  response.sendRedirect(logoutUrl.toString());
}
```

## Logout security checklist (copy/paste)
- Extract ID token BEFORE clearing cookies.
- Clear all application session cookies (access/refresh/id).
- Redirect browser (302) to Scalekit `/oidc/logout` via the generated logout URL.
- Ensure `post_logout_redirect_uri` is allowlisted in Scalekit dashboard.
- Validate logout is a document navigation (not XHR/fetch) and cookies are actually removed.

## Common failure modes (what to check)
- “Logout doesn’t really log out”: cookie deletion mismatches Path/Domain/SameSite; clear cookies with the same attributes used when setting them.
- “Login immediately succeeds after logout”: identity provider session may still be active; this is expected for SSO providers, but your app cookies should still be cleared.
- “Scalekit logout doesn’t take effect”: logout was done via API call rather than browser redirect; use a redirect so the Scalekit session cookie is included automatically.
- “Redirect rejected”: `post_logout_redirect_uri` is not allowlisted in Scalekit dashboard.

## Output expectations when using this skill
When asked to implement logout in a real repo, the assistant should:
- Identify the correct cookie names and where they are set.
- Implement `/logout` with the correct sequence (read id token → build logout URL → clear cookies → redirect).
- Provide a brief test plan and the exact dashboard value to allowlist for post-logout redirect.
