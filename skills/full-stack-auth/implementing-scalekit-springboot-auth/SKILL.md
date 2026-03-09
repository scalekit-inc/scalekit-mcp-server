---
name: implementing-scalekit-springboot-auth
description: Guides Java developers integrating Scalekit OIDC authentication into Spring Boot 3.x apps. Use when the developer mentions Scalekit, enterprise SSO, OIDC login, OAuth2 client setup, protected routes, ID token claims, or logout in a Spring Boot project.
---

# Scalekit Auth in Spring Boot

Scalekit acts as an OIDC provider. Spring Security's `oauth2-client` starter handles the full
authorization code flow — no custom filters needed.

## Required dependencies

Add to `pom.xml` (Spring Boot 3.2+, Java 17+):

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-client</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<!-- Scalekit JSDK -->
<dependency>
    <groupId>com.scalekit</groupId>
    <artifactId>scalekit-sdk-java</artifactId>
    <version>2.0.4</version>
</dependency>
```

## Configuration

`src/main/resources/application.yml`:

```yaml
scalekit:
  env-url: ${SCALEKIT_ENV_URL}
  client-id: ${SCALEKIT_CLIENT_ID}
  client-secret: ${SCALEKIT_CLIENT_SECRET}
  redirect-uri: ${SCALEKIT_REDIRECT_URI:http://localhost:8080/login/oauth2/code/scalekit}

spring:
  security:
    oauth2:
      client:
        registration:
          scalekit:
            client-id: ${scalekit.client-id}
            client-secret: ${scalekit.client-secret}
            authorization-grant-type: authorization_code
            redirect-uri: ${scalekit.redirect-uri}
            scope: openid,profile,email,offline_access
            client-name: Scalekit
        provider:
          scalekit:
            issuer-uri: ${scalekit.env-url}
            authorization-uri: ${scalekit.env-url}/oauth/authorize
            token-uri: ${scalekit.env-url}/oauth/token
            user-info-uri: ${scalekit.env-url}/userinfo
            jwk-set-uri: ${scalekit.env-url}/keys
            user-name-attribute: sub
```

For local dev, use `application-local.properties` — never commit secrets.

## Scalekit SDK bean

```java
@Configuration
public class ScalekitConfig {

    @Value("${scalekit.env-url}")
    private String envUrl;

    @Value("${scalekit.client-id}")
    private String clientId;

    @Value("${scalekit.client-secret}")
    private String clientSecret;

    @Bean
    public ScalekitClient scalekitClient() {
        return new ScalekitClient(envUrl, clientId, clientSecret);
    }
}
```

## Security filter chain

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http,
            ClientRegistrationRepository clientRegistrationRepository) throws Exception {
        http
            .authorizeHttpRequests(authz -> authz
                .requestMatchers("/", "/login", "/error", "/css/**", "/js/**").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2Login(oauth2 -> oauth2
                .loginPage("/login")
                .defaultSuccessUrl("/dashboard", true)
            )
            .logout(logout -> logout
                .logoutSuccessHandler(oidcLogoutSuccessHandler(clientRegistrationRepository))
                .invalidateHttpSession(true)
                .clearAuthentication(true)
            );
        return http.build();
    }

    private LogoutSuccessHandler oidcLogoutSuccessHandler(
            ClientRegistrationRepository clientRegistrationRepository) {
        OidcClientInitiatedLogoutSuccessHandler handler =
                new OidcClientInitiatedLogoutSuccessHandler(clientRegistrationRepository);
        handler.setPostLogoutRedirectUri("{baseUrl}");
        return handler;
    }
}
```

## Accessing user identity in controllers

```java
@GetMapping("/dashboard")
public String dashboard(@AuthenticationPrincipal OidcUser oidcUser, Model model) {
    model.addAttribute("name",    oidcUser.getFullName());
    model.addAttribute("email",   oidcUser.getEmail());
    model.addAttribute("subject", oidcUser.getSubject());
    model.addAttribute("claims",  oidcUser.getClaims());
    return "dashboard";
}
```

Key `OidcUser` accessors: `getFullName()`, `getEmail()`, `getSubject()`, `getClaims()`,
`getAuthorities()`.

## Application routes

| Route | Auth? | Notes |
|---|---|---|
| `/` | No | Home page |
| `/login` | No | Custom login page |
| `/dashboard` | Yes | Protected; redirects to login |
| `/oauth2/authorization/scalekit` | No | Starts OIDC flow |
| `/auth/callback` | No | Handled by Spring Security automatically |
| `/logout` | Yes | Triggers OIDC end-session |

## Scalekit Dashboard setup checklist

```
- [ ] Get Environment URL (e.g., https://your-env.scalekit.dev)
- [ ] Get Client ID and Client Secret from Settings > API Credentials
- [ ] Add allowed redirect URI: http://localhost:8080/login/oauth2/code/scalekit
- [ ] Optionally add post-logout redirect: http://localhost:8080
```

## Workflows

### Add Scalekit auth to an existing Spring Boot app

```
Progress:
- [ ] Step 1: Add Maven dependencies
- [ ] Step 2: Add application.yml OAuth2 provider/registration config
- [ ] Step 3: Create ScalekitConfig bean
- [ ] Step 4: Create SecurityConfig filter chain
- [ ] Step 5: Inject @AuthenticationPrincipal OidcUser in protected controllers
- [ ] Step 6: Configure redirect URIs in Scalekit dashboard
- [ ] Step 7: Run app and verify login → dashboard → logout flow
```

## Troubleshooting

**JWKS timeout / JWT verification errors**: Spring Security fetches JWKS on every token
validation. Increase the decoder timeout — see [Spring docs on JWT decoder timeouts](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html#oauth2resourceserver-jwt-timeouts).

**Redirect URI mismatch**: The `redirect-uri` in `application.yml` must exactly match what is
registered in the Scalekit dashboard.

**Enable debug logging** in `application.yml`:

```yaml
logging:
  level:
    org.springframework.security.oauth2: TRACE
    com.example.scalekit: DEBUG
```

## Reference

- Full working example: [scalekit-inc/scalekit-springboot-auth-example](https://github.com/scalekit-inc/scalekit-springboot-auth-example)
- Scalekit docs: https://docs.scalekit.com
- Spring Security OAuth2 docs: https://docs.spring.io/spring-security/reference/servlet/oauth2

## Tactics

### SameSite=Lax on the session cookie
Spring Boot does not set `SameSite` by default. Add to `application.yml`:

```yaml
server:
  servlet:
    session:
      cookie:
        same-site: lax      # Required — 'strict' breaks OAuth callbacks
        http-only: true
        secure: true        # Set to true in production (HTTPS)
```

Without `SameSite: Lax`, some browsers drop the session cookie on the cross-origin redirect from Scalekit back to your app, causing the OAuth state to be lost.

### Deep link preservation — use SavedRequestAwareAuthenticationSuccessHandler
The default `defaultSuccessUrl("/dashboard", true)` ignores the originally requested URL. Remove `true` to restore the saved-request redirect:

```java
.oauth2Login(oauth2 -> oauth2
    .loginPage("/login")
    .defaultSuccessUrl("/dashboard")   // without `true` — respects saved request
)
```

Spring Security stores the pre-login URL in the session automatically via `RequestCache`. The user lands on `/dashboard` only if no prior request was saved.

### CORS for browser clients
Add CORS support in `SecurityFilterChain`:

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http,
        ClientRegistrationRepository clientRegistrationRepository) throws Exception {
    http
        .cors(cors -> cors.configurationSource(corsConfigurationSource()))
        ...
    return http.build();
}

@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("http://localhost:3000"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
    config.setAllowedHeaders(List.of("*"));
    config.setAllowCredentials(true);   // required for session cookies
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
}
```

### AJAX: 401 instead of redirect
Spring Security redirects unauthenticated requests to the login page by default. Browser AJAX clients expect `401`, not `302`. Override the entry point in `SecurityFilterChain`:

```java
.exceptionHandling(ex -> ex
    .authenticationEntryPoint((request, response, authException) -> {
        String accept = request.getHeader("Accept");
        if (accept != null && accept.contains("application/json")) {
            response.sendError(HttpServletResponse.SC_UNAUTHORIZED, "Authentication required");
        } else {
            response.sendRedirect("/login");
        }
    }))
```

### Cache-Control: no-store on protected responses

```java
@GetMapping("/dashboard")
public String dashboard(@AuthenticationPrincipal OidcUser oidcUser,
                        Model model, HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
    model.addAttribute("name",  oidcUser.getFullName());
    model.addAttribute("email", oidcUser.getEmail());
    return "dashboard";
}
```

### CSRF and OAuth2 — what Spring Security does automatically
Spring Security disables CSRF protection for OAuth2 login endpoints (`/oauth2/authorization/**` and `/login/oauth2/code/**`) by default. The `state` parameter in the authorization URL serves as the CSRF token for the OAuth flow. You do not need to add any CSRF configuration for basic Scalekit auth.

### OIDC logout vs local logout
`OidcClientInitiatedLogoutSuccessHandler` calls the Scalekit end-session endpoint and revokes the IdP session. If you use a plain `logoutSuccessUrl()` instead, only the local Spring session is cleared — the user will be silently re-authenticated on the next login attempt. Always use the OIDC handler.
