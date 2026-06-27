# SAML 2.0 Web Browser SSO (SP-Initiated)

![SAML Flow](./saml-flow.svg)


## 1. User tries to access a protected resource


GET sp/protected/myresource
The user hits a protected URL on the Service Provider (SP) (could be when he tries to login, but i chose that as an example for my scheme). The SP sees there is no valid local session (no cookie, or it's expired) and has been configured to delegate authentication to the IdP. It's gonna trigger the SAML flow.

> Note: in SAML the trust between SP and IdP is set up before any login happens, by exchanging metadata XML files. The SP already knows the IdP SSO URL and its public signing certificate, and the IdP already knows the SP `entityID` and the allowed ACS URLs. There is no `client_secret` like in OIDC, the trust is done through the certificates.

---

## 2. The SP generates a SAML AuthnRequest

Before redirecting the user, the SP builds an XML `<samlp:AuthnRequest>` and saves a couple of values server-side (usually in a session cookie) so it can correlate the future response:

- **ID**: a unique and un-bruteforceable identifier for this specific request. The IdP MUST echo it back in the response's `InResponseTo` attribute. The SP stores it and rejects any response that doesn't reference an `ID` it actually issued. Same idea as OIDC's `nonce`: it prevents replay attacks and unsolicited responses.

- **RelayState**: an opaque string the SP wants back untouched. Two typical uses: (1) remembering the original deep link (here `sp/protected/myresource`) so the SP knows where to send the user once auth is done, and (2) a CSRF-style correlation token. Same idea as OIDC's `state`.

- **Issuer**: the SP `entityID` so the IdP knows which SP is asking.

- **Destination**: the IdP SSO URL, baked **inside** the signed XML so an attacker can't redirect the AuthnRequest to a different IdP.

- **the ACS**: where the IdP is going to send the response back.

### AuthnRequest parameters
```text
ID=_a1b2c3d4

Version=2.0

IssueInstant=2026-05-24T12:00:00Z

Destination=idp_sso_url

AssertionConsumerServiceURL=sp_acs_url

ProtocolBinding=HTTP-POST

Issuer=sp_entity_id
```

---

## 3. Redirect to the IdP SSO endpoint

The SP doesn't send the raw XML. With the **HTTP-Redirect binding**, the AuthnRequest is **deflated**, then **base64-encoded**, then **URL-encoded**, and placed in the `SAMLRequest` query parameter. The SP then issues an HTTP 302 to the IdP SSO endpoint with two query params attached: the encoded `SAMLRequest` and the `RelayState` token.

### Redirect query parameters

```text
SAMLRequest=fZJBb4MwDIX...   (deflated + base64 + urlencoded)

RelayState=sp/protected/myresource
```

The user browser is now on its way to the IdP, carrying the request.

---

## 4. Browser arrives at the IdP

The user browser follows the redirect, making an HTTP GET to the IdP SSO endpoint, delivering the `SAMLRequest` and the `RelayState` as query params. If the SP signs its requests, two extra params come along.

### Query parameters received by the IdP

```text
SAMLRequest=fZJBb4MwDIX...

RelayState=sp/protected/myresource

SigAlg=rsa-sha256

Signature=Hk9d...
```

`Signature` is a **detached** signature computed over the query string. With the HTTP-Redirect binding the XML itself is compressed so it can't carry an XML signature directly, hence the detached one.

---

## 5. IdP validates the AuthnRequest

Before showing any login screen, the IdP checks:

- **Version**: must be `2.0`.

- **Signature**: if the SP signs its requests, verify it with the SP public X.509 cert from the SP metadata.

- **Issuer**: matches a known SP `entityID` registered on this IdP.

- **Destination**: matches the IdP's own SSO URL, so the request wasn't forged for another IdP and replayed here.

- **ACS URL**: the `AssertionConsumerServiceURL` must be one of the URLs pre-registered in the SP metadata. This is the most critical check, it's what prevents an attacker from rerouting the response to their own server.

- **ID**: must be unique and not already seen recently (replay protection).

If anything fails the IdP returns an error response and the flow stops.

---

## 6. User gives and sends creds

The IdP checks if the user already has an active SSO session (its own cookie on the IdP domain, completely separate from the SP). If not, it presents a login interface prompting the user for their creds (username, password, MFA, certificate, etc. depending on the IdP policy).

The IdP session is what makes **multi-app SSO** possible : the next time the user hits another SP federated to the same IdP, no login page.

---

## 7. IdP verifies credentials and generates a SAML Response

The user submits their creds. The IdP verifies them against its directory, evaluates any conditional access policies, and if everything is fine builds a `<samlp:Response>` containing exactly one `<saml:Assertion>`. The assertion is the actual token : it carries the user identity and is **digitally signed by the IdP private key**.

Key fields inside the assertion :

- **Issuer**: the IdP `entityID`.

- **Signature**: XML-DSig signature over the assertion (and/or the response). Computed with the IdP private key.

- **Subject / NameID**: the user identifier (email, persistent opaque ID, transient ID…).

- **SubjectConfirmation `bearer`** with a `Recipient` (must equal the SP ACS URL), a short `NotOnOrAfter`, and **`InResponseTo` = the AuthnRequest `ID`** from step 2. This is what binds the response to a real, pending request.

- **Conditions**: `NotBefore` / `NotOnOrAfter` validity window + an **`AudienceRestriction`** that must contain the SP `entityID`. Same idea as OIDC's `aud`: prevents an assertion minted for SP A from being replayed against SP B.

- **AuthnStatement**: when and how the user authenticated (`AuthnInstant`, `SessionIndex`, `AuthnContextClassRef`). The `SessionIndex` is what makes Single Logout (SLO) possible later.

- **AttributeStatement**: the user attributes (email, given name, groups, department…). Same idea as OIDC's claims.

The IdP can also wrap the whole assertion in `<EncryptedAssertion>` if the SP published an encryption cert, which is useful since the response transits through the browser.

---

## 8. Browser POSTs the response to the SP ACS

Unlike the request, the response uses the **HTTP-POST binding**, because the XML is too big and too sensitive for a URL. The IdP returns an HTTP 200 carrying a tiny HTML page that auto-submits via JavaScript to the SP ACS endpoint, with two form fields: the `SAMLResponse` (full XML, base64-encoded — no DEFLATE this time) and the `RelayState` echoed back as-is.

### Form fields POSTed to the SP ACS

```text
SAMLResponse=PHNhbWxwOlJlc3BvbnNl...   (base64-encoded XML)

RelayState=sp/protected/myresource
```

Important : IdP and SP never talk to each other directly during the flow. Everything goes through the user-agent (front-channel).

---

## 9. SP validates the SAML Response

This is the most security-critical step, and where most real-world SAML CVEs come from (XML signature wrapping, comment injection, missing audience checks…). The SP must :

- **Decode the base64** assertion to get the raw XML.

- **Signature**: verify the `<ds:Signature>` with the IdP public key from the IdP metadata. Reject unsigned assertions, and make sure the validated node is the same one used downstream (anti signature-wrapping).

- **Decrypt** the assertion if it came as `<EncryptedAssertion>`, using the SP private key.

- **Issuer**: matches the IdP `entityID` declared in the IdP metadata.

- **Destination**: matches the SP ACS URL.

- **Conditions**: current time is inside `[NotBefore, NotOnOrAfter]` (with small clock skew), and **`AudienceRestriction`** contains the SP `entityID`.

- **InResponseTo**: must equal the `ID` the SP issued in step 2 and that hasn't been consumed yet, then mark it as consumed (one-shot, replay protection).

After those verifications, the Service Provider can trust the assertion :

- **NameID** contains the main username as furnished by the IdP. Used as the stable user identifier (the SAML equivalent of OIDC's `sub`). Based on it, the SP either logs in an existing local account or creates a new one on the fly (**JIT provisioning**).

- **AttributeStatement** contains the other attributes used to enrich the user profile and take authorization decisions (groups, roles, department…).

---

## 10. SP establishes the local session

Now that the user is fully authenticated, the SP issues its own local application session and redirects the browser back to the original deep link kept in `RelayState`:

```text
HTTP/1.1 302 Found
Location: sp/protected/myresource
Set-Cookie: sp_session_cookie=<SESSION_ID_VALUE>; Path=/; HttpOnly; Secure
```

The SAML assertion itself is **not** kept around as a credential, it was a one-shot proof of authentication. From now on the SP authenticates the user with its own session cookie, completely independently from the IdP.

---

## 11. User finally gets the resource

```text
GET sp/protected/myresource
Cookie: sp_session_cookie=<SESSION_ID_VALUE>
```

The SP sees a valid session cookie, no SAML round-trip needed, and serves the protected resource. The user lands on the page they originally tried to access, fully logged in.
