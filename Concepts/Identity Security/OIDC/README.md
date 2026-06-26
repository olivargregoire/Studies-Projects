# OpenID Connect (OIDC) Authorization Code Flow with PKCE



![OIDC Flow](./auth-flow.svg)


## 1. User Initiates Login

The user clicks the `/login` button on the client application's web page and it's going to trigger the OIDC flow.

---

## 2. The client generates and stores some security parameters

Before redirecting the user, the client app generates three strings and temporarily saves them (usually in a session cookie or local cache, so the user has it in its browser):

- **state**: An string to avoid CSRF attacks. Basically it allows to correlate who originally started this login flow, and who send their authorization code. Otherwise, without that, an attacker could use social engineering and make someone log in on the attacker account by sending their auth code url - And the client app will have no way to check that this auth code request is not from the same person that initiated it.

- **nonce**: A random string used to prevent Replay Attacks. It will later be embedded in the ID Token by the IdP, allowing the client to verify that the token was minted specifically for this session and hasn't been intercepted and reused. It makes each session unique and an attacker won't be able to replay an old ID Token.

- **PKCE code**: It is also generating PKCE code that will be here to assure that the one that requests the token at the end is the same that the one that requested the auth code previously.

---

## 3. Redirect to authorization endpoint

The client application redirects the user's browser to the IdP `/authorize` endpoint. This redirect URL contains a payload of query parameters, typically including: `client_id`, `response_type=code`, `scope=openid`, `redirect_uri`, `state`, and `nonce`. It also contains the PKCE code, a `code_challenge` (hash of `code_verifier`) and the hashing method that has been used. 

### URL parameters

```text
response_type=code

client_id=6779ef20e75817b79602

redirect_uri=callback_url_client

scope=openid, email

state= xyzHTD183

code_challenge=kandcfkaezf

code_challenge_method = SHA256 

nonce=kj6923Kn9
```

The `client_id` is sent here (it's public, not a secret) so the IdP knows *which* app is asking and can validate the `redirect_uri` against the ones pre-registered for that app — this is what stops an attacker from redirecting the code elsewhere.

---

## 4. User creds prompt

The browser arrives at the Idp and this guy checks if the user already has an IdP active session. If not, it presents a login interface prompting the user for their credentials (username, password, MFA, etc. depending on the Idp policy).

---

## 5. Credential verification

The user submits their credentials. The IdP verifies them and evaluate any conditional access policies. It also checks here that the user is **assigned to the app** (the `client_id` from Step 3): valid credentials are not enough, an unassigned user is rejected before any code is issued.

---

## 6. Redirect to callback URL

After successful user auth, the IdP generates an authorization code. It then issues an HTTP 302 redirect, sending the user browser back to the client application's pre-registered `redirect_uri` (the callback URL). It appends two URL params to the request : the new code and the exact state value it received in 3.

---

## 7. Browser to the client app

The user browser follows the redirect, making an HTTP GET request to the client application's callback endpoint, delivering the `code` and `state` parameters in the URL.

---

## 8. Client verifies state

The client application extracts the `state` parameter from the incoming request and compares it to the value it saved in 2.

If they do not match (or the state is missing), it would mean that it comes from a decorrelated flow and the app will cancel the flow to protect from CSRF.

---

## 9. Token exchange request

The client application then contacts the IdP directly with a HTTP POST request to the `/token` endpoint. It sends the `code`, its `client_id`, its `client_secret` (or other client authentication method), and the `redirect_uri`. The IdP will use this to verify the client and exchange the code for the actual ID Token and Access Token.

The `client_secret` is the backend proving *"I really am this `client_id`"* — that's what makes a stolen code useless without it. Public clients (SPA/mobile) that can't store a secret rely on PKCE instead.

---

## 10. IdP verifies request and validates PKCE

It receives the token request and check :

- The client credentials : verifies that id and secret are correct for the specific app

- The auth code : valid, not expired and belongs to the right app --> then its fine

- The PKCE code in clear : it hashes it to see if it correspond to the one sent in 3.

---

## 11. Token generation and delivery

Once all checks pass, the IdP built the token. It takes the nonce string from 3. and embeds it directly into the payload of the ID Token. The IdP then sends an HTTP 200 OK response back to the client application containing:

- **ID Token**: JWT token containing the user's identity details and the nonce.

- **Access Token**: JWT token used by the client to make calls on behalf of the user.

---

## 12. Client Validates ID Token Payload

The client application receives the tokens and must validate the ID Token before trusting it. It decodes the JWT and verifies:

- **Signature**: That it was signed by the legitimate IdP.

- **Issuer (`iss`) & Audience (`aud`)**: That it came from the correct IdP and was intended specifically for this application's `client_id`.

- **Timestamps (`exp`, `iat`)**: That the token is currently valid and has not expired.

- **Nonce (`nonce`)**: That the nonce inside the token matches the nonce saved in Step 2, ensuring it is not a replayed token.

After beeing validated, the client extracts the user identifiers like the `sub` (Subject) and requested scopes (e.g., `email`). from the ID token. Based on the `sub`, the application will either identify and log in an existing user account in its own database or either create a new user account (JIT provisioning). It can also extracts custom attribute, such as the role or some groups the user belongs to.

---
![OIDC Flow](./auth-flow.svg)
# Establish Application Session

Now that the user is fully authenticated, the client application issues its own local application session (for example secured and encrypted cookie)